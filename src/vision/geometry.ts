/**
 * Planar geometry for the vision retry paths: image rotation, skew
 * estimation, and projective (homography) sampling for boards shot in
 * perspective. All deterministic, no ML.
 *
 * Conventions: image coordinates have y pointing DOWN. A positive skew
 * angle means the board's grid lines are rotated clockwise on screen by
 * that many degrees (the usual phone-photo tilt).
 */

import { resizeGray } from './image';
import type { GrayImage } from './types';

export interface Point {
  x: number;
  y: number;
}

/** A board outline: corners in TL, TR, BR, BL order. */
export type Quad = [Point, Point, Point, Point];

/** Bilinear sample of a gray image at fractional coordinates (clamped). */
export function sampleBilinear(image: GrayImage, x: number, y: number): number {
  const { data, width, height } = image;
  const cx = Math.min(Math.max(x, 0), width - 1);
  const cy = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
  const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Rotate a gray image by `angleRad` around its center, keeping the same
 * canvas size. Pixels that map outside the source are filled with the
 * image's median-ish gray (128) — callers only read the board area.
 * Positive angles rotate the CONTENT clockwise (y-down coordinates).
 */
export function rotateGray(image: GrayImage, angleRad: number): GrayImage {
  const { width, height } = image;
  const out = new Uint8ClampedArray(width * height).fill(128);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // Inverse-map the destination pixel back into the source.
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
      out[y * width + x] = sampleBilinear(image, sx, sy);
    }
  }
  return { data: out, width, height };
}

/**
 * Skew estimate: the CORRECTION angle whose application (via rotateGray)
 * makes the edge profiles of the image most "peaky" (Σ profile² is
 * maximal when grid lines align with the axes). Searches ±10° at 1°
 * steps, then ±3° at 0.5° steps, then refines ±0.5° at 0.125° steps on
 * the ≤320 px working copy. (The staged windows matter: a 1.5° tilt of a
 * dense start position has its energy peak outside a ±1° refine of the
 * coarse winner.) Returns degrees; ~0 for an axis-aligned board.
 */
export function estimateSkewDegrees(image: GrayImage): number {
  const scale = Math.min(1, 320 / Math.max(image.width, image.height));
  const small =
    scale === 1
      ? image
      : resizeGray(
          image,
          Math.max(8, Math.round(image.width * scale)),
          Math.max(8, Math.round(image.height * scale)),
        );

  const energy = (angleDeg: number): number => {
    const rotated = rotateGray(small, (angleDeg * Math.PI) / 180);
    const { data, width, height } = rotated;
    let sum = 0;
    // Column-profile energy: sum over columns of (summed |gx|)².
    for (let x = 0; x < width - 1; x++) {
      let colSum = 0;
      for (let y = 0; y < height; y++) {
        colSum += Math.abs(data[y * width + x + 1] - data[y * width + x]);
      }
      sum += colSum * colSum;
    }
    for (let y = 0; y < height - 1; y++) {
      let rowSum = 0;
      const base = y * width;
      for (let x = 0; x < width; x++) {
        rowSum += Math.abs(data[base + width + x] - data[base + x]);
      }
      sum += rowSum * rowSum;
    }
    return sum;
  };

  let best = 0;
  let bestEnergy = energy(0);
  const scan = (from: number, to: number, step: number) => {
    for (let a = from; a <= to + 1e-9; a += step) {
      if (Math.abs(a - best) < 1e-9) continue;
      const e = energy(a);
      if (e > bestEnergy) {
        bestEnergy = e;
        best = a;
      }
    }
  };
  scan(-10, 10, 1);
  scan(best - 3, best + 3, 0.5);
  scan(best - 0.5, best + 0.5, 0.125);
  return best;
}

/** 3×3 homography mapping (u, v) in the unit square to image points of `quad`. */
export function homographyFromQuad(quad: Quad): Float64Array {
  const dst: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const src = quad.map((p) => [p.x, p.y] as [number, number]);
  // Solve H · dst = src (8 unknowns, h33 = 1) by Gaussian elimination.
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i];
    const [X, Y] = src[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-12;
    for (let j = col; j < n; j++) A[col][j] /= d;
    b[col] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = col; j < n; j++) A[r][j] -= f * A[col][j];
      b[r] -= f * b[col];
    }
  }
  return Float64Array.from([...b, 1]);
}

/** Apply a homography to a point. */
export function applyHomography(H: Float64Array, u: number, v: number): Point {
  const w = H[6] * u + H[7] * v + H[8];
  return {
    x: (H[0] * u + H[1] * v + H[2]) / w,
    y: (H[3] * u + H[4] * v + H[5]) / w,
  };
}
