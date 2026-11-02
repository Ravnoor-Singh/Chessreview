// Win-probability conversion (spec 5.4 / Section 6).
//
// Engine scores arrive from the side-to-move perspective; everything in the
// review pipeline that is stored per-ply is normalised to White's
// perspective, with mates encoded as ±(MATE_CP - |mateInMoves|).

import { MATE_CP, WIN_PROB_K } from '@/lib/constants';
import { clamp } from '@/lib/format';

/**
 * Win probability in percent (0..100) for the side the centipawn score
 * favours: winProb(cp) = 50 + 50 * (2 / (1 + e^(-K*cp)) - 1).
 * winProb(0) = 50 and winProb(-x) = 100 - winProb(x).
 */
export function winProb(cp: number): number {
  if (cp === Infinity) return 100;
  if (cp === -Infinity) return 0;
  const pct = 50 + 50 * (2 / (1 + Math.exp(-WIN_PROB_K * cp)) - 1);
  return clamp(pct, 0, 100);
}

/**
 * Win probability (0..100) from an engine score given in the mover's
 * (side-to-move) perspective. A forced mate decides the game outright:
 * mate > 0 → 100, mate < 0 → 0 (mate 0 means the side to move is mated).
 * When only a cp score exists the plain logistic is used; with neither,
 * the position is treated as level (50).
 */
export function winProbForScore(
  scoreCp: number | undefined,
  scoreMate: number | undefined,
): number {
  if (scoreMate !== undefined) {
    if (scoreMate > 0) return 100;
    if (scoreMate < 0) return 0;
    return 0; // mate in 0: the side to move has been checkmated
  }
  if (scoreCp !== undefined) {
    if (Math.abs(scoreCp) >= MATE_CP - 1000) {
      // Defensive: a cp score that already carries the mate encoding.
      const mateInMoves = MATE_CP - Math.abs(scoreCp);
      return winProbForScore(undefined, scoreCp >= 0 ? mateInMoves : -mateInMoves);
    }
    return winProb(scoreCp);
  }
  return 50;
}

export interface WhiteScore {
  /** Evaluation in centipawns from White's perspective (mates encoded). */
  evalWhiteCp: number;
  /** Signed moves-to-mate from White's perspective, when the score is mate. */
  mate?: number;
}

/**
 * Normalise an engine score (side-to-move perspective) to White's
 * perspective. Mate scores become ±(MATE_CP - |mate|) in `evalWhiteCp` and
 * are also returned signed (from White's perspective) in `mate`.
 */
export function scoreToWhiteCp(
  scoreCp: number | undefined,
  scoreMate: number | undefined,
  sideToMove: 'w' | 'b',
): WhiteScore {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (scoreMate !== undefined) {
    const whiteMate = sign * scoreMate;
    if (whiteMate === 0) {
      // Side to move is checkmated: White is mated when White is to move.
      return { evalWhiteCp: sideToMove === 'w' ? -MATE_CP : MATE_CP, mate: 0 };
    }
    const encoded = MATE_CP - Math.abs(whiteMate);
    return { evalWhiteCp: whiteMate > 0 ? encoded : -encoded, mate: whiteMate };
  }
  if (scoreCp !== undefined) return { evalWhiteCp: sign * scoreCp };
  return { evalWhiteCp: 0 };
}

/**
 * Expected-points loss (0..1) of a played move: how much win probability
 * (in percent, mover's perspective) the mover gave up versus the best move,
 * expressed as a fraction. Never negative — playing better than expected
 * loses nothing.
 */
export function expectedPointsLoss(bestBeforeWinPct: number, afterWinPct: number): number {
  return clamp((bestBeforeWinPct - afterWinPct) / 100, 0, 1);
}
