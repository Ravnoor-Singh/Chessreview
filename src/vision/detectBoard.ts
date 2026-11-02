/**
 * Board detection: locate the 8×8 board rectangle in a screenshot.
 *
 * Method (no ML, fully deterministic):
 *  1. Downscale to ≤ 640 px on the long side.
 *  2. Build horizontal/vertical edge profiles (summed absolute gradients).
 *     A chessboard's grid lines make both profiles strongly periodic with
 *     period = square size; the fundamental period is found by
 *     autocorrelation over the plausible square-size range.
 *  3. The phase (grid-line offset mod period) comes from aligning the edge
 *     profiles to that period. Every line position congruent to the phase
 *     is a candidate board edge.
 *  4. Each candidate rectangle is scored by *sampling*: for all 64 squares
 *     the median of the four corner patches estimates the square's
 *     background; a true board has a large, consistent light-vs-dark
 *     contrast between the two parity classes. Patch means come from a
 *     summed-area table, so scoring a candidate is a few hundred table
 *     lookups. The best candidate is refined by coordinate descent,
 *     re-verified at full resolution, and rejected (null) when the
 *     contrast evidence is weak — an honest "no board found" beats a
 *     wrong rectangle.
 *
 * In scope: boards filling most of the frame, UI margins/borders around
 * the board, coordinate labels inside corner squares, any square colors.
 * Out of scope: rotated or perspective-distorted boards (the fixture suite
 * measures those separately and detection may legitimately return null).
 */

import { applyHomography, homographyFromQuad, type Quad } from './geometry';
import { resizeGray } from './image';
import type { DetectedBoard, GrayImage } from './types';

const WORK_MAX_DIM = 640;
/** Minimum light/dark separation (gray levels) at full res to accept a board. */
const MIN_CONTRAST = 26;

interface SampledScore {
  contrast: number;
  spread: number;
  score: number;
}

/** Summed-area table over a grayscale image for O(1) rectangle means. */
class IntegralImage {
  private readonly table: Float64Array;
  private readonly stride: number;
  readonly width: number;
  readonly height: number;

  constructor(image: GrayImage) {
    this.width = image.width;
    this.height = image.height;
    this.stride = image.width + 1;
    this.table = new Float64Array(this.stride * (image.height + 1));
    const { data, width } = image;
    for (let y = 0; y < image.height; y++) {
      let rowSum = 0;
      const base = y * width;
      const tBase = (y + 1) * this.stride;
      const tPrev = y * this.stride;
      for (let x = 0; x < width; x++) {
        rowSum += data[base + x];
        this.table[tBase + x + 1] = this.table[tPrev + x + 1] + rowSum;
      }
    }
  }

  /** Mean intensity over the rectangle [x, x+w) × [y, y+h), clamped to the image. */
  rectMean(x: number, y: number, w: number, h: number): number {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return 0;
    const s = this.stride;
    const sum =
      this.table[y1 * s + x1] -
      this.table[y0 * s + x1] -
      this.table[y1 * s + x0] +
      this.table[y0 * s + x0];
    return sum / ((x1 - x0) * (y1 - y0));
  }
}

