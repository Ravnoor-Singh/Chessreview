/**
 * Bundle entry for scripts/vision-eval.mjs: re-exports the REAL vision
 * pipeline (the exact code the browser worker runs) plus the Node-side
 * piece-raster builder (sharp rasterization of the app's own piece SVGs,
 * the same construction tests/unit/vision-fixtures-helper.ts uses), so
 * the eval script measures shipped code, never a reimplementation.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { recognizeImage } from '../src/vision/pipeline';
import { fenToSquares } from '../src/vision/validate';
import type { PieceKey, PieceRasterMap } from '../src/vision/types';

export { recognizeImage, fenToSquares };

const PIECE_KEYS: PieceKey[] = [
  'wP',
  'wN',
  'wB',
  'wR',
  'wQ',
  'wK',
  'bP',
  'bN',
  'bB',
  'bR',
  'bQ',
  'bK',
];

export const APP_PIECE_SETS = ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast'];

/** Rasterize one app piece set's SVGs (96×96) into gray+alpha planes. */
export async function buildPieceRasters(root: string, set: string): Promise<PieceRasterMap> {
  const map: PieceRasterMap = {};
  for (const key of PIECE_KEYS) {
    const svg = await readFile(path.join(root, 'public', 'pieces', set, `${key}.svg`));
    const { data, info } = await sharp(svg)
      .resize(96, 96)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const gray = new Float32Array(n);
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Identical weights/range to tests/unit/vision-fixtures-helper.ts.
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      alpha[i] = data[i * 4 + 3];
    }
    map[key] = { gray, alpha, width: info.width, height: info.height };
  }
  return map;
}
