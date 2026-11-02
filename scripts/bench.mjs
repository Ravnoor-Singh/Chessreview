// Analysis-speed benchmark (Prompt 3).
//
//   node scripts/bench.mjs [--limit N] [--only sample|41|86]
//
// Analyzes the three fixture PGNs in tests/fixtures/bench/ with the REAL
// Stockfish engine (the `stockfish` npm package, single-thread build — the
// same build the app uses for its single-thread clients) under each
// adaptive preset, then runs the agreement check: adaptive Standard vs a
// fixed depth-18 search on the same positions.
//
// The budget rules are NOT reimplemented here: this script imports
// src/engine/budgetRules.mjs — the exact module the app uses (via
// src/engine/budget.ts) — so bench and app share one source of truth.
// The adaptive pass mirrors the app end to end: stability stop, terminal
// skip, one-legal-move depth-1, and critical-position re-analysis at full
// budget (swing > 12 win-% or a last-moment best-move change). Only UCI
// wire parsing is local (the app's parser is TypeScript).
//
// Numbers reflect THIS machine; the hardware line is always printed and
// must be quoted with the results (see README "Performance").

import { readFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import {
  BUDGET_PROFILES,
  BUDGET_RULES,
  createBudgetTracker,
  isCriticalSwing,
  trackerScoreCp,
} from '../src/engine/budgetRules.mjs';

const require = createRequire(import.meta.url);
const Stockfish = require('stockfish');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = [
  { id: 'sample', label: 'Opera Game (Morphy, 1858) — 17 moves', file: 'sample-opera.pgn' },
  { id: '41', label: 'Lichess h6veisdc — 41 moves', file: 'lichess-41move.pgn' },
  { id: '86', label: 'Lichess 2cj9hphe — 86 moves', file: 'lichess-86move.pgn' },
];
const MULTI_PV = 3;
const FIXED_DEPTH = 18;
const SEARCH_WATCHDOG_MS = 180_000;

// ---------------------------------------------------------------------------
// Minimal UCI handling for the Node engine (processCommand / listener API).
// ---------------------------------------------------------------------------

function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' depth ') || line.includes(' string'))
    return null;
  const tokens = line.split(/\s+/);
  const out = { pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') out.depth = Number(tokens[++i]);
    else if (t === 'multipv') out.multipv = Number(tokens[++i]);
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
}

class BenchEngine {
  constructor() {
    this.engine = Stockfish('single');
    this.waiters = [];
    this.search = null;
    this.name = 'Stockfish';
    this.engine.listener = (line) => this.onLine(line);
  }

  send(cmd) {
    this.engine.processCommand(cmd);
  }

  waitFor(predicate) {
    return new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }

