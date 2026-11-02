// Move classification (spec Section 7). The decision order is fixed:
//   1. forced   — only one legal move
//   2. book     — a known opening move
//   3. brilliant— a sound sacrifice that is (near-)best, with a soft cap
//   4. great    — the engine's best move AND an only-move / turning point /
//                 critical moment, in a position that is not yet decided
//   5. EPL thresholds — best / excellent / good / inaccuracy / mistake / blunder
//   6. miss     — post-pass: failing to punish the opponent's mistake/blunder
//
// Prompt 4 changes:
//  - ALL thresholds come from a ClassificationProfile (constants.ts,
//    CLASSIFICATION_PROFILES; balanced = the historical defaults). The
//    caller may pass `profile` (object or name); default balanced.
//  - EXACT recaptures: when the caller supplies `lastMove` (the move that
//    produced fenBefore — the analyzer always does for main-line plies),
//    a move that captures the piece that just moved, on the very square
//    it landed on, is known to be a recapture EXACTLY. Exact recaptures
//    are never sacrifices and never Great ("pure recapture" rule), and
//    the trivial-recapture test uses the exact identity instead of the
//    FEN-only approximation. When `lastMove` is ABSENT (live / board-
//    editor path, where there is no game history), the previous
//    FEN-only approximation is used as a documented fallback: it treats
//    any capture of material worth at least the moved piece, giving no
//    check and not losing the exchange, as "trivial". The fallback can
//    misfire in both directions (a fresh equal capture looks like a
//    recapture; a recapture that wins the exchange does not) — that is
//    precisely what the exact path fixes. See README.
//  - classifyMoveDetailed() returns { classification, reason } with a
//    machine-readable reason; classifyMove() keeps its original
//    signature and simply delegates, so existing callers/tests are
//    untouched.

import { Chess } from 'chess.js';
import {
  PIECE_VALUES,
  resolveClassificationProfile,
  type ClassificationProfile,
  type ClassificationProfileName,
} from '@/lib/constants';
import type { ClassificationReason, EngineLine, MoveClass } from '@/lib/types';
import { parseUci } from '@/lib/san';
import { analyzeSacrifice, seeForMove, type SacrificeResult } from './sacrifice';
import { expectedPointsLoss, winProbForScore } from './winProbability';

/** The move that produced the position under analysis (opponent's last move). */
export interface LastMoveInfo {
  from: string;
  to: string;
  captured?: string;
  san?: string;
}

export interface ClassifyInput {
  fenBefore: string;
  moveUci: string;
  legalMoveCount: number;
  isBookMove: boolean;
  linesBefore: EngineLine[];
  /** Mover's win% in the position before the move (best-play expectation). */
  winProbBefore: number;
  /** Mover's win% in the position after the played move. */
  winProbAfter: number;
  /** Expected-points loss of the played move, 0..1. */
  epl: number;
  prevPly?: { classification?: MoveClass; winProbMoverBefore?: number };
  /** Brilliant moves already awarded in the trailing 10-move window. */
  brilliantUsedInWindow: number;
  movesSinceStart: number;
  /**
   * Optional (Prompt 4): the move that produced `fenBefore`. Enables the
   * EXACT recapture rules. Absent on the live/board-editor path, where
   * the documented FEN-only approximation is used instead.
   */
  lastMove?: LastMoveInfo;
  /** Optional classification profile (object or name); default balanced. */
  profile?: ClassificationProfile | ClassificationProfileName;
}

export interface ClassifyResult {
  classification: MoveClass;
  reason: ClassificationReason;
  /** Sacrifice verdict behind a brilliant verdict (when computed). */
  sacrifice?: SacrificeResult;
}

function sortedLines(lines: EngineLine[]): EngineLine[] {
  return [...lines].sort((a, b) => a.multipv - b.multipv);
}

function lineWinProb(line: EngineLine): number {
  return winProbForScore(line.scoreCp, line.scoreMate);
}

function playedLineIndex(lines: EngineLine[], moveUci: string): number {
  return sortedLines(lines).findIndex((line) => line.pv[0] === moveUci);
}

