// Static Exchange Evaluation (SEE) and sacrifice detection (spec 7.2.2).
//
// SEE is implemented on a lightweight board array parsed from the FEN (not
// on chess.js copies): attacker lists are recomputed from scratch after
// every capture in the swap sequence, so x-ray attackers behind a removed
// piece — and discovered attacks generally — are picked up naturally.
//
// Robustness (Prompt 4) — what this SEE handles, precisely:
//  - x-ray attackers: yes (attackers are recomputed after every capture).
//  - discovered attacks: yes (same mechanism — a slider uncovered by a
//    capture joins the attacker list for the next swap round).
//  - pins to the king: yes, for recaptures inside the swap sequence — a
//    piece pinned to its king by an enemy slider may only "recapture"
//    along the pin ray (including capturing the pinning piece); pinned
//    pieces off the ray are excluded from the attacker list. The FIRST
//    capture of `seeForMove` is validated with chess.js legal move
//    generation, so a pinned piece cannot start a sequence illegally.
//  - king captures: a king may only capture when the destination is not
//    defended after its capture (the standard SEE king rule), verified by
//    re-scanning attackers on the post-capture board (x-rays included).
//  - promotions: a pawn capturing onto the last rank promotes — the gain
//    list credits the promotion bonus (queen − pawn) and the promoted
//    queen is the piece the next recapture wins.
//  - en passant: `seeForMove` recognises a pawn's diagonal move onto the
//    FEN en-passant square (or any empty diagonal target) and removes the
//    captured pawn from its own square before the swap continues.
// What is NOT modelled: pins relative to anything other than the king
// (absolute pins only — relative pins / interpositions are positional,
// not material), and legality beyond the rules above (e.g. a recapture
// that would leave the king in check from a knight — impossible, since
// only slider pins constrain captures onto one square; discovered check
// by the moving piece itself is exactly the pin case handled).
// chess.js is used to validate the candidate move, detect mate-in-1 and
// walk the engine PV in analyzeSacrifice.

import { Chess, type Square } from 'chess.js';
import { PIECE_VALUES } from '@/lib/constants';
import { materialBalance } from '@/lib/material';
import { parseUci } from '@/lib/san';

type Color = 'w' | 'b';

interface BoardPiece {
  type: string;
  color: Color;
}

/** Board as 64 cells: index = rank * 8 + file, rank 0 = rank 1, file 0 = a. */
type Board = (BoardPiece | null)[];

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = square.charCodeAt(1) - '1'.charCodeAt(0);
  return rank * 8 + file;
}

function indexToSquare(index: number): string {
  const file = index % 8;
  const rank = Math.floor(index / 8);
  return `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank + 1}`;
}

function parseBoard(fen: string): { board: Board; turn: Color } {
  const parts = fen.trim().split(/\s+/);
  const rows = (parts[0] ?? '').split('/');
  const board: Board = new Array<BoardPiece | null>(64).fill(null);
  for (let row = 0; row < rows.length && row < 8; row += 1) {
    const rank = 7 - row; // FEN lists rank 8 first
    let file = 0;
    for (const ch of rows[row]) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        if (file < 8) {
          board[rank * 8 + file] = {
            type: ch.toLowerCase(),
            color: ch === ch.toLowerCase() ? 'b' : 'w',
          };
        }
        file += 1;
      }
    }
  }
  return { board, turn: parts[1] === 'b' ? 'b' : 'w' };
}

/** Value used inside SEE: the king is priceless, so it captures last and is never itself captured. */
function seeValue(type: string): number {
  if (type === 'k') return 10000;
  return PIECE_VALUES[type] ?? 0;
}

function pathClear(board: Board, from: number, to: number): boolean {
  const fromFile = from % 8;
  const fromRank = Math.floor(from / 8);
  const toFile = to % 8;
  const toRank = Math.floor(to / 8);
  const stepFile = Math.sign(toFile - fromFile);
  const stepRank = Math.sign(toRank - fromRank);
  let file = fromFile + stepFile;
  let rank = fromRank + stepRank;
  while (file !== toFile || rank !== toRank) {
    if (board[rank * 8 + file] !== null) return false;
    file += stepFile;
    rank += stepRank;
  }
  return true;
}

