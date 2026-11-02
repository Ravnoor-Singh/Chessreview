'use client';

import { useEffect, useRef, useState } from 'react';
import { StockfishClient } from '@/engine/stockfish.worker';
import { EnginePool, POOL_HASH_MB, poolSizeForHardware } from '@/engine/pool';
import type { EngineMode } from '@/lib/types';
import { useAnalysisStore } from '@/store/analysisStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatEngineError } from '@/engine/engineErrors';

let sharedClient: StockfishClient | null = null;
let initPromise: Promise<StockfishClient> | null = null;
let sharedPool: EnginePool | null = null;
let sharedPoolMode: EngineMode | null = null;

/**
 * Test-only introspection (Round 2, Prompt 4): the engine configuration the
 * app ACTUALLY negotiated at runtime — build mode, build file, thread count
 * and hash of the primary client, and the fallback pool's size once a pool
 * exists. Exposed as `window.__engineDebug()` so the Playwright pool spec
 * can assert that cross-origin isolation selects the multi-threaded build
 * and that a non-isolated page really falls back to the single-thread pool
 * — the fallback path unit tests could previously only simulate with fake
 * engines (known issue K5). Read-only snapshot; inert in normal use.
 */
export interface EngineDebugInfo {
  /** Negotiated mode / build file / threads / hash of the primary client. */
  mode: EngineMode | null;
  buildFile: string | null;
  threads: number | null;
  hashMb: number | null;
  /** Fallback pool configuration; null fields while no pool exists (multi). */
  poolSize: number | null;
  poolClientCount: number | null;
  poolThreads: number | null;
  poolHashMb: number | null;
}

const engineDebugState: EngineDebugInfo = {
  mode: null,
  buildFile: null,
  threads: null,
  hashMb: null,
  poolSize: null,
  poolClientCount: null,
  poolThreads: null,
  poolHashMb: null,
};

if (typeof window !== 'undefined') {
  const w = window as unknown as { __engineDebug?: () => EngineDebugInfo };
  w.__engineDebug = () => ({
    ...engineDebugState,
    poolClientCount: sharedPool ? sharedPool.clientCount : engineDebugState.poolClientCount,
  });
}

export function getEngineClient(): Promise<StockfishClient> {
  if (!initPromise) {
    sharedClient = new StockfishClient();
    const client = sharedClient;
    try {
      const { settings } = useSettingsStore.getState();
      if (settings.threads > 0) client.threadOverride = settings.threads;
      if (settings.hashMb > 0) client.hashOverride = settings.hashMb;
      client.buildPreference = settings.engineBuild ?? 'auto';
    } catch {
      // settings unavailable; auto values apply
    }
    client.onLoadProgress = (percent) => {
      useAnalysisStore.getState().setEngineLoadProgress(percent);
    };
    initPromise = client
      .init()
      .then((info) => {
        engineDebugState.mode = info.mode;
        engineDebugState.buildFile = info.buildFile || null;
        engineDebugState.threads = client.threads;
        engineDebugState.hashMb = client.hashMb;
        const store = useAnalysisStore.getState();
        store.setEngine(info.engineName, info.mode);
        store.setEngineDetails({
          buildFile: info.buildFile || null,
          wasmSize: info.wasmSize,
          version: info.engineVersion,
        });
        store.setEngineLoadProgress(null);
        return client;
      })
      .catch((e: unknown) => {
        // Allow a later call to retry with a fresh client.
        initPromise = null;
        sharedClient = null;
        useAnalysisStore.getState().setEngineLoadProgress(null);
        throw e;
      });
  }
  return initPromise;
}

/**
 * The parallel pool for single-thread / lite mode: up to
 * min(4, hardwareConcurrency − 1) single-thread clients, Hash 32 MB each,
 * analyzing different positions concurrently (results still arrive in ply
 * order — see pool.ts). Returns null in multi-thread mode, where exactly
 * one multi-threaded client is used and no pool exists.
 */
export function getEnginePool(mode: EngineMode): EnginePool | null {
  if (mode === 'multi') return null;
  if (sharedPool && sharedPoolMode === mode) return sharedPool;
  sharedPool?.terminate();
  sharedPoolMode = mode;
  const size = poolSizeForHardware(
    typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
  );
  engineDebugState.poolSize = size;
  engineDebugState.poolThreads = 1; // pool clients are created with threadOverride = 1 below
  engineDebugState.poolHashMb = POOL_HASH_MB; // …and hashOverride = POOL_HASH_MB
  sharedPool = new EnginePool({
    size,
    createClient: async () => {
      const client = new StockfishClient();
      client.buildPreference = mode;
      client.threadOverride = 1;
      client.hashOverride = POOL_HASH_MB;
      await client.init();
      return client;
    },
  });
  return sharedPool;
}

/** React hook exposing engine readiness; the client itself is a singleton. */
export function useEngine(): { ready: boolean; error: string | null; loadProgress: number | null } {
  const [ready, setReady] = useState(false);
  // Keep the RAW thrown value, not a pre-rendered string: engine
  // failures are structured errors (see engineErrors.ts) and the
  // user-visible sentence is composed in the active locale below, at
  // render time — so it follows the locale even if the failure
  // happened before a language switch.
  const [rawError, setRawError] = useState<{ value: unknown } | null>(null);
  const locale = useSettingsStore((s) => s.settings.locale) ?? 'en';
  const loadProgress = useAnalysisStore((s) => s.engineLoadProgress);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Deferred engine start (Round 2, Prompt 6): compiling the ~10 MB
    // Stockfish WASM on mount competed with hydration and cost seconds
    // of main-thread time on throttled devices (Lighthouse TBT on
    // /review measured ~6.2 s). The engine now starts at the first of:
    // the browser going idle (2.5 s cap), or the user's first pointer /
    // keyboard interaction. Any code path that actually needs the engine
    // (Start Review, live exploration) calls getEngineClient() directly
    // and starts the load immediately, so this only defers the PRELOAD.
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      getEngineClient()
        .then(() => {
          if (mounted.current) setReady(true);
        })
        .catch((e: unknown) => {
          if (mounted.current) setRawError({ value: e });
        });
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    let idleId: number | undefined;
    let timerId: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(start, { timeout: 2500 });
    } else {
      timerId = window.setTimeout(start, 1200);
    }
    return () => {
      mounted.current = false;
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, []);

  const error = rawError ? formatEngineError(locale, rawError.value) : null;
  return { ready, error, loadProgress };
}