function isPlayedBest(lines: EngineLine[], moveUci: string): boolean {
  const sorted = sortedLines(lines);
  return sorted.length > 0 && sorted[0].pv[0] === moveUci;
}

/** Piece type letter on `square` in `fen`, or undefined when empty/invalid. */
function pieceAt(fen: string, square: string): string | undefined {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rankFromTop = 8 - (square.charCodeAt(1) - '0'.charCodeAt(0));
  const rows = (fen.trim().split(/\s+/)[0] ?? '').split('/');
  const row = rows[rankFromTop];
  if (!row) return undefined;
  let f = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      f += Number(ch);
    } else {
      if (f === file) return ch.toLowerCase();
      f += 1;
    }
  }
  return undefined;
}

/** Does moveUci capture anything in fenBefore (incl. en passant)? */
function moveCaptures(fenBefore: string, moveUci: string): boolean {
  const { from, to } = parseUci(moveUci);
  if (pieceAt(fenBefore, to)) return true;
  const moved = pieceAt(fenBefore, from);
  return moved === 'p' && from[0] !== to[0]; // en passant lands empty
}

/**
 * EXACT recapture test (Prompt 4): the played move captures the piece
 * that just moved — i.e. the played move lands on `lastMove.to` and
 * captures the piece standing there. (En passant captures the pawn that
 * just double-pushed but lands on a different square, so by the task's
 * definition — "on the same square the last move landed" — it is not an
 * exact recapture.) Returns false whenever lastMove is absent.
 */
export function isExactRecapture(
  input: Pick<ClassifyInput, 'fenBefore' | 'moveUci' | 'lastMove'>,
): boolean {
  if (!input.lastMove) return false;
  const { to } = parseUci(input.moveUci);
  if (to !== input.lastMove.to) return false;
  return moveCaptures(input.fenBefore, input.moveUci);
}

function givesCheck(fenBefore: string, moveUci: string): boolean {
  try {
    const chess = new Chess(fenBefore);
    const { from, to, promotion } = parseUci(moveUci);
    chess.move({ from, to, promotion });
    return chess.isCheck();
  } catch {
    return false;
  }
}

/**
 * A trivial recapture: the move simply takes back material and gives no
 * check, so labelling it "great" would be noise.
 *
 * EXACT path (lastMove present): the move is an exact recapture (above),
 * the captured piece is worth at least the moved piece, and the exchange
 * on the destination is not losing for the mover — a "pure" recapture.
 * This path is exact: it cannot fire on a fresh capture, however equal.
 *
 * FALLBACK path (lastMove absent — live/board-editor analysis): the
 * historical FEN-only approximation. A FEN carries no last-move info, so
 * ANY capture of material worth at least the moved piece that gives no
 * check and does not lose the exchange is treated as trivial. This can
 * misfire (fresh equal captures are blocked from Great; recaptures that
 * win material are not recognised) — documented in the README.
 */
function isTrivialRecapture(input: ClassifyInput): boolean {
  const { from, to } = parseUci(input.moveUci);
  const moved = pieceAt(input.fenBefore, from);
  if (!moved) return false;
  let captured = pieceAt(input.fenBefore, to);
  if (!captured && moved === 'p' && from[0] !== to[0]) captured = 'p'; // en passant
  if (!captured) return false;
  const capturedValue = PIECE_VALUES[captured] ?? 0;
  const movedValue = PIECE_VALUES[moved] ?? 0;
  if (capturedValue < movedValue) return false;
  if (isExactRecapture(input)) {
    // Exact path: identity is proven; require a non-losing exchange and
    // no check for the recapture to count as "pure"/trivial.
    if (seeForMove(input.fenBefore, input.moveUci) < 0) return false;
    return !givesCheck(input.fenBefore, input.moveUci);
  }
  if (input.lastMove) {
    // lastMove is known and this is NOT the recapture of it: the move is
    // a fresh capture, never "trivial" on the exact path. (The forced
    // rule — a recapture that is the only move avoiding material loss —
    // is handled by legalMoveCount/only-move logic elsewhere; a fresh
    // capture is eligible for Great on its merits.)
    return false;
  }
  // Fallback (FEN-only approximation).
  if (seeForMove(input.fenBefore, input.moveUci) !== 0 && capturedValue === movedValue)
    return false;
  return !givesCheck(input.fenBefore, input.moveUci);
}

