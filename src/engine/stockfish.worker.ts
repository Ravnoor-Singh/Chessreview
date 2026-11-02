// Stockfish engine client (spec 5.1 / 2.1).
//
// The `stockfish` npm package ships engine builds that ARE Web Worker scripts:
// you create `new Worker('/engine/stockfish-19.js')` and exchange raw UCI
// strings with it. This module wraps that worker in the typed request/response
// API from the spec (init / analyze / stop / setOption + ready / info / done /
// error events), selects the multi-threaded build when cross-origin isolated
// and falls back to single-threaded (or lite) builds automatically.
//
// Payload handling (Prompt 2): before the worker is constructed, the chosen
// build's .wasm is downloaded with progress + SHA-256 verification against
// public/engine/engine-manifest.json (see engineLoader.ts). If a build fails
// to load, init falls back multi → single → lite and only surfaces an error
// when every build fails (an integrity mismatch is a hard error instead).

import type { EngineLine, EngineMode } from '@/lib/types';
import {
  buildPositionCommand,
  mergeInfoLine,
  parseBestMove,
  parseEngineName,
  parseInfoLine,
} from './uci';
import {
  DEFAULT_ENGINE_BASE_URL,
  EngineIntegrityError,
  buildCdnWorkerSource,
  fallbackOrder,
  filterFallbackOrder,
  getEngineBaseUrl,
  isCrossOriginEngineBase,
  isMobileUserAgent,
  normalizeEngineBaseUrl,
  resolveEngineUrls,
  type EngineBuildPreference,
} from './engineManifest';
import { EngineLoadError, type EngineBuildFailure } from './engineErrors';
import { loadEngineManifest, prepareEngineBuild, type LoadProgressFn } from './engineLoader';

export type EngineRequest =
  | { type: 'init' }
  | {
      type: 'analyze';
      id: string;
      fen: string;
      depth: number;
      movetimeMs?: number;
      multiPv: number;
    }
  | { type: 'stop' }
  | { type: 'setOption'; name: string; value: string | number | boolean };

export type EngineResponse =
  | { type: 'ready'; engineName: string; threads: number; mode: EngineMode }
  | { type: 'info'; id: string; lines: EngineLine[]; depth: number; nodes: number; nps: number }
  | { type: 'done'; id: string; best: string; ponder?: string; lines: EngineLine[] }
  | { type: 'error'; message: string };

export interface EngineBuildChoice {
  /** JS worker URL (same value as jsUrl; kept for the original callers). */
  url: string;
  jsUrl: string;
  wasmUrl: string;
  jsFile: string;
  wasmFile: string;
  baseUrl: string;
  mode: EngineMode;
  threads: number;
  hashMb: number;
  preference: EngineBuildPreference;
  /** Set when a user preference could not be honored and a fallback was used. */
  note?: string;
}

export interface EngineEnv {
  crossOriginIsolated: boolean;
  hasSharedArrayBuffer: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  /** Explicit mobile hint; derived from `userAgent` when omitted. */
  isMobile?: boolean;
  userAgent?: string;
  /** Settings override; 'auto' (default) uses the capability rules. */
  preference?: EngineBuildPreference;
  /** Engine base URL; defaults to '/engine'. */
  baseUrl?: string;
}

interface EngineChoiceEnv {
  hardwareConcurrency: number;
  deviceMemory?: number;
  baseUrl?: string;
  preference?: EngineBuildPreference;
}

/** Build the choice object for one specific mode (used for fallbacks). */
export function choiceForMode(mode: EngineMode, env: EngineChoiceEnv): EngineBuildChoice {
  const baseUrl = normalizeEngineBaseUrl(env.baseUrl ?? DEFAULT_ENGINE_BASE_URL);
  const urls = resolveEngineUrls(baseUrl, mode);
  const threads =
    mode === 'multi' ? Math.max(1, Math.min((env.hardwareConcurrency || 2) - 1, 8)) : 1;
  const hashMb = mode === 'lite' ? 32 : (env.deviceMemory ?? 8) <= 4 ? 32 : 128;
  return {
    url: urls.jsUrl,
    jsUrl: urls.jsUrl,
    wasmUrl: urls.wasmUrl,
    jsFile: urls.jsFile,
    wasmFile: urls.wasmFile,
    baseUrl,
    mode,
    threads,
    hashMb,
    preference: env.preference ?? 'auto',
  };
}

