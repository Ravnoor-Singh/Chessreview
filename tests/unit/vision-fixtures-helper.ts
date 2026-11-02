/**
 * Shared helpers for the vision fixture suites: decode fixture images and
 * piece SVGs with sharp into the plain pixel buffers the vision core
 * consumes, and score recognition against the manifest ground truth.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fenToSquares } from '@/vision/validate';
import type { PieceKey, PieceRasterMap, RgbaImage } from '@/vision/types';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures', 'vision');

export interface FixtureEntry {
  file: string;
  kind: 'clean' | 'realistic' | 'rotated' | 'screenshot' | 'photo';
  fen: string;
  set: string;
  theme: string;
  coords?: boolean;
  /** Present for generated renders and element screenshots; absent for photos. */
  boardRect?: { x: number; y: number; size: number };
  canvas: { w: number; h: number };
  rotationDeg?: number;
  jpegQuality?: number;
  decorations?: { dot: string; ring: string; highlights: string[] };
}

export async function loadManifest(): Promise<FixtureEntry[]> {
  const raw = await readFile(path.join(FIXTURES_DIR, 'manifest.json'), 'utf8');
  return (JSON.parse(raw) as { fixtures: FixtureEntry[] }).fixtures;
}

export async function decodeImageFile(file: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path.join(FIXTURES_DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

export async function decodeImageBuffer(buffer: Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

const rasterCache = new Map<string, Promise<PieceRasterMap>>();
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

/** Rasterize one app piece set's SVGs (96×96) into gray+alpha planes. */
export function pieceRasters(set: string): Promise<PieceRasterMap> {
  let cached = rasterCache.get(set);
  if (!cached) {
    cached = (async () => {
      const map: PieceRasterMap = {};
      for (const key of PIECE_KEYS) {
        const svg = await readFile(path.join(ROOT, 'public', 'pieces', set, `${key}.svg`));
        const { data, info } = await sharp(svg)
          .resize(96, 96)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const n = info.width * info.height;
        const gray = new Float32Array(n);
        const alpha = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
          alpha[i] = data[i * 4 + 3];
        }
        map[key] = { gray, alpha, width: info.width, height: info.height };
      }
      return map;
    })();
    rasterCache.set(set, cached);
  }
  return cached;
}

export function expectedSquares(fen: string): (PieceKey | null)[] {
  return fenToSquares(fen);
}