/**
 * Expected-points loss of the played move computed from the pre-move engine
 * lines. When the played move is one of the MultiPV lines, that line's own
 * score is used; otherwise `nextPositionTopWinProbMover` — the mover's win%
 * in the resulting position, derived from the next ply's analysis — is the
 * fallback. bestBefore is always the MultiPV-1 line's win probability.
 */
export function computeEpl(
  linesBefore: EngineLine[],
  moveUci: string,
  nextPositionTopWinProbMover: number,
): number {
  const sorted = sortedLines(linesBefore);
  if (sorted.length === 0) return 0;
  const bestBefore = lineWinProb(sorted[0]);
  const playedLine = sorted.find((line) => line.pv[0] === moveUci);
  const playedWin = playedLine ? lineWinProb(playedLine) : nextPositionTopWinProbMover;
  return expectedPointsLoss(bestBefore, playedWin);
}

function brilliantVerdict(
  input: ClassifyInput,
  profile: ClassificationProfile,
): { ok: boolean; sacrifice?: SacrificeResult } {
  const b = profile.brilliant;
  if (input.brilliantUsedInWindow >= b.softCapPerTenMoves) return { ok: false };
  if (input.epl > b.maxEpl) return { ok: false };
  if (input.winProbBefore >= b.maxWinProbBefore) return { ok: false };
  if (input.winProbAfter < b.minWinProbAfter) return { ok: false };
  // Promotions are never brilliant sacrifices (and never sacrifices).
  if (parseUci(input.moveUci).promotion) return { ok: false };
  // Recaptures are never brilliant: exact path when lastMove is known.
  if (isExactRecapture(input)) return { ok: false };
  const index = playedLineIndex(input.linesBefore, input.moveUci);
  if (index < 0 || index >= b.maxTopN) return { ok: false };
  const pv = sortedLines(input.linesBefore)[index]?.pv ?? [input.moveUci];
  const sacrifice = analyzeSacrifice(input.fenBefore, input.moveUci, pv, {
    lastMove: input.lastMove,
    isExactRecapture: isExactRecapture(input),
  });
  return { ok: sacrifice.isSacrifice, sacrifice };
}

type GreatSignal = 'only_move' | 'turning_point' | 'mate_threat' | 'critical_moment';

function greatSignal(input: ClassifyInput, profile: ClassificationProfile): GreatSignal | null {
  if (!isPlayedBest(input.linesBefore, input.moveUci)) return null;
  const g = profile.great;
  if (input.winProbBefore >= g.decidedHigh || input.winProbBefore <= g.decidedLow) {
    return null; // position already decided either way
  }
  if (isTrivialRecapture(input)) return null;

  const sorted = sortedLines(input.linesBefore);
  const bestWin = lineWinProb(sorted[0]);

  // Only-move: the second-best line is far worse than the best line.
  let onlyMove = false;
  if (sorted.length >= 2) {
    const secondEpl = expectedPointsLoss(bestWin, lineWinProb(sorted[1]));
    onlyMove = secondEpl >= g.onlyMoveGapEpl;
  }

  // Turning point: the move crosses a win-probability band upward
  // (worse/equal → winning). prevPly.winProbMoverBefore, when present, is
  // this mover's win% two plies ago and gives the same signal historically.
  const turningPoint =
    (input.winProbBefore < 50 && input.winProbAfter >= 55) ||
    (input.winProbBefore <= 45 && input.winProbAfter > 50);

  // Critical: the best line mates, or the second line is losing while the
  // best line keeps at least an even game.
  const hasMateLine = sorted.some((line) => line.scoreMate !== undefined && line.scoreMate > 0);
  const secondLosing = sorted.length >= 2 && lineWinProb(sorted[1]) < 35 && bestWin >= 50;
  const critical = hasMateLine || secondLosing;

  if (onlyMove) return 'only_move';
  if (hasMateLine) return 'mate_threat';
  if (turningPoint) return 'turning_point';
  if (critical) return 'critical_moment';
  return null;
}

