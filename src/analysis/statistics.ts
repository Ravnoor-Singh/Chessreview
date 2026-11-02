// Per-player game statistics for the review summary (Prompt 6).
//
// Pure functions over a finished GameReview — no engine, no DOM.
// Definitions (also documented in README):
//
// * Longest "best-or-better" streak: the longest run of CONSECUTIVE OWN
//   moves whose classification is in BEST_OR_BETTER — brilliant, great,
//   best or excellent (the classes at or above "best" quality, plus
//   excellent). Any other class (including book and forced) breaks a run.
// * Biggest eval swing: the own move with the maximum EPL
//   (expected-points loss, 0..1). Ties keep the earliest move.
// * Phases: OPENING is every move up to and including the last book ply
//   (GameReview.opening.leftBookAtPly - 1); when the review has no book
//   information, the opening is the first 10 full moves (20 plies).
//   ENDGAME starts with the first move after which the position is an
//   endgame by this rule: BOTH sides have ≤ 13 points of non-pawn
//   material (Q=9, R=5, B=3, N=3), OR the queens are off and both sides
//   have ≤ 10 points. The onset is fixed once reached (a later promotion
//   does not move the game back to the middlegame). Everything between
//   the opening and the endgame onset is the MIDDLEGAME.
// * Time by phase sums timeSpentMs per phase; it is only reported when
//   the game actually carries clock data.
// * Time-trouble moves: moves after which the mover's remaining clock
//   satisfies isTimeTrouble (< 30 s, or < 10% of the base time).

import { isTimeTrouble } from '@/lib/clocks';
import { PIECE_VALUES } from '@/lib/constants';
import { countPieces } from '@/lib/material';
import type { GameReview, MoveClass, PlyAnalysis } from '@/lib/types';

export const BEST_OR_BETTER: ReadonlySet<MoveClass> = new Set([
  'brilliant',
  'great',
  'best',
  'excellent',
]);

export interface BiggestSwing {
  ply: number;
  san: string;
  /** Full-move number of the move (from the resulting FEN, start-position safe). */
  moveNumber: number;
  color: 'w' | 'b';
  /** Expected-points loss of the move, 0..1. */
  epl: number;
}

export interface PhaseTimes {
  openingMs: number;
  middlegameMs: number;
  endgameMs: number;
}

export interface PlayerStatistics {
  color: 'w' | 'b';
  /** Average centipawn loss (from GameReview.acpl). */
  acpl: number;
  longestBestStreak: number;
  biggestSwing: BiggestSwing | null;
  /** Null when the game has no usable clock data for this player. */
  phaseTimes: PhaseTimes | null;
  timeTroubleCount: number;
  /** Moves analysed for this player. */
  moveCount: number;
}

export interface GameStatistics {
  white: PlayerStatistics;
  black: PlayerStatistics;
  /** Last ply that still counts as opening. */
  openingEndPly: number;
  /** First ply counted as endgame, or null when the game never reaches one. */
  endgameStartPly: number | null;
  /** True when at least one ply carries a derived timeSpentMs. */
  hasClocks: boolean;
}

/** Non-pawn material points for one colour in a FEN (Q=9, R=5, B=3, N=3). */
export function nonPawnMaterial(fen: string, color: 'w' | 'b'): number {
  const counts = countPieces(fen);
  const side = color === 'w' ? counts.white : counts.black;
  let total = 0;
  for (const piece of ['q', 'r', 'b', 'n']) {
    total += (side[piece] ?? 0) * (PIECE_VALUES[piece] ?? 0);
  }
  return total;
}

/** Whether a FEN position is an endgame by the documented material rule. */
export function isEndgameFen(fen: string): boolean {
  const white = nonPawnMaterial(fen, 'w');
  const black = nonPawnMaterial(fen, 'b');
  if (white <= 13 && black <= 13) return true;
  const counts = countPieces(fen);
  const queensOff = (counts.white.q ?? 0) === 0 && (counts.black.q ?? 0) === 0;
  return queensOff && white <= 10 && black <= 10;
}

/** Move number for a ply, read from the resulting FEN's fullmove counter. */
export function moveNumberOf(ply: PlyAnalysis): number {
  const fullmove = Number(ply.fen.trim().split(/\s+/)[5]);
  if (Number.isFinite(fullmove) && fullmove >= 1) {
    return ply.color === 'b' ? Math.max(1, fullmove - 1) : fullmove;
  }
  return Math.ceil(ply.ply / 2);
}

function playerStats(
  review: GameReview,
  color: 'w' | 'b',
  openingEndPly: number,
  endgameStartPly: number | null,
  baseTimeMs: number | null,
): PlayerStatistics {
  const own = review.plies.filter((p) => p.ply >= 1 && p.color === color);

  let longest = 0;
  let run = 0;
  for (const p of own) {
    if (p.classification && BEST_OR_BETTER.has(p.classification)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let biggest: BiggestSwing | null = null;
  for (const p of own) {
    if (p.epl === undefined || !p.san) continue;
    if (!biggest || p.epl > biggest.epl) {
      biggest = { ply: p.ply, san: p.san, moveNumber: moveNumberOf(p), color, epl: p.epl };
    }
  }

  const hasSpent = own.some((p) => p.timeSpentMs !== undefined);
  let phaseTimes: PhaseTimes | null = null;
  if (hasSpent) {
    phaseTimes = { openingMs: 0, middlegameMs: 0, endgameMs: 0 };
    for (const p of own) {
      if (p.timeSpentMs === undefined) continue;
      if (p.ply <= openingEndPly) phaseTimes.openingMs += p.timeSpentMs;
      else if (endgameStartPly !== null && p.ply >= endgameStartPly)
        phaseTimes.endgameMs += p.timeSpentMs;
      else phaseTimes.middlegameMs += p.timeSpentMs;
    }
  }

  const timeTroubleCount = own.filter((p) => isTimeTrouble(p.clockMs, baseTimeMs)).length;

  return {
    color,
    acpl: color === 'w' ? review.acpl.white : review.acpl.black,
    longestBestStreak: longest,
    biggestSwing: biggest,
    phaseTimes,
    timeTroubleCount,
    moveCount: own.length,
  };
}

/** Compute the full statistics block for a finished review. */
export function computeGameStatistics(
  review: GameReview,
  opts: { baseTimeMs?: number | null } = {},
): GameStatistics {
  const lastPly = review.plies.length - 1;
  const openingEndPly =
    review.opening?.leftBookAtPly !== undefined
      ? Math.max(0, review.opening.leftBookAtPly - 1)
      : Math.min(20, Math.max(0, lastPly));

  let endgameStartPly: number | null = null;
  for (const p of review.plies) {
    if (p.ply < 1) continue;
    if (isEndgameFen(p.fen)) {
      endgameStartPly = p.ply;
      break;
    }
  }

  const baseTimeMs = opts.baseTimeMs ?? null;
  return {
    white: playerStats(review, 'w', openingEndPly, endgameStartPly, baseTimeMs),
    black: playerStats(review, 'b', openingEndPly, endgameStartPly, baseTimeMs),
    openingEndPly,
    endgameStartPly,
    hasClocks: review.plies.some((p) => p.timeSpentMs !== undefined),
  };
}
