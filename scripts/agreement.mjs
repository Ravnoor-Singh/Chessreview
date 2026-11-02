// Agreement study (Round 2, Prompt 3).
//
//   node scripts/agreement.mjs [--write]
//
// Reads PERFORMANCE_BASELINE.raw.json (produced by
// scripts/bench-browser.mjs in a real Chromium) and compares, position by
// position, each adaptive preset's evaluations against the fixed
// depth-18 reference pass:
//   - mean / median |Δcp| (White perspective, mate scores capped ±1000)
//   - % positions whose best move differs
//   - % MOVES WHOSE CLASSIFICATION DIFFERS — the metric that matters —
//     using the production classifier (scripts/calibrate-entry.ts,
//     bundled on the fly exactly like scripts/calibrate.mjs).
//
// With --write, the per-move classification arrays are committed to
// tests/fixtures/bench/agreement-runtime.json, which the guard test
// (tests/unit/preset-agreement-guard.test.ts) asserts against the
// documented per-preset targets.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { buildSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_PATH = join(root, 'PERFORMANCE_BASELINE.raw.json');
const OUT_PATH = join(root, 'tests', 'fixtures', 'bench', 'agreement-runtime.json');
const FIXTURES = [
  { id: 'opera', file: 'sample-opera.pgn' },
  { id: '41', file: 'lichess-41move.pgn' },
  { id: '86', file: 'lichess-86move.pgn' },
];
const write = process.argv.includes('--write');

if (!existsSync(RAW_PATH)) {
  console.error('PERFORMANCE_BASELINE.raw.json not found — run scripts/bench-browser.mjs first.');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));