/** Does the piece on `from` attack `target` on this board (pseudo-legal)? */
function pieceAttacks(board: Board, from: number, target: number): boolean {
  const piece = board[from];
  if (!piece || from === target) return false;
  const dx = (target % 8) - (from % 8);
  const dy = Math.floor(target / 8) - Math.floor(from / 8);
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      return dy === dir && adx === 1;
    }
    case 'n':
      return (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
    case 'k':
      return Math.max(adx, ady) === 1;
    case 'b':
      return adx === ady && adx > 0 && pathClear(board, from, target);
    case 'r':
      return (dx === 0 || dy === 0) && adx + ady > 0 && pathClear(board, from, target);
    case 'q': {
      const diagonal = adx === ady && adx > 0;
      const straight = (dx === 0 || dy === 0) && adx + ady > 0;
      return (diagonal || straight) && pathClear(board, from, target);
    }
    default:
      return false;
  }
}

/** All squares holding a `byColor` piece that attacks `target`. */
export function attackersOf(board: Board, target: number, byColor: Color): number[] {
  const result: number[] = [];
  for (let i = 0; i < 64; i += 1) {
    const piece = board[i];
    if (piece && piece.color === byColor && pieceAttacks(board, i, target)) {
      result.push(i);
    }
  }
  return result;
}

/**
 * Absolute-pin test: is the piece on `idx` pinned to its king by an enemy
 * slider? Returns the pin ray direction (from the king, as [dFile, dRank])
 * when pinned, else null. A pinned piece may only move along that ray.
 */
function pinDirection(board: Board, idx: number): [number, number] | null {
  const piece = board[idx];
  if (!piece || piece.type === 'k') return null;
  let kingIdx = -1;
  for (let i = 0; i < 64; i += 1) {
    if (board[i]?.type === 'k' && board[i]?.color === piece.color) kingIdx = i;
  }
  if (kingIdx < 0) return null;
  const kf = kingIdx % 8;
  const kr = Math.floor(kingIdx / 8);
  const pf = idx % 8;
  const pr = Math.floor(idx / 8);
  const df = Math.sign(pf - kf);
  const dr = Math.sign(pr - kr);
  const straight = df === 0 || dr === 0;
  const diagonal = Math.abs(pf - kf) === Math.abs(pr - kr);
  if (!straight && !diagonal) return null;
  if (df === 0 && dr === 0) return null;
  // Nothing between king and piece?
  let f = kf + df;
  let r = kr + dr;
  while (f !== pf || r !== pr) {
    if (board[r * 8 + f]) return null;
    f += df;
    r += dr;
  }
  // First piece beyond the pinned piece must be a matching enemy slider.
  f = pf + df;
  r = pr + dr;
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    const beyond = board[r * 8 + f];
    if (beyond) {
      if (beyond.color === piece.color) return null;
      const matches = straight
        ? beyond.type === 'r' || beyond.type === 'q'
        : beyond.type === 'b' || beyond.type === 'q';
      return matches ? [df, dr] : null;
    }
    f += df;
    r += dr;
  }
  return null;
}

/** May the piece on `idx` capture onto `target` given absolute pins? */
function captureRespectsPin(board: Board, idx: number, target: number): boolean {
  const pin = pinDirection(board, idx);
  if (!pin) return true;
  const piece = board[idx];
  if (!piece) return false;
  // Find the king again and check the target lies on the king→piece ray
  // (either direction along the same line, which includes capturing the
  // pinning slider and interposing further along the ray).
  let kingIdx = -1;
  for (let i = 0; i < 64; i += 1) {
    if (board[i]?.type === 'k' && board[i]?.color === piece.color) kingIdx = i;
  }
  if (kingIdx < 0) return true;
  const kf = kingIdx % 8;
  const kr = Math.floor(kingIdx / 8);
  const tf = target % 8;
  const tr = Math.floor(target / 8);
  const df = tf - kf;
  const dr = tr - kr;
  // Collinear with the pin ray and on the king→pinner side of the king
  // (dot product with the pin direction positive): the pinned piece may
  // slide along the ray, block on it, or capture the pinning slider —
  // every allowed landing square satisfies exactly this.
  return df * pin[1] === dr * pin[0] && df * pin[0] + dr * pin[1] > 0;
}

