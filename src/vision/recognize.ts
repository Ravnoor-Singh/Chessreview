/**
 * Per-square piece recognition by template matching.
 *
 * For every square of a detected board:
 *  1. The square is resampled to the canonical 48×48 patch.
 *  2. Its background gray is estimated from the patch's corner ring (pieces
 *     almost never cover all four corners) — this makes the matcher work
 *     for plain squares, last-move-highlighted squares (different tint)
 *     and any square-color theme.
 *  3. Templates for the square's parity are built over the *median*
 *     background of that parity and scored with a combined match:
 *     grayscale NCC + gradient (outline) NCC − an absolute-intensity
 *     penalty (see templates.ts for why all three are needed).
 *  4. "Empty" is decided on evidence, not on the best piece score alone:
 *     a square whose interior barely deviates from its own background is
 *     empty with high confidence; a legal-move dot (a soft, low-contrast
 *     center disc) has a small intensity range and never reaches piece
 *     contrast, so it is classified empty; a capture ring sits at the
 *     patch edge where match weights are lowest and does not change the
 *     winning piece.
 *
 * Confidence is an honest transform of the match score and its margin
 * over the runner-up — it is calibrated so genuinely ambiguous squares
 * (glare, tiny boards, foreign piece sets) report low numbers and get
 * highlighted for the user in the review step. It is NOT a measured
 * probability.
 */

import { applyHomography, homographyFromQuad, sampleBilinear, type Quad } from './geometry';
import { blurPatch, cropResizeGrayF, median, rgbaToGray } from './image';
import { TEMPLATE_SIZE, buildTemplates, gradientMagnitude, type Template } from './templates';
import type { BoardRect, GrayImage, PieceRasterMap, RgbaImage, SquareResult } from './types';

const T = TEMPLATE_SIZE;
/** Interior deviation (gray levels) below which a square is surely empty. */
const EMPTY_DEVIATION = 5.5;
/** Combined match score below which the best piece is not believed. */
export const MATCH_THRESHOLD = 0.45;

interface PatchStats {
  /** Blurred patch used for template matching (templates are blurred too). */
  patch: Float32Array;
  patchGrad: Float32Array;
  /** Background estimate from the corner ring. */
  background: number;
  /** Mean |pixel − background| over the interior (outer 12% excluded). */
  interiorDeviation: number;
  /** Robust intensity range (p95 − p5) over the whole patch. */
  range: number;
  /**
   * RMS distance of the |pixel − background| mass from its own centroid.
   * A legal-move dot is a compact disc (≲ 7 px at canonical size); any
   * real glyph spreads its mass much wider (≳ 10 px).
   */
  massRadius: number;
}

function patchStats(patch: Float32Array): PatchStats {
  const frame = Math.max(3, Math.floor(T * 0.14));
  const corners: number[] = [];
  const boxes: [number, number][] = [
    [0, 0],
    [T - frame, 0],
    [0, T - frame],
    [T - frame, T - frame],
  ];
  for (const [bx, by] of boxes) {
    for (let y = by; y < by + frame; y++) {
      for (let x = bx; x < bx + frame; x++) corners.push(patch[y * T + x]);
    }
  }
  const background = median(corners);

  const margin = Math.floor(T * 0.12);
  let devSum = 0;
  let devCount = 0;
  const hist = new Uint32Array(256);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const v = patch[y * T + x];
      hist[Math.max(0, Math.min(255, Math.round(v)))]++;
      if (x >= margin && x < T - margin && y >= margin && y < T - margin) {
        devSum += Math.abs(v - background);
        devCount++;
      }
    }
  }
  const percentile = (p: number): number => {
    const target = (p / 100) * T * T;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  };

  // Mass moments of |pixel − background| for the dot compactness test.
  let mass = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = Math.abs(patch[y * T + x] - background);
      mass += d;
      mx += d * x;
      my += d * y;
    }
  }
  let massRadius = 0;
  if (mass > 0) {
    const cx = mx / mass;
    const cy = my / mass;
    let acc = 0;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        acc +=
          Math.abs(patch[y * T + x] - background) * ((x - cx) * (x - cx) + (y - cy) * (y - cy));
      }
    }
    massRadius = Math.sqrt(acc / mass);
  }

  const blurred = blurPatch(patch, T);
  return {
    patch: blurred,
    patchGrad: gradientMagnitude(blurred),
    background,
    interiorDeviation: devCount > 0 ? devSum / devCount : 0,
    range: percentile(95) - percentile(5),
    massRadius,
  };
}

