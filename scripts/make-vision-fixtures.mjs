/**
 * Generate the screenshot-recognition fixture set (Prompt 8):
 *
 *   node scripts/make-vision-fixtures.mjs
 *
 * Writes PNG/JPEG images + manifest.json (ground truth: FEN + exact board
 * rectangle for every image) into tests/fixtures/vision/. Three families:
 *
 *   clean     – 8 FENs × 5 piece sets × 2 themes, 512 px board on a
 *               560 px canvas, coordinate labels on alternate renders.
 *   realistic – phone screenshots: 1080 px wide canvas, status-bar band,
 *               UI panels, 936 px board, last-move highlights, a legal-move
 *               dot and a capture ring, saved as JPEG q80.
 *   rotated   – clean renders rotated ±1.5°/±2° or heavily recompressed
 *               (JPEG q50/q35). Reported separately; no accuracy target.
 *
 * Most other variants (upscaling, borders, gutters, JPEG q85, noise) are
 * derived in-test from these bases — see tests/unit/vision-fixtures.test.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FIXTURE_FENS, decorationsFor, renderBoardImage } from './vision-fixture-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'vision');
const SETS = ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast'];

const entries = [];
async function save(file, image, entry) {
  await image.toFile(path.join(OUT, file));
  entries.push({ file, ...entry });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // ---- clean ------------------------------------------------------------
  for (const [fenName, fen] of FIXTURE_FENS) {
    for (const set of SETS) {
      for (const theme of ['green', 'brown']) {
        const coords =
          (FIXTURE_FENS.findIndex(([n]) => n === fenName) + SETS.indexOf(set)) % 2 === 0;
        const file = `clean-${fenName}-${set}-${theme}.png`;
        const image = await renderBoardImage({
          fen,
          set,
          theme,
          board: { x: 24, y: 24, size: 512 },
          canvas: { w: 560, h: 560, background: '#312e2b' },
          coords,
        });
        await save(file, image.png(), {
          kind: 'clean',
          fen,
          set,
          theme,
          coords,
          boardRect: { x: 24, y: 24, size: 512 },
          canvas: { w: 560, h: 560 },
        });
      }
    }
  }

  // ---- realistic (phone screenshots) -------------------------------------
  const realisticSets = ['cburnett', 'staunton-wood'];
  const realisticThemes = ['brown', 'blue'];
  for (const [fenName, fen] of FIXTURE_FENS.slice(0, 4)) {
    for (const set of realisticSets) {
      for (const theme of realisticThemes) {
        const deco = decorationsFor(fen);
        const file = `realistic-${fenName}-${set}-${theme}.jpg`;
        const image = await renderBoardImage({
          fen,
          set,
          theme,
          board: { x: 72, y: 210, size: 936 },
          canvas: { w: 1080, h: 1560, background: '#1f1c1a' },
          coords: true,
          chrome: 'phone',
          highlights: deco.highlights,
          dot: deco.dot,
          ring: deco.ring,
        });
        await save(file, image.jpeg({ quality: 80 }), {
          kind: 'realistic',
          fen,
          set,
          theme,
          coords: true,
          decorations: deco,
          boardRect: { x: 72, y: 210, size: 936 },
          canvas: { w: 1080, h: 1560 },
        });
      }
    }
  }

  // ---- rotated / heavily compressed (report-only) -------------------------
  const rotSpecs = [
    ['start', 'cburnett', 'green', 1.5],
    ['italian', 'neo', 'brown', -2],
    ['sicilian', 'minimal', 'green', 2],
    ['pawn-endgame', 'high-contrast', 'brown', -1.5],
  ];
  for (const [fenName, set, theme, angle] of rotSpecs) {
    const fen = FIXTURE_FENS.find(([n]) => n === fenName)[1];
    const rendered = await renderBoardImage({
      fen,
      set,
      theme,
      board: { x: 110, y: 110, size: 640 },
      canvas: { w: 860, h: 860, background: '#312e2b' },
      coords: true,
    });
    const png = await rendered.png().toBuffer();
    const file = `rotated-${fenName}-${set}-${angle}deg.png`;
    await save(file, sharp(png).rotate(angle, { background: '#202020' }), {
      kind: 'rotated',
      fen,
      set,
      theme,
      coords: true,
      rotationDeg: angle,
      // Pre-rotation rectangle (the board rotates about the canvas center,
      // which is also the board center, so this stays approximately true).
      boardRect: { x: 110, y: 110, size: 640 },
      canvas: { w: 860, h: 860 },
    });
  }
  for (const q of [50, 35]) {
    const [fenName, fen] = FIXTURE_FENS[2];
    const rendered = await renderBoardImage({
      fen,
      set: 'cburnett',
      theme: 'green',
      board: { x: 24, y: 24, size: 512 },
      canvas: { w: 560, h: 560, background: '#312e2b' },
      coords: true,
    });
    const file = `compressed-${fenName}-cburnett-q${q}.jpg`;
    await save(file, rendered.jpeg({ quality: q }), {
      kind: 'rotated',
      fen,
      set: 'cburnett',
      theme: 'green',
      coords: true,
      jpegQuality: q,
      boardRect: { x: 24, y: 24, size: 512 },
      canvas: { w: 560, h: 560 },
    });
  }

  await writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ fixtures: entries }, null, 2) + '\n',
  );
  console.log(`Wrote ${entries.length} fixtures to ${path.relative(ROOT, OUT)}/`);
}

await main();