function leastValuableAttacker(board: Board, target: number, byColor: Color): number | null {
  let best: number | null = null;
  let bestValue = Infinity;
  for (const idx of attackersOf(board, target, byColor)) {
    const piece = board[idx];
    if (!piece) continue;
    // Pin-aware: a pinned attacker that cannot legally capture onto the
    // target (it would expose its king) does not count.
    if (!captureRespectsPin(board, idx, target)) continue;
    const value = seeValue(piece.type);
    if (value < bestValue) {
      bestValue = value;
      best = idx;
    }
  }
  return best;
}

function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/**
 * Swap-algorithm SEE on a board copy. `firstAttacker` is the square of the
 * piece that makes the first capture onto `target` for `side`; the rest of
 * the sequence always recaptures with the least valuable attacker, and the
 * gains are folded back with optimal stopping (negamax over the gain list).
 * Returns the net material outcome in points for `side`.
 */
/** Does a pawn of `color` landing on `target` promote? */
function promotesOn(color: Color, target: number): boolean {
  const rank = Math.floor(target / 8);
  return color === 'w' ? rank === 7 : rank === 0;
}

/** Material credited for a capture: victim value + promotion bonus when a pawn promotes. */
function captureGain(
  victimType: string | undefined,
  moverType: string,
  moverColor: Color,
  target: number,
): number {
  const base = victimType ? (PIECE_VALUES[victimType] ?? 0) : 0;
  if (moverType === 'p' && promotesOn(moverColor, target)) {
    return base + ((PIECE_VALUES.q ?? 9) - (PIECE_VALUES.p ?? 1));
  }
  return base;
}

/** The piece as it stands on the target after a capture (pawns promote to queens). */
function landedPiece(piece: BoardPiece, target: number): BoardPiece {
  if (piece.type === 'p' && promotesOn(piece.color, target))
    return { type: 'q', color: piece.color };
  return piece;
}

function seeOnBoard(
  boardIn: Board,
  target: number,
  side: Color,
  firstAttacker: number,
  epVictimIdx?: number,
): number {
  const board = boardIn.slice();
  const first = board[firstAttacker];
  if (!first || first.color !== side) return 0;
  const victim = board[target];
  if (victim && victim.color === side) return 0; // cannot capture own piece
  if (victim && victim.type === 'k') return 0; // kings are never captured
  // En passant: the victim pawn stands beside the attacker, not on target.
  const epVictim = epVictimIdx !== undefined ? board[epVictimIdx] : null;

  const gains: number[] = [
    captureGain(epVictim ? epVictim.type : victim?.type, first.type, side, target),
  ];
  board[firstAttacker] = null;
  if (epVictimIdx !== undefined) board[epVictimIdx] = null;
  board[target] = landedPiece(first, target);
  let pieceOnTarget = board[target];
  let depth = 0;
  let toCapture = other(side);

  while (pieceOnTarget.type !== 'k') {
    const attacker = leastValuableAttacker(board, target, toCapture);
    if (attacker === null) break;
    const attackerPiece = board[attacker];
    if (!attackerPiece) break;
    // King rule: a king may capture only if the square is not defended
    // after the capture (post-capture board, x-rays included).
    if (attackerPiece.type === 'k') {
      const trial = board.slice();
      trial[attacker] = null;
      trial[target] = attackerPiece;
      if (attackersOf(trial, target, other(toCapture)).length > 0) break;
    }
    depth += 1;
    gains[depth] =
      captureGain(pieceOnTarget.type, attackerPiece.type, toCapture, target) - gains[depth - 1];
    board[attacker] = null;
    board[target] = landedPiece(attackerPiece, target);
    pieceOnTarget = board[target];
    toCapture = other(toCapture);
  }
  while (depth > 0) {
    gains[depth - 1] = -Math.max(-gains[depth - 1], gains[depth]);
    depth -= 1;
  }
  // Normalise -0 (produced by the negamax fold) to 0.
  return gains[0] === 0 ? 0 : gains[0];
}