function median4(a: number, b: number, c: number, d: number): number {
  const sorted = [a, b, c, d].sort((m, n) => m - n);
  return (sorted[1] + sorted[2]) / 2;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Estimate one square's background: median of its four corner patches. */
function cellBackground(sat: IntegralImage, cellX: number, cellY: number, cell: number): number {
  const patch = Math.max(2, cell * 0.16);
  const inset = Math.max(1, cell * 0.03);
  const far = cell - inset - patch;
  return median4(
    sat.rectMean(cellX + inset, cellY + inset, patch, patch),
    sat.rectMean(cellX + far, cellY + inset, patch, patch),
    sat.rectMean(cellX + inset, cellY + far, patch, patch),
    sat.rectMean(cellX + far, cellY + far, patch, patch),
  );
}

/** Checkerboard evidence for a candidate rectangle. */
function sampleBoard(sat: IntegralImage, x: number, y: number, size: number): SampledScore {
  const cell = size / 8;
  const light: number[] = [];
  const dark: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const v = cellBackground(sat, x + col * cell, y + row * cell, cell);
      ((row + col) % 2 === 0 ? light : dark).push(v);
    }
  }
  const lightMed = medianOf(light);
  const darkMed = medianOf(dark);
  const contrast = Math.abs(lightMed - darkMed);
  const spreadOf = (vals: number[], med: number) =>
    vals.reduce((acc, v) => acc + Math.abs(v - med), 0) / Math.max(1, vals.length);
  const spread = (spreadOf(light, lightMed) + spreadOf(dark, darkMed)) / 2;
  // True boards: big parity contrast, small within-parity scatter.
  return { contrast, spread, score: contrast - 0.9 * spread };
}

function edgeProfiles(gray: GrayImage): { col: Float64Array; row: Float64Array } {
  const { data, width, height } = gray;
  const col = new Float64Array(width);
  const row = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width - 1; x++) {
      col[x] += Math.abs(data[base + x + 1] - data[base + x]);
    }
    if (y < height - 1) {
      for (let x = 0; x < width; x++) {
        row[y] += Math.abs(data[base + width + x] - data[base + x]);
      }
    }
  }
  return { col, row };
}

function autocorr(profile: Float64Array, lag: number): number {
  let sum = 0;
  for (let i = 0; i + lag < profile.length; i++) sum += profile[i] * profile[i + lag];
  return sum;
}

/**
 * Candidate periods of the combined edge profiles within [minLag, maxLag],
 * best first. The board's grid is usually the argmax — but real photos
 * carry competing periodicities (a coordinate frame's tick text, a table
 * pattern), so up to three distinct local maxima above 55% of the peak
 * are returned and the candidate sweep lets checkerboard evidence decide.
 * A peak that is an exact multiple of a near-peak smaller lag is replaced
 * by that fundamental (harmonic protection: an earlier single-period
 * version took ANY smaller lag above 80% of the peak, and on a full
 * lichess page a coincidental 27 px alignment — 2/3 of the true 41 px
 * cell — cleared that bar and the detector chased a phantom board).
 */
function findPeriods(
  col: Float64Array,
  row: Float64Array,
  minLag: number,
  maxLag: number,
): number[] {
  const scores = new Map<number, number>();
  let maxA = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const a = autocorr(col, lag) + autocorr(row, lag);
    scores.set(lag, a);
    if (a > maxA) maxA = a;
  }
  if (maxA <= 0) return [];
  const fundamentalOf = (peak: number): number => {
    for (let lag = minLag; lag < peak; lag++) {
      const ratio = peak / lag;
      const multiple = Math.round(ratio);
      if (
        multiple >= 2 &&
        Math.abs(ratio - multiple) <= 0.05 &&
        (scores.get(lag) ?? 0) >= 0.9 * (scores.get(peak) ?? 0)
      ) {
        return lag;
      }
    }
    return peak;
  };
  const peaks: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const a = scores.get(lag) ?? 0;
    if (a < 0.55 * maxA) continue;
    if (a < (scores.get(lag - 1) ?? 0) || a < (scores.get(lag + 1) ?? 0)) continue; // local maxima only
    peaks.push(lag);
  }
  peaks.sort((m, n) => (scores.get(n) ?? 0) - (scores.get(m) ?? 0));
  const out: number[] = [];
  for (const peak of peaks) {
    const p = fundamentalOf(peak);
    if (!out.some((q) => Math.abs(q - p) <= 1)) out.push(p);
    if (out.length >= 3) break;
  }
  return out;
}