interface ChannelSums {
  wp: number;
  wpp: number;
  wtp: number;
}

function channelSums(patch: Float32Array, t: Template, useGrad: boolean): ChannelSums {
  let wp = 0;
  let wpp = 0;
  let wtp = 0;
  const { weight } = t;
  const tData = useGrad ? t.grad : t.data;
  for (let i = 0; i < patch.length; i++) {
    const w = weight[i];
    const p = patch[i];
    wp += w * p;
    wpp += w * p * p;
    wtp += w * tData[i] * p;
  }
  return { wp, wpp, wtp };
}

function nccFromSums(s: ChannelSums, tSum: number, ttSum: number, wSum: number): number {
  const cov = s.wtp - (tSum * s.wp) / wSum;
  const varT = ttSum - (tSum * tSum) / wSum;
  const varP = s.wpp - (s.wp * s.wp) / wSum;
  if (varT <= 1e-6 || varP <= 1e-6) return 0;
  return cov / Math.sqrt(varT * varP);
}

/**
 * Combined match score for one template against one patch:
 * 0.58·grayNCC + 0.30·outlineNCC − intensity penalty (≤ 0.5).
 * The penalty compares the glyph's mean signed deviation from the square
 * background under this template's mask with the template's own — it is
 * the only term that can tell identical shapes of different colors apart.
 */
function matchScore(
  patch: Float32Array,
  patchGrad: Float32Array,
  background: number,
  t: Template,
): number {
  const gray = nccFromSums(channelSums(patch, t, false), t.wtSum, t.wttSum, t.wSum);
  const edge = nccFromSums(channelSums(patchGrad, t, true), t.gtSum, t.gttSum, t.wSum);
  let maskPatchSum = 0;
  for (let i = 0; i < patch.length; i++) maskPatchSum += t.mask[i] * patch[i];
  const patchDelta = t.maskSum > 0 ? maskPatchSum / t.maskSum - background : 0;
  const penalty = Math.min(0.5, Math.abs(patchDelta - t.maskDelta) / 300);
  return 0.58 * gray + 0.3 * edge - penalty;
}

