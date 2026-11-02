// Real-browser analysis benchmark (Round 2, Prompt 3).
//
//   node scripts/bench-browser.mjs [--only multi|single] [--fixtures opera,41,86]
//
// Runs the REAL app origin in Chromium (Playwright) with the REAL
// Stockfish 19 WASM builds served by the app itself:
//   - multi:  one worker from /engine/stockfish-19.js, Threads = cores−1,
//             Hash 128 MB — exactly the app's multi-thread configuration;
//   - single: a pool of min(4, cores−1) workers from
//             /engine/stockfish-19-single.js, Hash 32 MB each — the app's
//             single-thread fallback configuration (src/engine/pool.ts).
//
// The adaptive budget logic is NOT reimplemented: the page dynamically
// imports the exact src/engine/budgetRules.mjs source (blob URL), so the
// stability stop, critical re-analysis (swing / late change / best move
// fell out of the top-3) and like-for-like depth matching exercised here
// are the app's rules. Results are written incrementally to
// PERFORMANCE_BASELINE.raw.json in this directory's parent (repo root)
// so a long run leaves partial data behind, and classification agreement
// vs a fixed depth-18 pass is computed with the production classifier
// (scripts/calibrate-entry.ts, bundled on the fly like calibrate.mjs).
//
// Numbers reflect THIS machine; the hardware line is printed and must be
// quoted with the results (see PERFORMANCE_BASELINE.md).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { chromium } from 'playwright';
import { BUDGET_PROFILES } from '../src/engine/budgetRules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const FIXTURES = [
  { id: 'opera', label: 'Opera Game (Morphy, 1858) — 17 moves', file: 'sample-opera.pgn' },
  { id: '41', label: 'Lichess h6veisdc — 41 moves', file: 'lichess-41move.pgn' },
  { id: '86', label: 'Lichess 2cj9hphe — 86 moves', file: 'lichess-86move.pgn' },
];
const FIXED_DEPTH = 18;
const OUT_PATH = join(root, 'PERFORMANCE_BASELINE.raw.json');

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const onlyMode = argVal('--only');
const onlyFixtures = argVal('--fixtures')?.split(',') ?? null;
const onlyPresets = argVal('--presets')?.split(',') ?? ['quick', 'standard', 'deep'];
const skipFixed = args.includes('--skip-fixed');