/** Best grid-line phase (offset mod period) for one edge profile. */
function findPhase(profile: Float64Array, period: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let o = 0; o < period; o++) {
    let score = 0;
    for (let x = o; x < profile.length; x += period) score += profile[x];
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

interface RectState {
  x: number;
  y: number;
  size: number;
  sampled: SampledScore;
}

/**
 * Coordinate-descent refinement: wiggle x, then y, then size, accepting any
 * strict improvement, until a full pass changes nothing (max `passes`).
 */
function refine(
  sat: IntegralImage,
  start: RectState,
  range: number,
  sizeRange: number,
  passes: number,
): RectState {
  let cur = start;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    const tryMove = (x: number, y: number, size: number) => {
      if (x < 0 || y < 0 || x + size > sat.width || y + size > sat.height || size < 16) return;
      const sampled = sampleBoard(sat, x, y, size);
      if (sampled.score > cur.sampled.score) {
        cur = { x, y, size, sampled };
        improved = true;
      }
    };
    for (let d = -range; d <= range; d += 2) if (d !== 0) tryMove(cur.x + d, cur.y, cur.size);
    for (let d = -range; d <= range; d += 2) if (d !== 0) tryMove(cur.x, cur.y + d, cur.size);
    for (let d = -sizeRange; d <= sizeRange; d += 1)
      if (d !== 0) tryMove(cur.x, cur.y, cur.size + d);
    if (!improved) break;
  }
  return cur;
}

/**
 * Locate the board in a grayscale image.
 * Returns the rectangle in the image's own pixel coordinates, or null when
 * no rectangle carries convincing checkerboard evidence.
 */
export function detectBoard(image: GrayImage): DetectedBoard | null {
  const { width, height } = image;
  if (width < 64 || height < 64) return null;

  const scale = Math.min(1, WORK_MAX_DIM / Math.max(width, height));
  const small =
    scale === 1
      ? image
      : resizeGray(
          image,
          Math.max(8, Math.round(width * scale)),
          Math.max(8, Math.round(height * scale)),
        );
  const W = small.width;
  const H = small.height;
  const minDim = Math.min(W, H);

  const { col, row } = edgeProfiles(small);
  const pMin = Math.max(8, Math.floor(minDim / 24));
  const pMax = Math.floor(minDim / 8);
  const periods = findPeriods(col, row, pMin, pMax);
  if (periods.length === 0) return null;

  // Candidate board edges for one axis. Grid lines sit at positions
  // ≡ phase (mod period), so edges are phase + k·period — including
  // phase − period: when the board's own edge is the outermost line, the
  // phase finder aligns to the first INTERIOR line and the edge itself
  // sits one period earlier (the classic failure for boards that fill
  // the frame: phase near period−1 leaves no forward start at all).
  // The image boundary itself is also a candidate for flush boards.
  const starts = (phase: number, period: number, limit: number, size: number): number[] => {
    const out = new Set<number>();
    for (let s = phase - period; s + size <= limit; s += period) {
      if (s >= 0) out.add(s);
    }
    if (limit - size >= 0) {
      out.add(0);
      out.add(limit - size);
    }
    return [...out];
  };

  // The autocorrelation lag is an integer, but the true cell size can be
  // a fraction of a pixel off (a 0.9 px/cell error is a 7 px board-size
  // error). Sweep cell sizes period−1, period, period+1 per candidate
  // period and let the sampled checkerboard evidence pick; refinement
  // polishes the winner.
  const smallSat = new IntegralImage(small);
  let best: RectState | null = null;
  let bestPeriod = periods[0];
  for (const period of periods) {
    const phaseX = findPhase(col, period);
    const phaseY = findPhase(row, period);
    for (const cellDelta of [-1, 0, 1]) {
      const size = (period + cellDelta) * 8;
      if (size < 32) continue;
      for (const sx of starts(phaseX, period, W, size)) {
        for (const sy of starts(phaseY, period, H, size)) {
          const sampled = sampleBoard(smallSat, sx, sy, size);
          if (!best || sampled.score > best.sampled.score) {
            best = { x: sx, y: sy, size, sampled };
            bestPeriod = period;
          }
        }
      }
    }
  }
  if (!best) return null;

  const refinedSmall = refine(smallSat, best, Math.max(2, Math.floor(bestPeriod / 4)), 2, 3);

  // Map back to full resolution and re-verify + refine there.
  const fullSat = new IntegralImage(image);
  const startFull: RectState = {
    x: refinedSmall.x / scale,
    y: refinedSmall.y / scale,
    size: refinedSmall.size / scale,
    sampled: sampleBoard(
      fullSat,
      refinedSmall.x / scale,
      refinedSmall.y / scale,
      refinedSmall.size / scale,
    ),
  };
  const refinedFull = refine(
    fullSat,
    startFull,
    Math.max(2, Math.round(3 / scale)),
    Math.max(2, Math.round(3 / scale)),
    2,
  );

  // Grid-line snap: the sampled-contrast objective is flat within ±2 px,
  // but a 2 px error puts a full-contrast strip of the neighboring square
  // into every patch and wrecks template matching. The true rectangle
  // maximizes the edge-profile mass sitting exactly on the 9 grid lines.
  const snapped = snapToGridLines(image, refinedFull);
  const finalRect =
    snapped.sampled.contrast >= refinedFull.sampled.contrast * 0.85 ? snapped : refinedFull;

  if (finalRect.sampled.contrast < MIN_CONTRAST) return null;
  const confidence = Math.max(0, Math.min(1, (finalRect.sampled.contrast - MIN_CONTRAST) / 110));
  return { x: finalRect.x, y: finalRect.y, size: finalRect.size, confidence };
}

