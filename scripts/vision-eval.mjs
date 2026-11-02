// Score the screenshot-to-FEN pipeline on ANY folder of images
// (Round 2, Prompt 8). This is the tool the README points users at for
// testing their own screenshots (e.g. chess.com captures, which are never
// committed to this repo):
//
//   npm run vision:eval -- <folder>
//
// Folder contract (either form):
//   a) <folder>/manifest.json — {"fixtures": [{"file": "a.png", "fen": "…",
//      "kind": "screenshot"}, …]} ("kind" is the reporting category), or
//   b) image files (*.png/*.jpg/*.jpeg/*.webp) each with a sidecar
//      "<name>.fen" containing the position's FEN; the category is then
//      the folder's basename.
//
// Images are decoded with sharp and downscaled to a 1600px long side
// first — the same cap the browser client applies (src/vision/client.ts)
// — so 12-megapixel phone photos are memory-safe and measured the way the
// app sees them. The pipeline under test is the exact shipped code,
// bundled on the fly from src/vision (scripts/vision-eval-entry.ts).
//
// Output: per-image accuracy + timing, per-category aggregates, and a
// confidence reliability table (bucket vs measured square accuracy).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2];
if (!folder) {
  console.error('usage: npm run vision:eval -- <folder>');
  process.exit(2);
}
if (!existsSync(folder)) {
  console.error(`vision-eval: folder not found: ${folder}`);
  process.exit(2);
}

// sharp stays external (native module); the bundle is written inside
// node_modules so the external import resolves against this project.
const bundlePath = join(root, 'node_modules', '.vision-eval.bundle.mjs');
buildSync({
  entryPoints: [join(root, 'scripts', 'vision-eval-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  external: ['sharp'],
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const driver = await import(bundlePath);
const sets = await Promise.all(
  driver.APP_PIECE_SETS.map((set) => driver.buildPieceRasters(root, set)),
);

// --- Collect fixtures -------------------------------------------------------
const fixtures = [];
const manifestPath = join(folder, 'manifest.json');
if (existsSync(manifestPath)) {
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const f of parsed.fixtures ?? []) {
    fixtures.push({ file: f.file, fen: f.fen, kind: f.kind ?? 'unknown' });
  }
} else {
  const kind = basename(folder.replace(/\/+$/, ''));
  for (const name of readdirSync(folder).sort()) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const sidecar = join(folder, name.replace(/\.(png|jpe?g|webp)$/i, '.fen'));
    if (!existsSync(sidecar)) continue;
    fixtures.push({ file: name, fen: readFileSync(sidecar, 'utf8').trim(), kind });
  }
}
if (fixtures.length === 0) {
  console.error('vision-eval: no fixtures found (need manifest.json or <image>.fen sidecars)');
  process.exit(2);
}

// --- Run + score ------------------------------------------------------------
const MAX_DIM = 1600;
const buckets = new Map(); // "0.9-1.0" -> {n, correct}
function bucketOf(conf) {
  if (conf >= 0.95) return '0.95-1.00';
  if (conf >= 0.9) return '0.90-0.95';
  if (conf >= 0.8) return '0.80-0.90';
  if (conf >= 0.7) return '0.70-0.80';
  if (conf >= 0.6) return '0.60-0.70';
  return '<0.60';
}

const byKind = new Map();
let totalCorrect = 0;
let totalSquares = 0;
let totalMs = 0;

for (const fx of fixtures) {
  const path = join(folder, fx.file);
  let img = sharp(path).ensureAlpha();
  const meta = await img.metadata();
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_DIM) {
    img = img.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside' });
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const image = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
  const expected = driver.fenToSquares(fx.fen);
  const t0 = performance.now();
  const out = driver.recognizeImage(image, sets);
  const ms = performance.now() - t0;
  totalMs += ms;
  const agg = byKind.get(fx.kind) ?? { images: 0, detected: 0, correct: 0, total: 0, perfect: 0 };
  agg.images++;
  if (out.status !== 'ok') {
    console.log(`${fx.file} [${fx.kind}] NOT DETECTED (${ms.toFixed(0)} ms)`);
    byKind.set(fx.kind, agg);
    continue;
  }
  agg.detected++;
  let correctHere = 0;
  out.result.squares.forEach((s, i) => {
    const ok = s.piece === expected[i];
    if (ok) correctHere++;
    const b = bucketOf(s.confidence);
    const rec = buckets.get(b) ?? { n: 0, correct: 0 };
    rec.n++;
    if (ok) rec.correct++;
    buckets.set(b, rec);
  });
  agg.correct += correctHere;
  agg.total += 64;
  if (correctHere === 64) agg.perfect++;
  totalCorrect += correctHere;
  totalSquares += 64;
  byKind.set(fx.kind, agg);
  console.log(
    `${fx.file} [${fx.kind}] ${(100 * correctHere) / 64}% (${correctHere}/64) ` +
      `meanConf=${out.result.meanConfidence.toFixed(3)} ${ms.toFixed(0)} ms`,
  );
}

console.log('\n== Per-category ==');
for (const [kind, a] of [...byKind.entries()].sort()) {
  const acc = a.total ? ((100 * a.correct) / a.total).toFixed(2) : '—';
  console.log(
    `${kind}: images=${a.images} detected=${a.detected} squareAcc=${acc}% (${a.correct}/${a.total}) perfect=${a.perfect}`,
  );
}
console.log(
  `\nOVERALL: squareAcc=${totalSquares ? ((100 * totalCorrect) / totalSquares).toFixed(2) : '—'}% ` +
    `(${totalCorrect}/${totalSquares}) across ${fixtures.length} images, mean ${(totalMs / fixtures.length).toFixed(0)} ms/image`,
);
console.log('\n== Confidence reliability (all detected images) ==');
for (const b of ['0.95-1.00', '0.90-0.95', '0.80-0.90', '0.70-0.80', '0.60-0.70', '<0.60']) {
  const rec = buckets.get(b);
  if (!rec) continue;
  console.log(`${b}: squares=${rec.n} actualAcc=${((100 * rec.correct) / rec.n).toFixed(2)}%`);
}
