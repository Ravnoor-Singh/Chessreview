/**
 * Template construction for piece recognition.
 *
 * Templates come from the app's OWN piece-set SVGs (the five sets in
 * `public/pieces/`), rasterized by the caller into {@link PieceRaster}
 * planes. Each template is a piece glyph composited over a flat square
 * background at the canonical patch size, at two scales (1.0 and 0.9, for
 * margin variance between renderers). Matching (recognize.ts) combines:
 *
 *  - alpha-weighted normalized cross-correlation on grayscale,
 *  - the same on the gradient-magnitude (outline) channel — the outline
 *    is what survives when a white glyph sits on a light square,
 *  - an absolute-intensity term: the glyph's mean signed deviation from
 *    the square background. NCC alone is affine-invariant, which makes
 *    wood-tone sets (identical shapes, white = light wood, black = dark
 *    wood) indistinguishable; the intensity term is what separates them.
 *
 * The caller passes the *measured* background grays of the board being
 * read, which is what makes the matcher theme-agnostic without any
 * proprietary board imagery.
 */

import { blurPatch, resizePlaneF } from './image';
import { PIECE_KEYS, type PieceKey, type PieceRaster, type PieceRasterMap } from './types';

/** Canonical square-patch size every template and patch is resampled to. */
export const TEMPLATE_SIZE = 48;

/** Piece scales rendered per piece (1 = fills its cell like the app board).
 * 1.05 compensates the recognizer's slight patch inset (see recognize.ts). */
export const TEMPLATE_SCALES = [1.05, 1, 0.9] as const;

export interface Template {
  piece: PieceKey;
  scale: number;
  /** Composited grayscale patch, TEMPLATE_SIZE² floats. */
  data: Float32Array;
  /** Gradient magnitude of `data`, same length. */
  grad: Float32Array;
  /** Per-pixel match weights (alpha- and center-weighted), same length. */
  weight: Float32Array;
  /** Soft glyph mask (from alpha), same length — for the intensity term. */
  mask: Float32Array;
  // Precomputed weighted sums for the two NCC channels.
  wSum: number;
  wtSum: number;
  wttSum: number;
  gtSum: number;
  gttSum: number;
  /** Σ mask and the glyph's mean signed deviation from the background. */
  maskSum: number;
  maskDelta: number;
}

/** A piece glyph resampled to the canonical size (gray + alpha planes). */
export interface CanonicalPiece {
  gray: Float32Array;
  alpha: Float32Array;
}

const canonicalCache = new WeakMap<PieceRaster, Map<number, CanonicalPiece>>();

/** Resample a piece raster to the canonical size at the given glyph scale. */
export function canonicalPiece(raster: PieceRaster, scale: number): CanonicalPiece {
  let byScale = canonicalCache.get(raster);
  if (!byScale) {
    byScale = new Map();
    canonicalCache.set(raster, byScale);
  }
  const cached = byScale.get(scale);
  if (cached) return cached;

  const T = TEMPLATE_SIZE;
  let gray = resizePlaneF(raster.gray, raster.width, raster.height, T, T);
  let alpha = resizePlaneF(raster.alpha, raster.width, raster.height, T, T);
  if (scale !== 1) {
    const inner = Math.max(8, Math.round(T * scale));
    const g2 = resizePlaneF(gray, T, T, inner, inner);
    const a2 = resizePlaneF(alpha, T, T, inner, inner);
    gray = new Float32Array(T * T);
    alpha = new Float32Array(T * T);
    // off > 0 pads (scale < 1); off < 0 center-crops (scale > 1).
    const off = Math.floor((T - inner) / 2);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const sx = x - off;
        const sy = y - off;
        if (sx < 0 || sy < 0 || sx >= inner || sy >= inner) continue;
        gray[y * T + x] = g2[sy * inner + sx];
        alpha[y * T + x] = a2[sy * inner + sx];
      }
    }
  }
  const piece = { gray, alpha };
  byScale.set(scale, piece);
  return piece;
}

/** Center weight: 1 at the patch center, ~0.55 at the corners. Corner
 * coordinates text and capture rings live at the edges; the glyph lives in
 * the middle. */
function centerWeight(x: number, y: number): number {
  const T = TEMPLATE_SIZE;
  const dx = (x + 0.5) / T - 0.5;
  const dy = (y + 0.5) / T - 0.5;
  const d2 = dx * dx + dy * dy; // 0 center … 0.5 corners
  return 1 - 0.45 * Math.min(1, d2 / 0.5);
}

/** Sobel gradient magnitude of a canonical patch. */
export function gradientMagnitude(data: Float32Array): Float32Array {
  const T = TEMPLATE_SIZE;
  const out = new Float32Array(T * T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(T - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(T - 1, y + 1);
      const gx =
        data[y * T + xp] -
        data[y * T + xm] +
        0.5 * (data[yp * T + xp] - data[yp * T + xm] + data[ym * T + xp] - data[ym * T + xm]);
      const gy =
        data[yp * T + x] -
        data[ym * T + x] +
        0.5 * (data[yp * T + xp] - data[ym * T + xp] + data[yp * T + xm] - data[ym * T + xm]);
      out[y * T + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/**
 * Build the template list for one background gray from one or more piece
 * sets. Passing several sets costs linearly more matching time but makes
 * recognition work for screenshots drawn with any of the app's sets.
 */
export function buildTemplates(sets: PieceRasterMap[], background: number): Template[] {
  const T = TEMPLATE_SIZE;
  const templates: Template[] = [];
  for (const set of sets) {
    for (const key of PIECE_KEYS) {
      const raster = set[key];
      if (!raster) continue;
      for (const scale of TEMPLATE_SCALES) {
        const piece = canonicalPiece(raster, scale);
        const raw = new Float32Array(T * T);
        const weight = new Float32Array(T * T);
        const mask = new Float32Array(T * T);
        for (let y = 0; y < T; y++) {
          for (let x = 0; x < T; x++) {
            const i = y * T + x;
            const a = Math.max(0, Math.min(1, piece.alpha[i] / 255));
            raw[i] = a * piece.gray[i] + (1 - a) * background;
            weight[i] = centerWeight(x, y) * (0.25 + 0.75 * a);
            mask[i] = Math.max(0, (a - 0.35) / 0.65);
          }
        }
        // Equalize sharpness with the patch chain (see image.blurPatch),
        // then compute every precomputed sum from the blurred data.
        const data = blurPatch(raw, T);
        let wSum = 0;
        let wtSum = 0;
        let wttSum = 0;
        let maskSum = 0;
        let maskDeltaSum = 0;
        for (let i = 0; i < T * T; i++) {
          const w = weight[i];
          const m = mask[i];
          const value = data[i];
          wSum += w;
          wtSum += w * value;
          wttSum += w * value * value;
          maskSum += m;
          maskDeltaSum += m * (value - background);
        }
        const grad = gradientMagnitude(data);
        let gtSum = 0;
        let gttSum = 0;
        for (let i = 0; i < T * T; i++) {
          gtSum += weight[i] * grad[i];
          gttSum += weight[i] * grad[i] * grad[i];
        }
        templates.push({
          piece: key,
          scale,
          data,
          grad,
          weight,
          mask,
          wSum,
          wtSum,
          wttSum,
          gtSum,
          gttSum,
          maskSum,
          maskDelta: maskSum > 0 ? maskDeltaSum / maskSum : 0,
        });
      }
    }
  }
  return templates;
}