/**
 * Checkerboard evidence of a general quadrilateral: each cell's
 * background is estimated from small patches around its four
 * homography-mapped corners, then scored exactly like `sampleBoard`
 * (parity contrast minus within-parity spread).
 */
function sampleQuad(sat: IntegralImage, quad: Quad): SampledScore {
  const H = homographyFromQuad(quad);
  const patchR = 3;
  const cellBackgroundAt = (u: number, v: number): number => {
    const p = applyHomography(H, u, v);
    return sat.rectMean(p.x - patchR, p.y - patchR, patchR * 2, patchR * 2);
  };
  const light: number[] = [];
  const dark: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const u0 = (col + 0.06) / 8;
      const u1 = (col + 0.94) / 8;
      const v0 = (row + 0.06) / 8;
      const v1 = (row + 0.94) / 8;
      const bg = median4(
        cellBackgroundAt(u0, v0),
        cellBackgroundAt(u1, v0),
        cellBackgroundAt(u0, v1),
        cellBackgroundAt(u1, v1),
      );
      ((row + col) % 2 === 0 ? light : dark).push(bg);
    }
  }
  const lightMed = medianOf(light);
  const darkMed = medianOf(dark);
  const contrast = Math.abs(lightMed - darkMed);
  const spreadOf = (vals: number[], med: number) =>
    vals.reduce((acc, v) => acc + Math.abs(v - med), 0) / Math.max(1, vals.length);
  const spread = (spreadOf(light, lightMed) + spreadOf(dark, darkMed)) / 2;
  return { contrast, spread, score: contrast - 0.9 * spread };
}

export interface QuadFit {
  quad: Quad;
  /** Checkerboard score of the refined quad. */
  score: number;
  /** Checkerboard score of the original axis-aligned rectangle. */
  rectScore: number;
}

/** Coordinate descent on quad corners (steps 8→1 px) maximizing the score. */
function descendQuad(
  sat: IntegralImage,
  start: Quad,
  startScore: number,
): { quad: Quad; score: number } {
  let quad: Quad = start.map((p) => ({ ...p })) as Quad;
  let bestScore = startScore;
  for (const step of [8, 4, 2, 1]) {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 24) {
      improved = false;
      for (let corner = 0; corner < 4; corner++) {
        for (const [dx, dy] of [
          [step, 0],
          [-step, 0],
          [0, step],
          [0, -step],
        ] as const) {
          const candidate = quad.map((p, i) =>
            i === corner ? { x: p.x + dx, y: p.y + dy } : p,
          ) as Quad;
          const { score } = sampleQuad(sat, candidate);
          if (score > bestScore) {
            bestScore = score;
            quad = candidate;
            improved = true;
          }
        }
      }
    }
  }
  return { quad, score: bestScore };
}