/**
 * Decide which build to load from the runtime environment. Pure + testable.
 *
 * Rules: lite when the device reports ≤ 2 GB memory (always — it is the only
 * build that fits comfortably); multi only when cross-origin isolated AND
 * SharedArrayBuffer is present AND reported memory is ≥ 4 GB (or unreported)
 * AND the device is not a low-end mobile; otherwise single. A user preference
 * beats auto, except multi can never be forced when its requirements are not
 * met — the choice then falls back and carries a `note` explaining why.
 */
export function selectEngineBuild(env: EngineEnv): EngineBuildChoice {
  const isMobile = env.isMobile ?? (env.userAgent ? isMobileUserAgent(env.userAgent) : false);
  const lowMemory = (env.deviceMemory ?? 8) <= 2;
  const multiOk =
    env.crossOriginIsolated &&
    env.hasSharedArrayBuffer &&
    (env.deviceMemory === undefined || env.deviceMemory >= 4) &&
    !isMobile;
  const autoMode: EngineMode = lowMemory ? 'lite' : multiOk ? 'multi' : 'single';
  const preference = env.preference ?? 'auto';

  let mode: EngineMode;
  let note: string | undefined;
  if (lowMemory) {
    mode = 'lite';
    if (preference !== 'auto' && preference !== 'lite') {
      note = 'Lite build used: this device reports 2 GB of memory or less.';
    }
  } else if (preference === 'lite' || preference === 'single') {
    mode = preference;
  } else if (preference === 'multi') {
    if (multiOk) {
      mode = 'multi';
    } else {
      mode = autoMode;
      note =
        'Multi-threaded build is unavailable here (it needs cross-origin isolation, ' +
        'SharedArrayBuffer, at least 4 GB of reported memory and a non-mobile browser) — fell back automatically.';
    }
  } else {
    mode = autoMode;
  }

  const choice = choiceForMode(mode, env);
  return note ? { ...choice, note } : choice;
}

/**
 * Construct the engine worker for a choice. Same-origin bases use the direct
 * URL (the proven path). Cross-origin bases (CDN) cannot be constructed
 * directly in some browsers, so a same-origin Blob wrapper worker
 * `importScripts` the engine script and carries the WASM URL in its location
 * hash, which is how the packaged builds resolve their .wasm.
 */
export function createEngineWorker(choice: EngineBuildChoice): Worker {
  if (isCrossOriginEngineBase(choice.baseUrl)) {
    const source = buildCdnWorkerSource(choice.jsUrl);
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    return new Worker(`${blobUrl}#${encodeURIComponent(choice.wasmUrl)}`);
  }
  return new Worker(choice.jsUrl);
}

export interface EngineInitResult {
  engineName: string;
  threads: number;
  mode: EngineMode;
  buildFile: string;
  wasmFile: string;
  wasmSize: number | null;
  engineVersion: string | null;
}

const UCI_TIMEOUT_MS = 90_000;
const READY_TIMEOUT_MS = 30_000;

interface ActiveSearch {
  id: string;
  lines: EngineLine[];
  stopping: boolean;
  done: Promise<{ best: string; ponder?: string; lines: EngineLine[]; stopped: boolean }>;
  resolve: (r: { best: string; ponder?: string; lines: EngineLine[]; stopped: boolean }) => void;
  onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void;
}

let searchSeq = 0;

export class StockfishClient {
  private worker: Worker | null = null;
  private listeners = new Set<(r: EngineResponse) => void>();
  private active: ActiveSearch | null = null;
  private readyWaiters: (() => void)[] = [];
  private uciOkWaiter: (() => void) | null = null;
  private uciRejecter: ((e: Error) => void) | null = null;
  private currentMultiPv = 0;
  engineName = 'Stockfish';
  mode: EngineMode = 'single';
  threads = 1;
  hashMb = 128;
  /** Optional user overrides from Settings (0/undefined = auto). */
  threadOverride = 0;
  hashOverride = 0;
  /** Settings override for the build selection ('auto' by default). */
  buildPreference: EngineBuildPreference = 'auto';
  /** Engine base URL override; null resolves NEXT_PUBLIC_ENGINE_BASE_URL. */
  baseUrl: string | null = null;
  /** WASM download progress (0–100, or null when indeterminate) during init. */
  onLoadProgress: LoadProgressFn | null = null;
  /** Details of the build that actually started (for the footer). */
  buildFile = '';
  wasmFile = '';
  wasmSize: number | null = null;
  engineVersion: string | null = null;
  /** Explanation when a preference could not be honored, if any. */
  buildNote: string | null = null;