/**
 * Static Exchange Evaluation: the net material outcome, in points, of the
 * capture sequence on `targetSquare` for the side to move in `fen`
 * (positive = the side to move wins material). Returns 0 when the side to
 * move has no attacker on the square or the square holds its own piece.
 */
export function see(fen: string, targetSquare: string): number {
  if (!/^[a-h][1-8]$/.test(targetSquare)) return 0;
  let parsed: { board: Board; turn: Color };
  try {
    parsed = parseBoard(fen);
  } catch {
    return 0;
  }
  const { board, turn } = parsed;
  const target = squareToIndex(targetSquare);
  const occupant = board[target];
  if (occupant && occupant.color === turn) return 0;
  const firstAttacker = leastValuableAttacker(board, target, turn);
  if (firstAttacker === null) return 0;
  // En passant: the FEN's ep square is a legal first capture for a pawn
  // beside the pawn that just double-pushed.
  const epField = fen.trim().split(/\s+/)[3];
  if (!occupant && epField === targetSquare) {
    const first = board[firstAttacker];
    if (first?.type === 'p') {
      const epVictimIdx = squareToIndex(`${targetSquare[0]}${indexToSquare(firstAttacker)[1]}`);
      const epVictim = board[epVictimIdx];
      if (epVictim?.type === 'p' && epVictim.color !== turn) {
        return seeOnBoard(board, target, turn, firstAttacker, epVictimIdx);
      }
    }
  }
  return seeOnBoard(board, target, turn, firstAttacker);
}

/**
 * SEE of one specific move: the net material outcome (points, mover's
 * perspective) of the capture sequence that starts with the piece on the
 * move's origin square capturing onto its destination. Unlike `see`, the
 * first attacker is the moved piece itself, not the cheapest attacker.
 */
export function seeForMove(fenBefore: string, moveUci: string): number {
  if (!moveUci || moveUci.length < 4) return 0;
  const { from, to, promotion } = parseUci(moveUci);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return 0;
  const { board, turn } = parseBoard(fenBefore);
  const fromIdx = squareToIndex(from);
  const piece = board[fromIdx];
  if (!piece || piece.color !== turn) return 0;
  // Legality of the FIRST capture comes from chess.js legal move
  // generation: a pinned piece cannot start a sequence it could not
  // legally play, and en passant is only offered when it is legal
  // (including the rare ep-exposes-the-king case).
  // Generation is scoped to the `from` square: the membership question
  // ("is this exact move legal?") has the same answer as the unscoped
  // list, but generating every legal move of the position costs ~8x
  // more (measured: 15.7 s vs 1.9 s over 1695 fixture moves) and this
  // function sits on the per-ply classification hot path.
  try {
    const chess = new Chess(fenBefore);
    const legal = chess
      .moves({ square: from as Square, verbose: true })
      .some(
        (m) =>
          m.from === from && m.to === to && (m.promotion ?? undefined) === (promotion ?? undefined),
      );
    if (!legal) return 0;
  } catch {
    return 0;
  }
  const toIdx = squareToIndex(to);
  // En passant: pawn moves diagonally onto an empty square.
  if (piece.type === 'p' && !board[toIdx] && from[0] !== to[0]) {
    const epVictimIdx = squareToIndex(`${to[0]}${from[1]}`);
    const epVictim = board[epVictimIdx];
    if (epVictim?.type === 'p' && epVictim.color !== turn) {
      return seeOnBoard(board, toIdx, turn, fromIdx, epVictimIdx);
    }
  }
  return seeOnBoard(board, toIdx, turn, fromIdx);
}

export type SacrificeKind = 'piece' | 'exchange' | 'queen' | 'mate';

export interface SacrificeResult {
  isSacrifice: boolean;
  /** Net points the mover gives up inside the analysed window. */
  value: number;
  /** True for a rook given up for a minor piece (exchange sacrifice). */
  isExchangeSac: boolean;
  /** What kind of sacrifice (Prompt 4); undefined when not a sacrifice. */
  kind?: SacrificeKind;
  /**
   * Mover-perspective material balance change (points) over the analysed
   * PV window (the played move + up to 3 PV replies = 4 plies).
   */
  pvMaterialDelta?: number;
}

