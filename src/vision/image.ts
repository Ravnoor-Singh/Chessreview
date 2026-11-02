/**
 * Small pixel helpers for the vision pipeline: color conversion, bilinear
 * resampling of single-channel planes, and patch extraction. Pure and
 * dependency-free so they run identically in Node tests and the worker.
 */

import type { GrayImage, RgbaImage } from './types';

/** Convert an RGBA buffer to grayscale (Rec. 601 luma; alpha ignored). */
export function rgbaToGray(image: RgbaImage): GrayImage {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return { data: out, width, height };
}

/**
 * Bilinear resample of a single-channel plane.
 * `src` may be bytes or floats; the result is always Float32Array so it can
 * feed template matching without further conversion.
 */
export function resizePlaneF(
  src: ArrayLike<number>,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH);
  if (srcW === dstW && srcH === dstH) {
    for (let i = 0; i < out.length; i++) out[i] = src[i];
    return out;
  }
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1.001, Math.max(0, (y + 0.5) * yRatio - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1.001, Math.max(0, (x + 0.5) * xRatio - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;
      const top = src[y0 * srcW + x0] * (1 - fx) + src[y0 * srcW + x1] * fx;
      const bottom = src[y1 * srcW + x0] * (1 - fx) + src[y1 * srcW + x1] * fx;
      out[y * dstW + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/** Bilinear resample of a grayscale byte image. */
export function resizeGray(image: GrayImage, dstW: number, dstH: number): GrayImage {
  const floats = resizePlaneF(image.data, image.width, image.height, dstW, dstH);
  return { data: new Uint8ClampedArray(floats), width: dstW, height: dstH };
}

/**
 * Extract the sub-rectangle (x, y, w, h) of a grayscale image, resampled to
 * outW×outH floats. Coordinates may be fractional; sampling is bilinear with
 * edge clamping. This is how a board square becomes a canonical patch.
 */
export function cropResizeGrayF(
  image: GrayImage,
  x: number,
  y: number,
  w: number,
  h: number,
  outW: number,
  outH: number,
): Float32Array {
  const out = new Float32Array(outW * outH);
  const { data, width, height } = image;
  for (let oy = 0; oy < outH; oy++) {
    const sy = y + ((oy + 0.5) / outH) * h - 0.5;
    const cy = Math.min(height - 1.001, Math.max(0, sy));
    const y0 = Math.floor(cy);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = cy - y0;
    for (let ox = 0; ox < outW; ox++) {
      const sx = x + ((ox + 0.5) / outW) * w - 0.5;
      const cx = Math.min(width - 1.001, Math.max(0, sx));
      const x0 = Math.floor(cx);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = cx - x0;
      const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
      const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
      out[oy * outW + ox] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/**
 * Separable [1 2 1]/4 blur of a square float patch (edge-clamped).
 * Applied to BOTH templates and patches so the two resampling chains that
 * produced them (SVG rasterized large→canonical vs screenshot square→
 * canonical) end with comparable sharpness; detail-rich glyphs (queens,
 * bishops) otherwise decorrelate.
 */
export function blurPatch(data: Float32Array, size: number): Float32Array {
  const tmp = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(size - 1, x + 1);
      tmp[y * size + x] = (data[y * size + xm] + 2 * data[y * size + x] + data[y * size + xp]) / 4;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(size - 1, y + 1);
    for (let x = 0; x < size; x++) {
      out[y * size + x] = (tmp[ym * size + x] + 2 * tmp[y * size + x] + tmp[yp * size + x]) / 4;
    }
  }
  return out;
}

/**
 * CLAHE-like local contrast normalization: every pixel is recentered on
 * its local mean (box radius ≈ 1/14 of the frame) and scaled by its local
 * standard deviation toward a fixed target spread. Murky, unevenly lit
 * photos get flatter illumination and punchier piece silhouettes; clean
 * screenshots are nearly unchanged. Deterministic, single pass over two
 * summed-area tables.
 */
export function localContrastNormalize(image: GrayImage): GrayImage {
  const { data, width, height } = image;
  const radius = Math.max(8, Math.round(Math.min(width, height) / 14));
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const sumSq = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) {
      const v = data[base + x];
      rowSum += v;
      rowSq += v * v;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + rowSum;
      sumSq[(y + 1) * stride + x + 1] = sumSq[y * stride + x + 1] + rowSq;
    }
  }
  const rectSum = (table: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    table[y1 * stride + x1] -
    table[y0 * stride + x1] -
    table[y1 * stride + x0] +
    table[y0 * stride + x0];
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const n = (x1 - x0) * (y1 - y0);
      const mean = rectSum(sum, x0, y0, x1, y1) / n;
      const variance = Math.max(0, rectSum(sumSq, x0, y0, x1, y1) / n - mean * mean);
      const std = Math.sqrt(variance);
      const scale = 44 / Math.max(std, 14);
      out[y * width + x] = 128 + (data[y * width + x] - mean) * scale;
    }
  }
  return { data: out, width, height };
}

/** Median of a numeric array (copies before sorting). */
export function median(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values as ArrayLike<number>).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