  onLine(line) {
    if (typeof line !== 'string') return;
    if (line.startsWith('id name ')) this.name = line.slice('id name '.length).trim();
    this.waiters = this.waiters.filter((w) => {
      if (w.predicate(line)) {
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
          scoreCp: trackerScoreCp(info.scoreCp, info.scoreMate),
        });
        if (decision === 'stop' && !s.stopSent) {
          s.stopSent = true;
          this.send('stop');
        }
      }
      return;
    }
    if (line.startsWith('bestmove')) {
      this.search = null;
      s.resolve(s.lines);
    }
  }

  async init() {
    const uciok = this.waitFor((l) => l === 'uciok');
    this.send('uci');
    await uciok;
    this.send(`setoption name Threads value 1`);
    this.send(`setoption name Hash value 128`);
    this.send(`setoption name MultiPV value ${MULTI_PV}`);
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

  /** One search. With a tracker, the budget rules may stop it early. */
  runSearch(fen, { depth, movetimeMs, tracker }) {
    return new Promise((resolve) => {
      const watchdog = setTimeout(() => {
        if (this.search) {
          this.search.stopSent = true;
          this.send('stop');
        }
      }, SEARCH_WATCHDOG_MS);
      this.search = {
        lines: new Map(),
        tracker: tracker ?? null,
        stopSent: false,
        resolve: (lines) => {
          clearTimeout(watchdog);
          resolve(lines);
        },
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}${movetimeMs ? ` movetime ${movetimeMs}` : ''}`);
    });
  }

  async analyzeAdaptive(fen, profile) {
    const tracker = createBudgetTracker(profile);
    const lines = await this.runSearch(fen, {
      depth: profile.targetDepth,
      movetimeMs: profile.ceilingMs,
      tracker,
    });
    const summary = summarize(lines);
    return { ...summary, lateBestMoveChange: tracker.state().lateBestMoveChange };
  }

  /** Full-budget re-analysis (critical positions): stability stop disabled. */
  async analyzeFull(fen, profile) {
    const tracker = createBudgetTracker({
      targetDepth: profile.targetDepth,
      minDepth: profile.targetDepth,
    });
    const lines = await this.runSearch(fen, {
      depth: profile.targetDepth,
      movetimeMs: profile.ceilingMs,
      tracker,
    });
    return summarize(lines);
  }

  async analyzeFixed(fen, depth) {
    const lines = await this.runSearch(fen, { depth, movetimeMs: undefined, tracker: null });
    return summarize(lines);
  }
}

function summarize(linesByPv) {
  const lines = [...linesByPv.values()].sort((a, b) => a.multipv - b.multipv);
  const top = lines[0];
  if (!top) return { depth: 0, scoreCp: null, scoreMate: undefined };
  return {
    depth: lines.reduce((m, l) => Math.max(m, l.depth), 0),
    scoreCp: top.scoreCp ?? null,
    scoreMate: top.scoreMate,
  };
}

/** White-perspective eval ({evalWhiteCp, mate}) for a search summary — mirrors the app's scoreToWhiteCp. */
function whiteEvalOf(fen, summary) {
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const sign = turn === 'w' ? 1 : -1;
  if (summary.scoreMate !== undefined && summary.scoreMate !== null) {
    const mateWhite = sign * summary.scoreMate;
    if (mateWhite === 0) return { evalWhiteCp: turn === 'w' ? -100000 : 100000, mate: 0 };
    const encoded = 100000 - Math.abs(mateWhite);
    return { evalWhiteCp: mateWhite > 0 ? encoded : -encoded, mate: mateWhite };
  }
  return { evalWhiteCp: sign * (summary.scoreCp ?? 0), mate: undefined };
}

/** Score comparable across passes: White-perspective cp; mates flattened to ±10000 for the agreement diff. */
function diffCp(fen, summary) {
  if (summary.scoreCp === null && summary.scoreMate === undefined) return null;
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const sign = turn === 'w' ? 1 : -1;
  if (summary.scoreMate !== undefined) return sign * Math.sign(summary.scoreMate) * 10000;
  return sign * (summary.scoreCp ?? 0);
}

function positionsOf(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const fens = [history[0].before, ...history.map((h) => h.after)];
  return fens.map((fen) => {
    const c = new Chess(fen);
    const terminal =
      c.isCheckmate() ||
      c.isStalemate() ||
      c.isDraw() ||
      c.isThreefoldRepetition() ||
      c.isInsufficientMaterial();
    return { fen, terminal, legalMoves: terminal ? 0 : c.moves().length };
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const cpu = cpus()[0];
  console.log('=== Chess Review analysis benchmark ===');
  console.log(
    `Hardware: ${cpu ? cpu.model : 'unknown CPU'} · ${cpus().length} cores · ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM`,
  );
  console.log(
    `Node: ${process.version} · engine build: stockfish-19-single.js (1 thread, Hash 128 MB, MultiPV ${MULTI_PV})`,
  );
  console.log(
    `Budget rules: stability window ${BUDGET_RULES.stabilityWindow} depths / <${BUDGET_RULES.stabilityMaxCpDelta} cp, ` +
      `swing threshold ${BUDGET_RULES.swingWinPctPoints} win-% (shared src/engine/budgetRules.mjs)`,
  );

  const engine = new BenchEngine();
  await engine.init();
  console.log(`Engine: ${engine.name}`);
  // Warm-up so first-search WASM/JIT costs do not pollute the first fixture.
  await engine.analyzeFixed(new Chess().fen(), 8);

  const agreementDiffs = [];
  const agreementDiffsNonMate = [];
  let agreementMatePositions = 0;
  let agreementCompared = 0;

  for (const fixture of FIXTURES) {
    if (only && fixture.id !== only) continue;
    const pgn = readFileSync(join(root, 'tests', 'fixtures', 'bench', fixture.file), 'utf8');
    const allPositions = positionsOf(pgn);
    const positions = allPositions.slice(0, limit);
    console.log(
      `\n--- ${fixture.label} · ${positions.length} positions (${allPositions.length} total${limit !== Infinity ? ', limited' : ''}) ---`,
    );
    await engine.newGame();

    const standardResults = new Map(); // position index -> summary (for the agreement check)

    for (const presetName of ['quick', 'standard', 'deep']) {
      const profile = BUDGET_PROFILES[presetName];
      const oneMoveProfile = {
        ...profile,
        targetDepth: BUDGET_RULES.oneLegalMoveDepth,
        minDepth: BUDGET_RULES.oneLegalMoveDepth,
        ceilingMs: Math.min(profile.ceilingMs, 250),
      };
      const started = performance.now();
      let searched = 0;
      let depthSum = 0;
      let deepened = 0;
      let prevWhite = null;
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (pos.terminal) continue;
        const oneMove = pos.legalMoves === 1;
        let summary = await engine.analyzeAdaptive(pos.fen, oneMove ? oneMoveProfile : profile);
        // Critical-position rule — mirrors analyzer.maybeDeepen: a swing
        // of > 12 win-% points vs the previous position, or a last-moment
        // best-move change, earns a full-budget re-analysis.
        if (
          !oneMove &&
          prevWhite &&
          summary.depth > 0 &&
          summary.depth < profile.targetDepth &&
          (summary.lateBestMoveChange || isCriticalSwing(prevWhite, whiteEvalOf(pos.fen, summary)))
        ) {
          const full = await engine.analyzeFull(pos.fen, profile);
          if (full.depth > 0) {
            summary = { ...full, lateBestMoveChange: false };
            deepened++;
          }
        }
        prevWhite = whiteEvalOf(pos.fen, summary);
        searched++;
        depthSum += summary.depth;
        if (presetName === 'standard') standardResults.set(i, summary);
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(
        `${presetName.padEnd(8)} target d${profile.targetDepth} (min ${profile.minDepth}, cap ${profile.ceilingMs} ms): ` +
          `${seconds.toFixed(1)}s total · avg depth ${(searched ? depthSum / searched : 0).toFixed(1)} over ${searched} searched ` +
          `(${deepened} critical re-analyzed) · ${(positions.length / seconds).toFixed(2)} positions/s`,
      );
    }

    // Agreement: adaptive Standard (already run) vs fixed depth-18.
    const started = performance.now();
    let comparedHere = 0;
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (pos.terminal) continue;
      const fixed = await engine.analyzeFixed(pos.fen, FIXED_DEPTH);
      const adaptive = standardResults.get(i);
      if (!adaptive) continue;
      const a = diffCp(pos.fen, adaptive);
      const f = diffCp(pos.fen, fixed);
      if (a === null || f === null) continue;
      const mateInvolved = adaptive.scoreMate !== undefined || fixed.scoreMate !== undefined;
      if (mateInvolved) agreementMatePositions++;
      else agreementDiffsNonMate.push(Math.abs(a - f));
      agreementDiffs.push(Math.abs(a - f));
      comparedHere++;
      agreementCompared++;
    }
    const seconds = (performance.now() - started) / 1000;
    const meanHere =
      comparedHere > 0
        ? agreementDiffs.slice(-comparedHere).reduce((x, y) => x + y, 0) / comparedHere
        : 0;
    console.log(
      `agreement  fixed d${FIXED_DEPTH} pass: ${seconds.toFixed(1)}s · mean |Δcp| vs adaptive Standard on ${comparedHere} positions: ${meanHere.toFixed(1)} cp`,
    );
  }

  if (agreementCompared > 0) {
    const mean = agreementDiffs.reduce((a, b) => a + b, 0) / agreementDiffs.length;
    console.log(
      `\n=== Agreement (all fixtures): adaptive Standard vs fixed depth-${FIXED_DEPTH} ===`,
    );
    console.log(
      `mean absolute cp difference: ${mean.toFixed(1)} cp over ${agreementCompared} positions ` +
        `(${agreementMatePositions} mate-scored, flattened to ±10000 cp) · target ≤ 20 cp: ${mean <= 20 ? 'MET' : 'MISSED — real number reported'}`,
    );
    if (agreementDiffsNonMate.length > 0) {
      const meanNonMate =
        agreementDiffsNonMate.reduce((a, b) => a + b, 0) / agreementDiffsNonMate.length;
      console.log(
        `non-mate positions only: ${meanNonMate.toFixed(1)} cp over ${agreementDiffsNonMate.length} positions ` +
          `(mate-scored positions dominate the headline mean: one mate found by only one pass contributes ~10000/286 ≈ 35 cp to it)`,
      );
    }
  }
  engine.send('quit');
}

await main();