// ---------------------------------------------------------------------------
// Page-side harness. Runs inside Chromium; `rules` is the app's own
// budgetRules.mjs module, imported from a blob URL.
// ---------------------------------------------------------------------------
function pageHarness() {
  const parseInfo = (line) => {
    if (!line.startsWith('info ') || !line.includes(' depth ') || line.includes(' string'))
      return null;
    const tokens = line.split(/\s+/);
    const out = { pv: [] };
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'depth') out.depth = Number(tokens[++i]);
      else if (t === 'multipv') out.multipv = Number(tokens[++i]);
      else if (t === 'nodes') out.nodes = Number(tokens[++i]);
      else if (t === 'nps') out.nps = Number(tokens[++i]);
      else if (t === 'score') {
        const kind = tokens[++i];
        const val = Number(tokens[++i]);
        if (kind === 'cp') out.scoreCp = val;
        else if (kind === 'mate') out.scoreMate = val;
      } else if (t === 'pv') {
        out.pv = tokens.slice(i + 1);
        break;
      }
    }
    if (out.depth === undefined || out.multipv === undefined) return null;
    if (out.scoreCp === undefined && out.scoreMate === undefined) return null;
    return out;
  };

  class Eng {
    constructor(url, threads, hashMb, rules) {
      this.rules = rules;
      this.threads = threads;
      this.hashMb = hashMb;
      this.w = new Worker(url);
      this.waiters = [];
      this.search = null;
      this.name = 'Stockfish';
      this.w.onmessage = (e) => this.onLine(String(e.data));
    }
    send(cmd) {
      this.w.postMessage(cmd);
    }
    waitFor(pred) {
      return new Promise((resolve) => this.waiters.push({ pred, resolve }));
    }
    onLine(line) {
      if (line.startsWith('id name ')) this.name = line.slice(8).trim();
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(line)) {
          w.resolve(line);
          return false;
        }
        return true;
      });
      const s = this.search;
      if (!s) return;
      const info = parseInfo(line);
      if (info) {
        const prev = s.lines.get(info.multipv);
        if (!prev || info.depth >= prev.depth) s.lines.set(info.multipv, info);
        if (info.multipv === 1 && info.pv.length > 0 && s.tracker) {
          const decision = s.tracker.observe({
            depth: info.depth,
            bestMove: info.pv[0],
            scoreCp: this.rules.trackerScoreCp(info.scoreCp, info.scoreMate),
          });
          if (decision === 'stop' && !s.stopSent) {
            s.stopSent = true;
            this.send('stop');
          }
        }
        return;
      }
      if (line.startsWith('bestmove')) {
        const done = this.search;
        this.search = null;
        done.resolve(done.lines);
      }
    }
    async init() {
      const uciok = this.waitFor((l) => l === 'uciok');
      this.send('uci');
      await uciok;
      this.send(`setoption name Threads value ${this.threads}`);
      this.send(`setoption name Hash value ${this.hashMb}`);
      this.send(`setoption name MultiPV value ${3}`);
      this.send('setoption name UCI_AnalyseMode value true');
      const ready = this.waitFor((l) => l === 'readyok');
      this.send('isready');
      await ready;
    }
    async newGame() {
      this.send('ucinewgame');
      const ready = this.waitFor((l) => l === 'readyok');
      this.send('isready');
      await ready;
    }
    runSearch(fen, { depth, movetimeMs, tracker }) {
      return new Promise((resolve) => {
        const watchdog = setTimeout(() => {
          if (this.search) {
            this.search.stopSent = true;
            this.send('stop');
          }
        }, 180000);
        const started = performance.now();
        this.search = {
          lines: new Map(),
          tracker: tracker ?? null,
          stopSent: false,
          resolve: (lines) => {
            clearTimeout(watchdog);
            resolve({ lines, ms: performance.now() - started });
          },
        };
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}${movetimeMs ? ` movetime ${movetimeMs}` : ''}`);
      });
    }
    async analyzeAdaptive(fen, profile) {
      const tracker = this.rules.createBudgetTracker(profile);
      const { lines, ms } = await this.runSearch(fen, {
        depth: profile.targetDepth,
        movetimeMs: profile.ceilingMs,
        tracker,
      });
      const summary = summarize(lines);
      const st = tracker.state();
      return {
        ...summary,
        ms,
        lateBestMoveChange: st.lateBestMoveChange,
        earlyBestMove: st.earlyBestMove,
        bestMoveFellOut: this.rules.bestMoveFellOutOfTop3(st.earlyBestMove, summary.topFirstMoves),
      };
    }
    async analyzeFull(fen, profile) {
      const tracker = this.rules.createBudgetTracker({
        targetDepth: profile.targetDepth,
        minDepth: profile.targetDepth,
      });
      const { lines, ms } = await this.runSearch(fen, {
        depth: profile.targetDepth,
        movetimeMs: profile.ceilingMs,
        tracker,
      });
      return { ...summarize(lines), ms };
    }
    async analyzeFixed(fen, depth) {
      const { lines, ms } = await this.runSearch(fen, {
        depth,
        movetimeMs: undefined,
        tracker: null,
      });
      return { ...summarize(lines), ms };
    }
  }

  function summarize(linesByPv) {
    const lines = [...linesByPv.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .map((l) => ({
        multipv: l.multipv,
        depth: l.depth,
        scoreCp: l.scoreCp ?? null,
        scoreMate: l.scoreMate ?? null,
        pv: l.pv,
        nodes: l.nodes ?? null,
        nps: l.nps ?? null,
      }));
    const top = lines[0];
    return {
      lines,
      depth: lines.reduce((m, l) => Math.max(m, l.depth), 0),
      nodes: top?.nodes ?? 0,
      nps: top?.nps ?? 0,
      topFirstMoves: lines.map((l) => l.pv[0]).filter(Boolean),
    };
  }

  return { Eng, summarize };
}

// ---------------------------------------------------------------------------
// Node side.
// ---------------------------------------------------------------------------

function positionsOf(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const fens = [history[0].before, ...history.map((h) => h.after)];
  return fens.map((fen, i) => {
    const c = new Chess(fen);
    const terminal =
      c.isCheckmate() ||
      c.isStalemate() ||
      c.isDraw() ||
      c.isThreefoldRepetition() ||
      c.isInsufficientMaterial();
    const move =
      i === 0
        ? null
        : {
            san: history[i - 1].san,
            uci: history[i - 1].from + history[i - 1].to + (history[i - 1].promotion ?? ''),
            from: history[i - 1].from,
            to: history[i - 1].to,
            captured: history[i - 1].captured ?? null,
            promotion: history[i - 1].promotion ?? null,
          };
    return { fen, terminal, legalMoves: terminal ? 0 : c.moves().length, move };
  });
}

async function ensureServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return null;
  } catch {
    /* not running */
  }
  if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
    throw new Error('No production build found — run `npm run build` first.');
  }
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) },
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return child;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Server did not come up on port ' + PORT);
}

// Resume support: a previous (interrupted) run's incremental results are
// kept and merged, so re-running only fills in what is missing.
const results = existsSync(OUT_PATH)
  ? JSON.parse(readFileSync(OUT_PATH, 'utf8'))
  : {
      machine: {
        cpu: cpus()[0]?.model ?? 'unknown',
        cores: cpus().length,
        ramGB: Number((totalmem() / 2 ** 30).toFixed(1)),
        node: process.version,
      },
      browser: null,
      modes: {},
    };
results.machine = {
  cpu: cpus()[0]?.model ?? 'unknown',
  cores: cpus().length,
  ramGB: Number((totalmem() / 2 ** 30).toFixed(1)),
  node: process.version,
};

function saveResults() {
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 1));
}

function statsOf(records) {
  const searched = records.filter((r) => r.searched);
  const depths = searched.map((r) => r.depth).sort((a, b) => a - b);
  const mean = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
  const median = depths.length
    ? depths.length % 2 === 1
      ? depths[(depths.length - 1) / 2]
      : (depths[depths.length / 2 - 1] + depths[depths.length / 2]) / 2
    : 0;
  const p10 = depths.length
    ? (depths[Math.max(0, Math.floor(depths.length * 0.1) - 1)] ?? depths[0])
    : 0;
  const totalMs = searched.reduce((a, r) => a + r.ms, 0);
  const totalNodes = searched.reduce((a, r) => a + (r.nodes ?? 0), 0);
  return {
    positions: records.length,
    searched: searched.length,
    totalSec: Number((totalMs / 1000).toFixed(1)),
    meanDepth: Number(mean.toFixed(2)),
    medianDepth: median,
    p10Depth: p10,
    nodesPerSec: totalMs > 0 ? Math.round(totalNodes / (totalMs / 1000)) : 0,
    critical: searched.filter((r) => r.critical).length,
    depthMatched: searched.filter((r) => r.depthMatched).length,
  };
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // The app's CSP (script-src 'self') forbids blob:/data: module
    // imports, so the budget-rules source is served back to the page
    // under a same-origin path via route interception — the bytes are
    // read verbatim from src/engine/budgetRules.mjs below.
    const rulesSrcEarly = readFileSync(join(root, 'src', 'engine', 'budgetRules.mjs'), 'utf8');
    await page.route('**/__bench_rules__.mjs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        headers: { 'Cross-Origin-Resource-Policy': 'same-origin' },
        body: rulesSrcEarly,
      }),
    );
    // Same treatment for the harness itself: CSP forbids eval, so it is
    // delivered as a same-origin module rather than eval'd from a string.
    await page.route('**/__bench_harness__.mjs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        headers: { 'Cross-Origin-Resource-Policy': 'same-origin' },
        body: `const harnessFn = ${pageHarness.toString()};\nexport default harnessFn;\n`,
      }),
    );
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const env = await page.evaluate(() => ({
      crossOriginIsolated: window.crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency,
      userAgent: navigator.userAgent,
    }));
    results.browser = { ...env, version: browser.version() };
    console.log(
      `Machine: ${results.machine.cpu} · ${results.machine.cores} cores · ${results.machine.ramGB} GB RAM`,
    );
    console.log(
      `Chromium: ${browser.version()} · crossOriginIsolated=${env.crossOriginIsolated} · hardwareConcurrency=${env.hardwareConcurrency}`,
    );
    if (!env.crossOriginIsolated) {
      console.log(
        'WARNING: page is NOT cross-origin isolated — multi-thread mode will be invalid.',
      );
    }

    await page.evaluate(async () => {
      const rules = await import('/__bench_rules__.mjs');
      const { default: harnessFn } = await import('/__bench_harness__.mjs');
      const { Eng } = harnessFn();
      window.__bench = { rules, Eng, engines: {} };
    });

    const modes = [
      {
        id: 'multi',
        build: '/engine/stockfish-19.js',
        threads: Math.max(1, Math.min(env.hardwareConcurrency - 1, 8)),
        hashMb: 128,
        poolSize: 1,
      },
      {
        id: 'single',
        build: '/engine/stockfish-19-single.js',
        threads: 1,
        hashMb: 32,
        poolSize: Math.max(1, Math.min(4, env.hardwareConcurrency - 1)),
      },
    ];

    for (const mode of modes) {
      if (onlyMode && mode.id !== onlyMode) continue;
      console.log(
        `\n=== Mode: ${mode.id} (build ${mode.build}, threads ${mode.threads}, pool ${mode.poolSize}) ===`,
      );
      await page.evaluate(
        async ({ modeId, build, threads, hashMb, poolSize }) => {
          const { rules, Eng } = window.__bench;
          const engines = [];
          for (let i = 0; i < poolSize; i++) {
            const e = new Eng(build, threads, hashMb, rules);
            await e.init();
            engines.push(e);
          }
          window.__bench.engines[modeId] = engines;
          window.__bench.engineName = engines[0].name;
        },
        {
          modeId: mode.id,
          build: mode.build,
          threads: mode.threads,
          hashMb: mode.hashMb,
          poolSize: mode.poolSize,
        },
      );
      const existingMode = results.modes[mode.id];
      results.modes[mode.id] = {
        build: mode.build,
        threads: mode.threads,
        poolSize: mode.poolSize,
        fixtures: existingMode?.fixtures ?? {},
      };

      for (const fixture of FIXTURES) {
        if (onlyFixtures && !onlyFixtures.includes(fixture.id)) continue;
        const existingFx = results.modes[mode.id].fixtures[fixture.id];
        const wantedPresets = onlyPresets;
        const alreadyDone =
          existingFx &&
          wantedPresets.every((p) => existingFx.presets[p]) &&
          (skipFixed || mode.id !== 'multi' || existingFx.fixed);
        if (alreadyDone) {
          console.log(`\n--- ${fixture.label} — already in raw results, skipping ---`);
          continue;
        }
        const pgn = readFileSync(join(root, 'tests', 'fixtures', 'bench', fixture.file), 'utf8');
        const positions = positionsOf(pgn);
        console.log(`\n--- ${fixture.label} · ${positions.length} positions ---`);
        const fixtureOut = {
          label: fixture.label,
          positions: positions.length,
          presets: { ...(existingFx?.presets ?? {}) },
          fixed: existingFx?.fixed ?? null,
        };

        for (const presetName of onlyPresets) {
          if (fixtureOut.presets[presetName]) continue;
          const profile = BUDGET_PROFILES[presetName];
          const started = Date.now();
          const records = await page.evaluate(
            async ({ modeId, positions, profile, rulesShape }) => {
              const { rules, engines: allEngines } = window.__bench;
              const engines = allEngines[modeId];
              const R = rulesShape;
              const oneMoveProfile = {
                ...profile,
                targetDepth: R.oneLegalMoveDepth,
                minDepth: R.oneLegalMoveDepth,
                ceilingMs: Math.min(profile.ceilingMs, 250),
              };
              const criticalProfile = (p) => ({
                ...p,
                minDepth: p.targetDepth,
                ceilingMs:
                  p.name === 'standard' ? p.ceilingMs * R.criticalCeilingMultiplier : p.ceilingMs,
              });
              const matchProfile = (p, depth) => ({
                ...p,
                targetDepth: depth,
                minDepth: depth,
                ceilingMs:
                  p.name === 'standard' ? p.ceilingMs * R.criticalCeilingMultiplier : p.ceilingMs,
              });
              const whiteEvalOf = (fen, lines) => {
                const top = lines[0];
                if (!top) return { evalWhiteCp: 0, mate: undefined };
                const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
                const sign = turn === 'w' ? 1 : -1;
                if (top.scoreMate !== null && top.scoreMate !== undefined) {
                  const mateWhite = sign * top.scoreMate;
                  if (mateWhite === 0)
                    return { evalWhiteCp: turn === 'w' ? -100000 : 100000, mate: 0 };
                  const enc = 100000 - Math.abs(mateWhite);
                  return { evalWhiteCp: mateWhite > 0 ? enc : -enc, mate: mateWhite };
                }
                return { evalWhiteCp: sign * (top.scoreCp ?? 0), mate: undefined };
              };

              // First pass: parallel over the pool (multi mode: 1 engine).
              const records = new Array(positions.length).fill(null);
              let cursor = 0;
              const worker = async (eng) => {
                await eng.newGame();
                while (true) {
                  const i = cursor++;
                  if (i >= positions.length) return;
                  const pos = positions[i];
                  if (pos.terminal) {
                    records[i] = { searched: false, depth: 0, ms: 0, nodes: 0, lines: [] };
                    continue;
                  }
                  const oneMove = pos.legalMoves === 1;
                  const r = await eng.analyzeAdaptive(pos.fen, oneMove ? oneMoveProfile : profile);
                  records[i] = {
                    searched: true,
                    oneMove,
                    depth: r.depth,
                    ms: r.ms,
                    nodes: r.nodes,
                    nps: r.nps,
                    lines: r.lines,
                    lateBestMoveChange: r.lateBestMoveChange,
                    bestMoveFellOut: r.bestMoveFellOut,
                    critical: false,
                    depthMatched: false,
                  };
                }
              };
              await Promise.all(engines.map((e) => worker(e)));

              // Sequential fixups in ply order (critical + like-for-like),
              // mirroring analyzer.maybeDeepen / ensureLikeForLike.
              const eng = engines[0];
              for (let i = 1; i < positions.length; i++) {
                const rec = records[i];
                const prev = records[i - 1];
                if (!rec?.searched || rec.oneMove || !prev) continue;
                if (rec.depth > 0 && rec.depth < profile.targetDepth && prev.searched) {
                  const swing = rules.isCriticalSwing(
                    whiteEvalOf(positions[i - 1].fen, prev.lines),
                    whiteEvalOf(positions[i].fen, rec.lines),
                  );
                  if (rec.lateBestMoveChange || rec.bestMoveFellOut || swing) {
                    const full = await eng.analyzeFull(positions[i].fen, criticalProfile(profile));
                    if (full.depth > 0) {
                      Object.assign(rec, {
                        depth: full.depth,
                        lines: full.lines,
                        nodes: full.nodes,
                        critical: true,
                      });
                      rec.ms += full.ms;
                    }
                  }
                }
                if (prev.depth > rec.depth && prev.depth > 0) {
                  const ext = await eng.analyzeFull(
                    positions[i].fen,
                    matchProfile(profile, prev.depth),
                  );
                  if (ext.depth > rec.depth) {
                    Object.assign(rec, {
                      depth: ext.depth,
                      lines: ext.lines,
                      nodes: ext.nodes,
                      depthMatched: true,
                    });
                    rec.ms += ext.ms;
                  }
                }
              }
              return records;
            },
            {
              modeId: mode.id,
              positions: positions.map((p) => ({
                fen: p.fen,
                terminal: p.terminal,
                legalMoves: p.legalMoves,
              })),
              profile,
              rulesShape: {
                oneLegalMoveDepth: 1,
                criticalCeilingMultiplier: 2,
              },
            },
          );
          const stats = statsOf(records);
          fixtureOut.presets[presetName] = { stats, records };
          saveResults();
          console.log(
            `${presetName.padEnd(8)} ${(Date.now() - started) / 1000}s wall · total ${stats.totalSec}s · mean depth ${stats.meanDepth} · median ${stats.medianDepth} · p10 ${stats.p10Depth} · ${stats.nodesPerSec} nps · ${stats.critical} critical · ${stats.depthMatched} depth-matched`,
          );
        }

        // Fixed depth-18 reference pass (multi mode only; the reference
        // is mode-independent — single-thread fixed d18 differs only in
        // hash/TT history, and agreement is a property of the evals).
        if (mode.id === 'multi' && !skipFixed && !fixtureOut.fixed) {
          const started = Date.now();
          const fixedRecords = await page.evaluate(
            async ({ modeId, positions, depth }) => {
              const engines = window.__bench.engines[modeId];
              const eng = engines[0];
              await eng.newGame();
              const out = [];
              for (const pos of positions) {
                if (pos.terminal) {
                  out.push({ searched: false, depth: 0, ms: 0, nodes: 0, lines: [] });
                  continue;
                }
                const r = await eng.analyzeFixed(pos.fen, depth);
                out.push({
                  searched: true,
                  depth: r.depth,
                  ms: r.ms,
                  nodes: r.nodes,
                  lines: r.lines,
                });
              }
              return out;
            },
            {
              modeId: mode.id,
              positions: positions.map((p) => ({ fen: p.fen, terminal: p.terminal })),
              depth: FIXED_DEPTH,
            },
          );
          fixtureOut.fixed = { stats: statsOf(fixedRecords), records: fixedRecords };
          console.log(`fixed-d18 pass: ${((Date.now() - started) / 1000).toFixed(1)}s wall`);
        }
        results.modes[mode.id].fixtures[fixture.id] = fixtureOut;
        saveResults();
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log(`\nRaw results written: ${OUT_PATH}`);
}

await main();
