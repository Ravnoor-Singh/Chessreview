// Accuracy validation against Lichess reference values (Prompt 5).
//
//   node scripts/validate-accuracy.mjs
//
// OFFLINE: reads the committed fixtures in
// tests/fixtures/lichess-reference/games.json (real games whose
// per-position evaluations AND per-player reference accuracies both
// come from Lichess's own API — provenance in SOURCES.md and
// raw.ndjson), recomputes OUR accuracy from the SAME evaluations with
// the production pipeline (bundled from src/analysis/accuracy.ts via
// scripts/validate-entry.ts), and prints a comparison table.
//
// Tolerance: mean absolute difference ≤ 3 points AND max difference
// ≤ 8 points. Exits non-zero when either is exceeded. Reference
// accuracies are integers, so ≈ ±0.5 of any difference is Lichess's
// own rounding; the fixtures' initial-position eval is Lichess's
// documented +15 cp legacy initial value (see SOURCES.md).

import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(root, 'tests', 'fixtures', 'lichess-reference', 'games.json');

const bundlePath = join(tmpdir(), 'chess-review-validate-entry.bundle.mjs');
buildSync({
  entryPoints: [join(root, 'scripts', 'validate-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const { accuraciesFromEvals } = await import(bundlePath);

const { games } = JSON.parse(readFileSync(FIXTURE, 'utf8'));
if (!Array.isArray(games) || games.length < 15) {
  console.error(`Expected at least 15 fixture games, found ${games?.length ?? 0}.`);
  process.exit(1);
}

const fmt = (v) => (v === null || v === undefined ? '  —  ' : v.toFixed(1).padStart(5));
const rows = [];
let sumAbs = 0;
let maxAbs = 0;
let n = 0;
for (const game of games) {
  const ours = accuraciesFromEvals(game.positions);
  const ref = game.referenceAccuracy;
  const dW = ours.white === null ? null : ours.white - ref.white;
  const dB = ours.black === null ? null : ours.black - ref.black;
  for (const d of [dW, dB]) {
    if (d === null) continue;
    sumAbs += Math.abs(d);
    maxAbs = Math.max(maxAbs, Math.abs(d));
    n += 1;
  }
  rows.push(
    `${game.id}  ${game.status.padEnd(10)} ${game.speed.padEnd(7)}` +
      ` W: ours ${fmt(ours.white)} ref ${String(ref.white).padStart(3)} diff ${dW === null ? '  —  ' : (dW >= 0 ? '+' : '') + dW.toFixed(2)}` +
      `   B: ours ${fmt(ours.black)} ref ${String(ref.black).padStart(3)} diff ${dB === null ? '  —  ' : (dB >= 0 ? '+' : '') + dB.toFixed(2)}`,
  );
}

console.log('Lichess reference accuracy validation — our pipeline vs Lichess stored accuracy');
console.log('(fixtures: tests/fixtures/lichess-reference/games.json; provenance: SOURCES.md)\n');
for (const r of rows) console.log(r);
const meanAbs = sumAbs / n;
console.log(`\n${games.length} games, ${n} player accuracies`);
console.log(`mean |diff| = ${meanAbs.toFixed(2)}  (tolerance ≤ 3)`);
console.log(`max  |diff| = ${maxAbs.toFixed(2)}  (tolerance ≤ 8)`);
if (meanAbs <= 3 && maxAbs <= 8) {
  console.log('PASS');
} else {
  console.log('FAIL — tolerance exceeded');
  process.exit(1);
}