/**
 * Refine a detected rectangle into a perspective quadrilateral,
 * maximizing the quad checkerboard score. Photographs of physical boards
 * are trapezoids, not rectangles; this is what lets the sampler follow
 * foreshortened cells. Because coordinate descent is local, several
 * starts are tried: the rectangle itself, center-scaled variants, and a
 * trapezoid with a foreshortened top edge (the common photo geometry).
 * For true rectangles every start stays put and the scores tie.
 */
export function refineBoardQuad(image: GrayImage, rect: DetectedBoard): QuadFit {
  const sat = new IntegralImage(image);
  const rectQuad: Quad = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.size, y: rect.y },
    { x: rect.x + rect.size, y: rect.y + rect.size },
    { x: rect.x, y: rect.y + rect.size },
  ];
  const rectScore = sampleQuad(sat, rectQuad).score;
  const cx = rect.x + rect.size / 2;
  const cy = rect.y + rect.size / 2;
  const scaled = (f: number): Quad =>
    rectQuad.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f })) as Quad;
  const trapezoid = (topInset: number): Quad => {
    const inset = rect.size * topInset;
    return [
      { x: rect.x + inset, y: rect.y },
      { x: rect.x + rect.size - inset, y: rect.y },
      { x: rect.x + rect.size, y: rect.y + rect.size },
      { x: rect.x, y: rect.y + rect.size },
    ];
  };
  let best = { quad: rectQuad, score: rectScore };
  for (const start of [rectQuad, scaled(0.94), scaled(1.06), trapezoid(0.045), trapezoid(-0.045)]) {
    const result = descendQuad(sat, start, sampleQuad(sat, start).score);
    if (result.score > best.score) best = result;
  }
  return { quad: best.quad, score: best.score, rectScore };
}

/**
 * Snap a rectangle onto the board's grid lines: search ±10 px of position
 * and ±14 px of size for the placement whose 9 vertical + 9 horizontal
 * grid lines carry the most edge-profile mass (3-tap sums, so a 1–2 px
 * anti-aliased transition still peaks at the right place). The ranges
 * cover the worst observed refinement miss (a lichess endgame shot whose
 * contrast-refined rect was off by −6 px in x and +8 px in size, which
 * sheared the far columns by a full cell).
 */
function snapToGridLines(image: GrayImage, start: RectState): RectState {
  const { col, row } = edgeProfiles(image);
  const lineMass = (profile: Float64Array, origin: number, cell: number): number => {
    let sum = 0;
    for (let k = 0; k <= 8; k++) {
      const p = Math.round(origin + k * cell);
      for (let d = -1; d <= 1; d++) {
        const idx = p + d;
        if (idx >= 0 && idx < profile.length) sum += profile[idx];
      }
    }
    return sum;
  };
  const mass = (x: number, y: number, size: number) =>
    lineMass(col, x, size / 8) + lineMass(row, y, size / 8);

  let best = { x: start.x, y: start.y, size: start.size, mass: mass(start.x, start.y, start.size) };
  for (let dx = -10; dx <= 10; dx++) {
    for (let dy = -10; dy <= 10; dy++) {
      for (let ds = -14; ds <= 14; ds++) {
        const x = start.x + dx;
        const y = start.y + dy;
        const size = start.size + ds;
        if (x < 0 || y < 0 || x + size > image.width || y + size > image.height || size < 32)
          continue;
        const m = mass(x, y, size);
        if (m > best.mass) best = { x, y, size, mass: m };
      }
    }
  }
  const sat = new IntegralImage(image);
  return {
    x: best.x,
    y: best.y,
    size: best.size,
    sampled: sampleBoard(sat, best.x, best.y, best.size),
  };
}