function sacrificeReason(sacrifice: SacrificeResult | undefined): ClassificationReason {
  switch (sacrifice?.kind) {
    case 'queen':
      return 'sacrifice_queen';
    case 'exchange':
      return 'sacrifice_exchange';
    case 'mate':
      return 'sacrifice_mate';
    default:
      return 'sacrifice_piece';
  }
}

/** Full classification with its machine-readable reason (Prompt 4). */
export function classifyMoveDetailed(input: ClassifyInput): ClassifyResult {
  const profile = resolveClassificationProfile(input.profile);

  // 1. Forced — nothing else was legal.
  if (input.legalMoveCount <= 1) return { classification: 'forced', reason: 'forced' };

  // 2. Book.
  if (input.isBookMove) return { classification: 'book', reason: 'book' };

  // 3. Brilliant.
  const brilliant = brilliantVerdict(input, profile);
  if (brilliant.ok) {
    return {
      classification: 'brilliant',
      reason: sacrificeReason(brilliant.sacrifice),
      sacrifice: brilliant.sacrifice,
    };
  }

  // 4. Great.
  const signal = greatSignal(input, profile);
  if (signal) return { classification: 'great', reason: signal };

  // 5. EPL thresholds.
  const t = profile.epl;
  let result: MoveClass;
  let reason: ClassificationReason = 'epl_threshold';
  if (isPlayedBest(input.linesBefore, input.moveUci) || input.epl <= t.best) {
    result = 'best';
    reason = 'best_move';
  } else if (input.epl <= t.excellent) {
    result = 'excellent';
  } else if (input.epl <= t.good) {
    result = 'good';
  } else if (input.epl <= t.inaccuracy) {
    result = 'inaccuracy';
  } else if (input.epl <= t.mistake) {
    result = 'mistake';
  } else {
    result = 'blunder';
  }

  // 6. Miss — the opponent just erred, the position was winning, and the
  // reply threw the win away. Only demotes an inaccuracy/mistake/blunder.
  const m = profile.miss;
  if (
    (result === 'inaccuracy' || result === 'mistake' || result === 'blunder') &&
    input.prevPly?.classification !== undefined &&
    (input.prevPly.classification === 'mistake' || input.prevPly.classification === 'blunder') &&
    input.winProbBefore >= m.minWinProbBefore &&
    input.epl > m.minEpl &&
    input.winProbAfter <= m.maxWinProbAfter
  ) {
    return { classification: 'miss', reason: 'missed_tactic' };
  }

  // A best/engine move that is an exact recapture still reports why it
  // was kept out of the Great/Brilliant bands when that was decisive:
  // handled by callers via isExactRecapture; the band reason stays
  // 'best_move'/'epl_threshold' here because the recapture rule did not
  // change THIS label (it only removed higher ones it never reached).
  void reason;
  return { classification: result, reason };
}

export function classifyMove(input: ClassifyInput): MoveClass {
  return classifyMoveDetailed(input).classification;
}

/**
 * Why a move was NOT labelled Great/Brilliant when it otherwise might
 * have been — used for the "Why this label?" surface on recaptures.
 * Returns 'trivial_recapture_blocked' for an exact pure recapture that
 * was the engine's best move, else undefined.
 */
export function blockedLabelReason(input: ClassifyInput): ClassificationReason | undefined {
  if (
    isExactRecapture(input) &&
    isTrivialRecapture(input) &&
    isPlayedBest(input.linesBefore, input.moveUci)
  ) {
    return 'trivial_recapture_blocked';
  }
  if (isExactRecapture(input)) return 'recapture_not_sacrifice';
  return undefined;
}