function classifySquare(stats: PatchStats, templates: Template[]): SquareResult {
  const { patch, patchGrad, background, interiorDeviation, range, massRadius } = stats;

  // Flat square: nothing drawn on it. (A highlighted-but-empty square is
  // still flat — its background estimate already absorbed the tint.)
  if (interiorDeviation < EMPTY_DEVIATION) {
    return {
      piece: null,
      confidence: Math.min(0.99, 1 - interiorDeviation / (EMPTY_DEVIATION * 2)),
    };
  }

  const bestByPiece = new Map<string, number>();
  for (const t of templates) {
    const score = matchScore(patch, patchGrad, background, t);
    const prev = bestByPiece.get(t.piece) ?? -Infinity;
    if (score > prev) bestByPiece.set(t.piece, score);
  }
  let best: { piece: SquareResult['piece']; score: number } = { piece: null, score: -Infinity };
  let secondScore = -Infinity;
  for (const [piece, score] of bestByPiece) {
    if (score > best.score) {
      secondScore = best.score;
      best = { piece: piece as SquareResult['piece'], score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // A legal-move dot on an empty square: a soft disc whose intensity range
  // stays far below any real glyph's AND whose deviation mass is compact
  // and centered. The compactness gate matters: a low-contrast glyph
  // (light-wood piece on a dark square) also has a small intensity range,
  // but its mass spreads over the whole square.
  if (range < 85 && best.score < 0.72 && massRadius < 8.5) {
    return { piece: null, confidence: 0.9 };
  }
  if (best.score < MATCH_THRESHOLD) {
    // A weak but clearly-winning match on a square that definitely holds
    // something: report the piece at low confidence so the review UI
    // highlights it for checking, instead of silently dropping it.
    const margin = best.score - Math.max(0, secondScore);
    if (best.score >= 0.3 && margin >= 0.04 && interiorDeviation >= 8) {
      return { piece: best.piece, confidence: Math.max(0.2, Math.min(0.45, best.score)) };
    }
    // Something is drawn but no template explains it: call it empty only
    // when the deviation is modest; otherwise still report the best piece
    // at low confidence so the review UI highlights the square.
    if (interiorDeviation < 14) {
      return { piece: null, confidence: Math.max(0.35, 0.75 - best.score / 2) };
    }
    return {
      piece: best.piece,
      confidence: Math.max(0.15, Math.min(0.45, best.score)),
    };
  }

  const margin = Math.max(0, best.score - Math.max(0, secondScore));
  const base = (best.score - MATCH_THRESHOLD) / (1 - MATCH_THRESHOLD); // 0..1
  const confidence = Math.max(
    0.3,
    Math.min(0.99, 0.45 + 0.45 * base + 0.25 * Math.min(1, margin * 3) * base),
  );
  return { piece: best.piece, confidence };
}

/**
 * Recognize all 64 squares of a board whose rectangle is already known.
 * `image` is the original RGBA screenshot; squares are returned a8-first
 * (White at the bottom).
 */
export function recognizeSquares(
  image: RgbaImage,
  board: BoardRect,
  sets: PieceRasterMap[],
): SquareResult[] {
  return recognizeSquaresGray(rgbaToGray(image), board, sets);
}

/** Gray-image entry (the retry paths work on transformed gray planes). */
export function recognizeSquaresGray(
  gray: GrayImage,
  board: BoardRect,
  sets: PieceRasterMap[],
): SquareResult[] {
  const cell = board.size / 8;

  // Patches are inset by 2.5% of a cell per side: even a sub-pixel rect
  // error otherwise leaks a full-contrast strip of the neighboring square
  // into the patch and decorrelates every template.
  const inset = cell * 0.025;
  const stats: PatchStats[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const patch = cropResizeGrayF(
        gray,
        board.x + col * cell + inset,
        board.y + row * cell + inset,
        cell - 2 * inset,
        cell - 2 * inset,
        T,
        T,
      );
      stats.push(patchStats(patch));
    }
  }
  return classifyStats(stats, sets);
}

/**
 * Perspective variant: the board is a general quadrilateral (a photo shot
 * at an angle). Each cell's patch is sampled through the quad's
 * homography, so foreshortened cells still map to canonical squares.
 * Everything after patch collection is the shared classifier.
 */
export function recognizeSquaresQuad(
  gray: GrayImage,
  quad: Quad,
  sets: PieceRasterMap[],
): SquareResult[] {
  const H = homographyFromQuad(quad);
  const stats: PatchStats[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const patch = new Float32Array(T * T);
      for (let py = 0; py < T; py++) {
        for (let px = 0; px < T; px++) {
          // Same 2.5% inset as the rect path, in cell-fraction space.
          const u = (col + 0.025 + ((px + 0.5) / T) * 0.95) / 8;
          const v = (row + 0.025 + ((py + 0.5) / T) * 0.95) / 8;
          const p = applyHomography(H, u, v);
          patch[py * T + px] = sampleBilinear(gray, p.x, p.y);
        }
      }
      stats.push(patchStats(patch));
    }
  }
  return classifyStats(stats, sets);
}

function classifyStats(stats: PatchStats[], sets: PieceRasterMap[]): SquareResult[] {
  // Templates per parity, built over that parity's median measured
  // background — this is what adapts matching to the screenshot's theme.
  const parityBackground: [number, number] = [0, 0];
  for (const parity of [0, 1] as const) {
    const values = stats
      .filter((_, i) => (Math.floor(i / 8) + (i % 8)) % 2 === parity)
      .map((s) => s.background);
    parityBackground[parity] = median(values);
  }
  const templatesByParity: [Template[], Template[]] = [
    buildTemplates(sets, parityBackground[0]),
    buildTemplates(sets, parityBackground[1]),
  ];

  return stats.map((s, i) => {
    const parity = (Math.floor(i / 8) + (i % 8)) % 2;
    return classifySquare(s, templatesByParity[parity]);
  });
}
