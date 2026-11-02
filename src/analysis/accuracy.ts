// Per-move and per-game accuracy (spec Section 8).
//
// The aggregation replicates Lichess's published method
// (lichess.org/page/accuracy; lila `AccuracyPercent.gameAccuracy` +
// scalalib `Maths`), validated against Lichess's own stored accuracies
// in Prompt 5 — see tests/fixtures/lichess-reference/ and
// scripts/validate-accuracy.mjs (mean |diff| 0.26, max 1.14 over the
// 263-game development pool; the previous aggregation — a
// volatility-WEIGHTED harmonic mean with centred windows and unclamped
// win% — was biased ≈7 points low, mean |diff| 6.63, max 23.04).

import { ACCURACY_EVAL_CEILING_CP, ACCURACY_FORMULA, VOLATILITY } from '@/lib/constants';
import { clamp } from '@/lib/format';
import { winProb } from './winProbability';

/**
 * Accuracy (0..100) of a single move from the win-probability drop it
 * caused (both percents are from the mover's perspective):
 *   acc = 103.1668 * exp(-0.04354 * diff) - 3.1669 + 1,
 *   diff = max(0, winPctBefore - winPctAfter), clamped to 0..100.
 */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  const diff = Math.max(0, winPctBefore - winPctAfter);
  const raw =
    ACCURACY_FORMULA.a * Math.exp(-ACCURACY_FORMULA.b * diff) -
    ACCURACY_FORMULA.c +
    ACCURACY_FORMULA.uncertaintyBonus;
  return clamp(raw, 0, 100);
}

/**
 * Win% (White's perspective, 0..100) of a White-perspective centipawn
 * eval AS USED FOR ACCURACY: the eval is first clamped to
 * ±ACCURACY_EVAL_CEILING_CP (1000), exactly like Lichess's
 * `WinPercent.fromCentiPawns` (`Cp.ceiled`). Mate scores — encoded
 * internally as ±(100000 − |mate|) — therefore map to ≈97.54 / ≈2.46,
 * never to 100 / 0: a move that misses a forced mate loses at most
 * ≈47 win% points of accuracy, and a played mate scores the same as
 * any other move that keeps a ≥ +10.00 position. The classification
 * and eval-bar paths keep using the unclamped `winProb`.
 */
export function accuracyWinPercent(evalWhiteCp: number): number {
  return winProb(clamp(evalWhiteCp, -ACCURACY_EVAL_CEILING_CP, ACCURACY_EVAL_CEILING_CP));
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Volatility weight per position (spec 8.2, Lichess-aligned in
 * Prompt 5): `winPctSeries` is the win% of EVERY position in the game
 * (White's perspective), and the returned weight at index `i` applies
 * to the move that LED INTO position `i` (index 0 is unused — no move
 * leads into the start position).
 *
 * The weight is the standard deviation of the win% series inside a
 * sliding window that ENDS at position `i`, of size
 * `clamp(floor(totalPlies / 10), 2, 8)` (integer division, as in
 * Lichess). Positions before the first full window share that first
 * window (Lichess prefix-fills the first `windowSize − 2` move weights
 * with it), and weights are clamped to [0.5, 12]. Sharp, swinging
 * stretches of the game weigh more than quiet ones.
 */
export function volatilityWeights(winPctSeries: number[], totalPlies: number): number[] {
  const n = winPctSeries.length;
  if (n === 0) return [];
  const windowSize = Math.round(clamp(Math.floor(totalPlies / 10), 2, 8));
  return winPctSeries.map((_, i) => {
    let start: number;
    let end: number;
    if (n <= windowSize) {
      start = 0;
      end = n;
    } else if (i < windowSize) {
      // Prefix fill + the first full window itself: positions
      // 0..windowSize-1 all use the window over positions [0, windowSize).
      start = 0;
      end = windowSize;
    } else {
      start = i - windowSize + 1;
      end = i + 1;
    }
    const sd = stdDev(winPctSeries.slice(start, end));
    return clamp(sd, VOLATILITY.min, VOLATILITY.max);
  });
}

/**
 * Game accuracy for one colour (spec 8.2, Lichess-aligned in
 * Prompt 5): the average of (a) the volatility-weighted ARITHMETIC
 * mean of the per-move accuracies and (b) the UNWEIGHTED harmonic
 * mean of the same accuracies. Lichess's harmonic mean is deliberately
 * not volatility-weighted (scalalib `Maths.harmonicMean`); accuracies
 * are floored at 1 inside it so a single 0 does not zero the whole
 * game. (The pre-Prompt-5 implementation used a weighted harmonic
 * mean, which double-punished blunders — they cluster in volatile
 * windows — and scored ≈7 points below Lichess on real games.)
 * Returns null for fewer than 6 moves — the caller shows
 * "Not enough moves".
 */
export function gameAccuracy(accuracies: number[], weights: number[]): number | null {
  if (accuracies.length < 6) return null;
  const ws = accuracies.map((_, i) => {
    const w = weights[i];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1;
  });
  const weightSum = ws.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) return null;
  const arithmetic = accuracies.reduce((sum, acc, i) => sum + acc * ws[i], 0) / weightSum;
  const harmonic =
    accuracies.length / accuracies.reduce((sum, acc) => sum + 1 / Math.max(acc, 1), 0);
  return clamp((arithmetic + harmonic) / 2, 0, 100);
}

/**
 * Both sides' game accuracies from a game's per-position win% series
 * (White's perspective, one entry per position including the start).
 * `firstMover` is the colour to move in the start position ('w' for
 * standard games). Each move's accuracy is computed from the mover's
 * perspective; the series is used exactly as given — a series that
 * simply stops (resignation, timeout) contributes only the moves that
 * were actually played, and no terminal eval is invented. This is the
 * single wiring shared by the analyzer, the Lichess validation script
 * and the edge-case tests.
 */
export function computeGameAccuracies(
  winPercentsWhite: number[],
  firstMover: 'w' | 'b' = 'w',
): { white: number | null; black: number | null } {
  const totalPlies = winPercentsWhite.length - 1;
  if (totalPlies <= 0) return { white: null, black: null };
  const weights = volatilityWeights(winPercentsWhite, totalPlies);
  const perColor: Record<'w' | 'b', { accs: number[]; ws: number[] }> = {
    w: { accs: [], ws: [] },
    b: { accs: [], ws: [] },
  };
  for (let i = 0; i < totalPlies; i += 1) {
    const mover: 'w' | 'b' = i % 2 === 0 ? firstMover : firstMover === 'w' ? 'b' : 'w';
    const beforeWhite = winPercentsWhite[i];
    const afterWhite = winPercentsWhite[i + 1];
    const before = mover === 'w' ? beforeWhite : 100 - beforeWhite;
    const after = mover === 'w' ? afterWhite : 100 - afterWhite;
    perColor[mover].accs.push(moveAccuracy(before, after));
    perColor[mover].ws.push(weights[i + 1] ?? 1);
  }
  return {
    white: gameAccuracy(perColor.w.accs, perColor.w.ws),
    black: gameAccuracy(perColor.b.accs, perColor.b.ws),
  };
}