  on(fn: (r: EngineResponse) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(r: EngineResponse): void {
    this.listeners.forEach((fn) => fn(r));
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private currentResult(): EngineInitResult {
    return {
      engineName: this.engineName,
      threads: this.threads,
      mode: this.mode,
      buildFile: this.buildFile,
      wasmFile: this.wasmFile,
      wasmSize: this.wasmSize,
      engineVersion: this.engineVersion,
    };
  }

  /** Spawn the worker and run the UCI handshake + option setup (spec 2.1). */
  async init(): Promise<EngineInitResult> {
    if (this.worker) return this.currentResult();
    const baseUrl = this.baseUrl ?? getEngineBaseUrl();
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const env: EngineEnv = {
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      hardwareConcurrency: nav?.hardwareConcurrency || 2,
      deviceMemory: (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory,
      userAgent: nav?.userAgent,
      preference: this.buildPreference,
      baseUrl,
    };
    const initial = selectEngineBuild(env);
    this.buildNote = initial.note ?? null;
    // Prompt 7: fetch the manifest once and restrict the fallback walk to
    // builds this deployment actually shipped, so an unshipped build is
    // skipped instantly instead of being discovered via a failed (or, on
    // SPA-fallback hosts, misleadingly successful) file request.
    const manifest = await loadEngineManifest(baseUrl);
    const order = filterFallbackOrder(fallbackOrder(initial.mode), manifest);
    const failures: EngineBuildFailure[] = [];
    for (const mode of order) {
      const choice = mode === initial.mode ? initial : choiceForMode(mode, env);
      try {
        const prepared = await prepareEngineBuild(
          baseUrl,
          mode,
          this.onLoadProgress ?? undefined,
          manifest,
        );
        await this.startWorker(choice);
        this.buildFile = choice.jsFile;
        this.wasmFile = choice.wasmFile;
        this.wasmSize = prepared.wasmSize;
        this.engineVersion = prepared.version;
        const ready = this.currentResult();
        this.emit({
          type: 'ready',
          engineName: ready.engineName,
          threads: ready.threads,
          mode: ready.mode,
        });
        return ready;
      } catch (e) {
        this.teardownWorker();
        if (e instanceof EngineIntegrityError) throw e;
        failures.push({
          mode,
          file: choice.jsFile,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
    // Structured error (see engineErrors.ts): the client/UI recomposes
    // this in the active locale at render time; the English message on
    // the error itself is only a fallback for non-localizing consumers.
    throw new EngineLoadError(order, failures);
  }

  private teardownWorker(): void {
    try {
      this.worker?.terminate();
    } catch {
      // worker may already be gone
    }
    this.worker = null;
    this.uciOkWaiter = null;
    this.uciRejecter = null;
    this.readyWaiters = [];
  }

  private async startWorker(choice: EngineBuildChoice): Promise<void> {
    this.mode = choice.mode;
    this.threads =
      this.threadOverride > 0 ? Math.max(1, Math.min(this.threadOverride, 8)) : choice.threads;
    this.hashMb = this.hashOverride > 0 ? this.hashOverride : choice.hashMb;

    const worker = createEngineWorker(choice);
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') this.handleLine(e.data);
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || `Engine worker error (${choice.jsFile})`);
      if (this.uciRejecter) {
        const reject = this.uciRejecter;
        this.uciRejecter = null;
        this.uciOkWaiter = null;
        reject(err);
      } else {
        this.emit({ type: 'error', message: err.message });
      }
    };

    const uciDone = new Promise<void>((res, rej) => {
      this.uciOkWaiter = res;
      this.uciRejecter = rej;
    });
    const timeout = new Promise<never>((_res, rej) => {
      setTimeout(
        () =>
          rej(
            new Error(`Engine did not respond within ${UCI_TIMEOUT_MS / 1000}s (${choice.jsFile})`),
          ),
        UCI_TIMEOUT_MS,
      );
    });
    this.send('uci');
    try {
      await Promise.race([uciDone, timeout]);
    } finally {
      this.uciRejecter = null;
      this.uciOkWaiter = null;
    }

    this.setOption('Threads', this.threads);
    this.setOption('Hash', this.hashMb);
    this.setOption('MultiPV', 3);
    this.currentMultiPv = 3;
    this.setOption('UCI_AnalyseMode', true);
    this.setOption('UCI_ShowWDL', true);
    await this.waitReady();
  }

  private waitReady(): Promise<void> {
    const ready = new Promise<void>((res) => {
      this.readyWaiters.push(res);
      this.send('isready');
    });
    const timeout = new Promise<never>((_res, rej) => {
      setTimeout(() => rej(new Error('Engine did not answer isready in time')), READY_TIMEOUT_MS);
    });
    return Promise.race([ready, timeout]);
  }

  private handleLine(line: string): void {
    if (line.startsWith('id name')) {
      const name = parseEngineName(line);
      if (name) this.engineName = name;
      return;
    }
    if (line === 'uciok') {
      this.uciOkWaiter?.();
      this.uciOkWaiter = null;
      this.uciRejecter = null;
      return;
    }
    if (line === 'readyok') {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      waiters.forEach((fn) => fn());
      return;
    }
    const active = this.active;
    if (!active) return;
    const info = parseInfoLine(line);
    if (info) {
      active.lines = mergeInfoLine(active.lines, info);
      const top = active.lines[0];
      active.onInfo?.(active.lines, info.depth, top?.nodes ?? 0, top?.nps ?? 0);
      this.emit({
        type: 'info',
        id: active.id,
        lines: active.lines,
        depth: info.depth,
        nodes: top?.nodes ?? 0,
        nps: top?.nps ?? 0,
      });
      return;
    }
    const best = parseBestMove(line);
    if (best) {
      this.active = null;
      this.emit({
        type: 'done',
        id: active.id,
        best: best.best,
        ponder: best.ponder,
        lines: active.lines,
      });
      active.resolve({
        best: best.best,
        ponder: best.ponder,
        lines: active.lines,
        stopped: active.stopping,
      });
    }
  }

  setOption(name: string, value: string | number | boolean): void {
    this.send(`setoption name ${name} value ${value}`);
  }

  async newGame(): Promise<void> {
    this.send('ucinewgame');
    await this.waitReady();
  }

  /**
   * Analyze one position. Serializes naturally: callers must await (or stop)
   * before starting the next search; the analyzer queue does this.
   */
  async analyze(
    req: {
      fen: string;
      depth: number;
      movetimeMs?: number;
      multiPv: number;
      history?: { startFen: string; movesUci: string[] };
    },
    onInfo?: ActiveSearch['onInfo'],
  ): Promise<{ best: string; ponder?: string; lines: EngineLine[]; stopped: boolean }> {
    if (!this.worker) throw new Error('Engine not initialized');
    // Never interleave searches: stop any running one and wait for its
    // bestmove so a stale bestmove can't be mistaken for this search's.
    if (this.active) {
      const prev = this.active;
      this.stop();
      await prev.done;
    }
    const id = `search-${++searchSeq}`;
    if (req.multiPv !== this.currentMultiPv) {
      this.setOption('MultiPV', req.multiPv);
      this.currentMultiPv = req.multiPv;
    }
    let resolveFn!: ActiveSearch['resolve'];
    const done = new Promise<{
      best: string;
      ponder?: string;
      lines: EngineLine[];
      stopped: boolean;
    }>((res) => {
      resolveFn = res;
    });
    this.active = { id, lines: [], stopping: false, done, resolve: resolveFn, onInfo };
    this.send(buildPositionCommand(req.fen, req.history));
    const movetime = req.movetimeMs ? ` movetime ${req.movetimeMs}` : '';
    this.send(`go depth ${req.depth}${movetime}`);
    return done;
  }

  /** Stop the current search; its promise resolves (stopped) on bestmove. */
  stop(): void {
    const active = this.active;
    if (!active || active.stopping) return;
    active.stopping = true;
    this.send('stop');
  }

  terminate(): void {
    const active = this.active;
    this.active = null;
    if (active) active.resolve({ best: '', lines: active.lines, stopped: true });
    try {
      this.send('quit');
    } catch {
      // worker may already be gone
    }
    this.worker?.terminate();
    this.worker = null;
  }
}