const bundlePath = join(tmpdir(), 'chess-review-agreement-entry.bundle.mjs');
buildSync({
  entryPoints: [join(root, 'scripts', 'calibrate-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const { classifySnapshot } = await import(bundlePath);

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
    return {
      ply: i,
      fen,
      terminal,
      legalMoveCount: terminal ? 0 : c.moves().length,
      move:
        i === 0
          ? null
          : {
              san: history[i - 1].san,
              uci: history[i - 1].from + history[i - 1].to + (history[i - 1].promotion ?? ''),
              from: history[i - 1].from,
              to: history[i - 1].to,
              captured: history[i - 1].captured ?? null,
              promotion: history[i - 1].promotion ?? null,
            },
    };
  });
}

function toEngineLines(rec) {
  if (!rec) return [];
  return (rec.lines ?? []).map((l) => ({
    multipv: l.multipv,
    depth: l.depth,
    scoreCp: l.scoreCp === null ? undefined : l.scoreCp,
    scoreMate: l.scoreMate === null ? undefined : l.scoreMate,
    pv: l.pv,
  }));
}

function snapshotOf(positions, records) {
  return {
    gameId: 'bench',
    depth: 18,
    multiPv: 3,
    positions: positions.map((p, i) => ({ ...p, lines: toEngineLines(records[i]) })),
  };
}

/** White-perspective cp with mate scores capped at ±1000 (spec). */
function cappedWhiteCp(fen, rec) {
  const top = rec?.lines?.[0];
  if (!top) return null;
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
  if (top.scoreMate !== null && top.scoreMate !== undefined)
    return sign * Math.sign(top.scoreMate) * 1000;
  if (top.scoreCp === null || top.scoreCp === undefined) return null;
  return Math.max(-1000, Math.min(1000, sign * top.scoreCp));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const out = { machine: raw.machine, browser: raw.browser, fixtures: {} };
const lines = [];
lines.push(
  '=== Agreement study: adaptive presets vs fixed depth-18 (real browser, multi-thread) ===',
);

const multi = raw.modes.multi;
if (!multi) {
  console.error('Raw results contain no multi-thread mode.');
  process.exit(1);
}

for (const fixture of FIXTURES) {
  const fx = multi.fixtures[fixture.id];
  if (!fx?.fixed) continue;
  const pgn = readFileSync(join(root, 'tests', 'fixtures', 'bench', fixture.file), 'utf8');
  const positions = positionsOf(pgn);
  const fixedRecords = fx.fixed.records;
  const fixedClasses = classifySnapshot(snapshotOf(positions, fixedRecords), 'balanced').map(
    (r) => r.classification,
  );
  out.fixtures[fixture.id] = { fixedClasses, presets: {} };
  lines.push(
    `\n--- ${fixture.id} (${positions.length} positions, ${fixedClasses.length} moves) ---`,
  );

  for (const presetName of ['quick', 'standard', 'deep']) {
    const preset = fx.presets[presetName];
    if (!preset) continue;
    const records = preset.records;
    const diffs = [];
    let bestDiff = 0;
    let compared = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].terminal) continue;
      const a = cappedWhiteCp(positions[i].fen, records[i]);
      const f = cappedWhiteCp(positions[i].fen, fixedRecords[i]);
      if (a === null || f === null) continue;
      compared++;
      diffs.push(Math.abs(a - f));
      const aBest = records[i]?.lines?.[0]?.pv?.[0];
      const fBest = fixedRecords[i]?.lines?.[0]?.pv?.[0];
      if (aBest && fBest && aBest !== fBest) bestDiff++;
    }
    const adaptiveClasses = classifySnapshot(snapshotOf(positions, records), 'balanced').map(
      (r) => r.classification,
    );
    let classDiff = 0;
    for (let i = 0; i < fixedClasses.length; i++) {
      if (adaptiveClasses[i] !== fixedClasses[i]) classDiff++;
    }
    const stats = {
      compared,
      meanAbsCp: diffs.length
        ? Number((diffs.reduce((x, y) => x + y, 0) / diffs.length).toFixed(1))
        : 0,
      medianAbsCp: diffs.length ? median(diffs) : 0,
      bestMoveDiffPct: compared ? Number(((bestDiff / compared) * 100).toFixed(1)) : 0,
      moves: fixedClasses.length,
      classDiff,
      classDiffPct: fixedClasses.length
        ? Number(((classDiff / fixedClasses.length) * 100).toFixed(1))
        : 0,
    };
    out.fixtures[fixture.id].presets[presetName] = { stats, adaptiveClasses };
    lines.push(
      `${presetName.padEnd(8)} mean |Δcp| ${stats.meanAbsCp} · median ${stats.medianAbsCp} · best-move differs ${stats.bestMoveDiffPct}% · CLASSIFICATION differs ${stats.classDiff}/${stats.moves} = ${stats.classDiffPct}%`,
    );
  }
}

// Brilliant/Great frequencies under the runtime budget (recalibration
// check, req 5): per 40 moves over all benchmark fixtures, adaptive
// Standard/Deep vs the fixed-d18 reference.
lines.push('\n--- Brilliant/Great per 40 moves (runtime budget vs fixed d18) ---');
for (const source of ['fixed', 'standard', 'deep', 'quick']) {
  let brilliant = 0;
  let great = 0;
  let moves = 0;
  for (const fixture of FIXTURES) {
    const fx = out.fixtures[fixture.id];
    if (!fx) continue;
    const classes = source === 'fixed' ? fx.fixedClasses : fx.presets[source]?.adaptiveClasses;
    if (!classes) continue;
    moves += classes.length;
    brilliant += classes.filter((c) => c === 'brilliant').length;
    great += classes.filter((c) => c === 'great').length;
  }
  if (moves > 0) {
    lines.push(
      `${source.padEnd(8)} Brilliant ${((brilliant / moves) * 40).toFixed(2)}/40 · Great ${((great / moves) * 40).toFixed(2)}/40 · over ${moves} moves`,
    );
    out[source === 'fixed' ? 'fixedFreq' : `${source}Freq`] = {
      brilliantPer40: Number(((brilliant / moves) * 40).toFixed(2)),
      greatPer40: Number(((great / moves) * 40).toFixed(2)),
      moves,
    };
  }
}

console.log(lines.join('\n'));
if (write) {
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
  console.log(`\nwritten: ${OUT_PATH}`);
}