export interface SacrificeOptions {
  /**
   * The move that produced `fenBefore` (the opponent's last move), when
   * known. When the candidate move exactly recaptures the piece that just
   * landed (same destination square, and that piece is captured), the move
   * is a recapture and is NEVER a sacrifice — taking back what the
   * opponent just took is not "offering" material. Without this option
   * the caller falls back to the older equal-value-capture exclusion,
   * which cannot tell a recapture from a fresh equal capture.
   */
  lastMove?: { from: string; to: string; captured?: string; san?: string };
  /** Precomputed exact-recapture flag (see classify.ts isExactRecapture). */
  isExactRecapture?: boolean;
}

/**
 * Sacrifice detection (spec 7.2.2, strengthened in Prompt 4). Material is
 * evaluated along the first 4 plies of the engine PV (the played move +
 * 3 replies) — not just on the destination square — and the destination
 * exchange is judged by the pin/promotion/ep-aware SEE above. A move IS
 * a sacrifice when any of these holds:
 *  - a piece (worth >= 3, or a rook taking a minor piece) is captured
 *    inside the window and the mover ends the window >= 2 points down
 *    (covers piece-for-pawn(s) and unrecovered exchange sacrifices);
 *  - SEE of the destination is negative with the piece really en prise;
 *  - the piece is given up and the PV delivers checkmate inside the
 *    window (a sacrifice leading to forced mate).
 * A move is NOT a sacrifice when it is: an equal trade (captured value
 * >= moved value), an exact recapture (see SacrificeOptions.lastMove),
 * a pawn gambit (moved piece is a pawn — a pawn offer alone does not
 * count unless a piece is offered too, which the >= 3 rule enforces),
 * a promotion, or mate-in-1 itself.
 */
export function analyzeSacrifice(
  fenBefore: string,
  moveUci: string,
  pvUci: string[],
  opts?: SacrificeOptions,
): SacrificeResult {
  const notSac: SacrificeResult = { isSacrifice: false, value: 0, isExchangeSac: false };
  if (!moveUci || moveUci.length < 4) return notSac;
  const { from, to, promotion } = parseUci(moveUci);
  if (promotion) return notSac; // promotions are excluded
  // Recaptures are not sacrifices (Prompt 4): with the exact last move
  // known, a move that captures the piece that just landed — on the very
  // square it landed on — is taking material back, not offering it.
  if (opts?.isExactRecapture) return notSac;
  if (opts?.lastMove && opts.lastMove.to === to) {
    const { board: lb } = parseBoard(fenBefore);
    const victimThere = lb[squareToIndex(to)];
    if (victimThere && victimThere.type !== 'k') return notSac;
  }

  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return notSac;
  }
  const mover: Color = chess.turn();
  const { board } = parseBoard(fenBefore);
  const fromIdx = squareToIndex(from);
  const toIdx = squareToIndex(to);
  const movedPiece = board[fromIdx];
  if (!movedPiece || movedPiece.color !== mover) return notSac;

  const movedValue = PIECE_VALUES[movedPiece.type] ?? 0;
  const destPiece = board[toIdx];
  let capturedValue =
    destPiece && destPiece.color !== mover ? (PIECE_VALUES[destPiece.type] ?? 0) : 0;
  // En passant: a pawn moving diagonally onto an empty square captures a pawn.
  if (movedPiece.type === 'p' && !destPiece && from[0] !== to[0]) capturedValue = 1;

  const rookForMinor =
    movedPiece.type === 'r' && (destPiece?.type === 'n' || destPiece?.type === 'b');
  if (movedValue < 3 && !rookForMinor) return notSac;
  if (capturedValue >= movedValue) return notSac; // equal/better capture, not a gift

  // Play the move itself; bail out on illegality and on mate-in-1.
  let firstMove: ReturnType<Chess['move']>;
  try {
    firstMove = chess.move({ from, to, promotion });
  } catch {
    return notSac;
  }
  if (firstMove.isPromotion()) return notSac;
  if (chess.isCheckmate()) return notSac; // mate-in-1 is excluded
  // Position after ONLY the played move (the SEE path below needs its
  // board); snapshot it now, before the same instance walks the PV.
  const afterFirstMoveFen = chess.fen();

  // Normalise the PV window: start with the played move, then up to 3 more.
  const rest = pvUci.length > 0 && pvUci[0] === moveUci ? pvUci.slice(1, 4) : pvUci.slice(0, 3);
  const balanceBefore = materialBalance(fenBefore);
  const moverSign = mover === 'w' ? 1 : -1;

  // Walk the FULL window (played move + up to 3 PV replies = 4 plies),
  // tracking the sacrificed piece's square. The material verdict uses the
  // balance at the END of the window — not just the destination square —
  // so a piece that is captured on ply 2 but whose side regains material
  // on ply 4 (a combination, not a net gift) is judged on the net result,
  // while a piece regained only beyond the window still counts as given
  // up (the window is deliberately short; see the header comment).
  // The walk continues on the SAME Chess instance that already played
  // the move (a second instance replaying the identical move from the
  // same FEN was pure waste on this hot path).
  let pieceSquare = to;
  let pieceCaptured = false;
  let moverCapturedMinorInWindow = capturedValue === 3;
  let mateDeliveredInWindow = false;
  for (const uci of rest) {
    const step = parseUci(uci);
    let move: ReturnType<Chess['move']>;
    try {
      move = chess.move({ from: step.from, to: step.to, promotion: step.promotion });
    } catch {
      break; // PV disagrees with the position; use the applied prefix
    }
    if (move.color === mover && move.captured === 'n') moverCapturedMinorInWindow = true;
    if (move.color === mover && move.captured === 'b') moverCapturedMinorInWindow = true;
    if (!pieceCaptured && move.captured && step.to === pieceSquare && move.color !== mover) {
      pieceCaptured = true;
    } else if (!pieceCaptured && step.from === pieceSquare && move.color === mover) {
      pieceSquare = step.to; // the piece moved on; keep tracking it
    }
    if (move.color === mover && chess.isCheckmate()) mateDeliveredInWindow = true;
  }
  const balanceAfter = materialBalance(chess.fen());
  const moverDelta = (balanceAfter - balanceBefore) * moverSign;

  const pvSacrifice = pieceCaptured && moverDelta <= -2;
  const pvGivenUp = pvSacrifice ? -moverDelta : 0;

  // SEE path: the played capture/landing loses material on the destination
  // and an enemy attacker really does bear on that square after the move.
  const seeNet = seeForMove(fenBefore, moveUci);
  const afterBoard = parseBoard(afterFirstMoveFen).board;
  const enemy: Color = mover === 'w' ? 'b' : 'w';
  const enPrise = attackersOf(afterBoard, toIdx, enemy).length > 0;
  const seeSacrifice = seeNet < 0 && enPrise;
  const seeGivenUp = seeSacrifice ? -seeNet : 0;

  // Forced-mate path: the piece is given up (captured in the window, or
  // en prise per SEE) and the PV mates inside the window — a sacrifice
  // even when the raw material delta is shallower than 2 points (e.g. a
  // rook for a pawn that mates).
  const mateSacrifice = mateDeliveredInWindow && (pieceCaptured || seeSacrifice) && moverDelta < 0;
  const mateGivenUp = mateSacrifice ? -moverDelta : 0;

  const isSacrifice = pvSacrifice || seeSacrifice || mateSacrifice;
  if (!isSacrifice) return { ...notSac, pvMaterialDelta: moverDelta };

  const isExchangeSac =
    movedPiece.type === 'r' &&
    (capturedValue === 3 || (pieceCaptured && moverCapturedMinorInWindow));

  const kind: SacrificeKind = mateSacrifice
    ? 'mate'
    : movedPiece.type === 'q'
      ? 'queen'
      : isExchangeSac
        ? 'exchange'
        : 'piece';

  return {
    isSacrifice: true,
    value: Math.max(pvGivenUp, seeGivenUp, mateGivenUp),
    isExchangeSac,
    kind,
    pvMaterialDelta: moverDelta,
  };
}

// Re-exported for tests / debugging of the board layer.
export const __board = {
  parseBoard,
  squareToIndex,
  indexToSquare,
  attackersOf,
  pinDirection,
  captureRespectsPin,
};
