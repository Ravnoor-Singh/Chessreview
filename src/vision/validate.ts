/**
 * Position assembly + validation for the screenshot review step.
 *
 * Turns the recognizer's 64 squares into a FEN (with castling rights
 * inferred from king/rook home squares — always editable in the UI) and
 * checks the position the way a careful human would: exactly one king per
 * side, no pawns on ranks 1/8, sane piece counts, kings not adjacent, and
 * the side NOT to move must not be in check (that would mean the previous
 * move ended with the mover's own king attacked, which is illegal).
 * chess.js does the final structural validation where it can.
 */

import { Chess } from 'chess.js';
import type { PieceKey } from './types';
import { t, type Locale } from '@/i18n';

/** Squares are indexed 0..63, 0 = a8 … 63 = h1 (rank 8 first). */
export type SquareArray = (PieceKey | null)[];

export function squareName(index: number): string {
  const file = index % 8;
  const rank = 8 - Math.floor(index / 8);
  return `${'abcdefgh'[file]}${rank}`;
}

export function squareIndex(name: string): number {
  const file = name.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = name.charCodeAt(1) - '1'.charCodeAt(0); // 0..7 for ranks 1..8
  return (7 - rank) * 8 + file;
}

/** Rotate the board 180° (what the "swap orientation" button applies). */
export function flipSquares(squares: SquareArray): SquareArray {
  const out: (PieceKey | null)[] = new Array(64).fill(null);
  for (let i = 0; i < 64; i++) out[63 - i] = squares[i];
  return out;
}

/** Castling rights implied by kings/rooks standing on their home squares. */
export function inferCastling(squares: SquareArray): string {
  const at = (name: string) => squares[squareIndex(name)];
  let rights = '';
  if (at('e1') === 'wK' && at('h1') === 'wR') rights += 'K';
  if (at('e1') === 'wK' && at('a1') === 'wR') rights += 'Q';
  if (at('e8') === 'bK' && at('h8') === 'bR') rights += 'k';
  if (at('e8') === 'bK' && at('a8') === 'bR') rights += 'q';
  return rights || '-';
}

/** Assemble a FEN from squares + side to move (+ castling; inferred when omitted). */
export function assembleFen(squares: SquareArray, turn: 'w' | 'b', castling?: string): string {
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let out = '';
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      const piece = squares[row * 8 + col];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        out += String(empty);
        empty = 0;
      }
      out += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
    }
    if (empty > 0) out += String(empty);
    rows.push(out);
  }
  return `${rows.join('/')} ${turn} ${castling ?? inferCastling(squares)} - 0 1`;
}

/** Convert a FEN's board part into the 64-square array (review-step input). */
export function fenToSquares(fen: string): SquareArray {
  const squares: SquareArray = new Array(64).fill(null);
  const rows = fen.trim().split(/\s+/)[0].split('/');
  rows.forEach((rowStr, row) => {
    let col = 0;
    for (const ch of rowStr) {
      if (/\d/.test(ch)) {
        col += Number(ch);
      } else {
        const key = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
        squares[row * 8 + col] = key as PieceKey;
        col++;
      }
    }
  });
  return squares;
}

export interface PositionValidation {
  /** Hard problems: the position cannot be analyzed until fixed. */
  errors: string[];
  /** Suspicious but analyzable (e.g. material that needs many promotions). */
  warnings: string[];
  castling: string;
  fen: string;
}

const START_COUNT: Record<string, number> = { Q: 1, R: 2, B: 2, N: 2 };

export function validatePosition(
  squares: SquareArray,
  turn: 'w' | 'b',
  locale: Locale = 'en',
): PositionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const castling = inferCastling(squares);
  const fen = assembleFen(squares, turn, castling);

  const counts: Record<'w' | 'b', Record<string, number>> = {
    w: { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0, total: 0 },
    b: { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0, total: 0 },
  };
  let whiteKing = -1;
  let blackKing = -1;
  squares.forEach((piece, i) => {
    if (!piece) return;
    const color = piece[0] as 'w' | 'b';
    const type = piece[1];
    counts[color][type]++;
    counts[color].total++;
    if (piece === 'wK') whiteKing = i;
    if (piece === 'bK') blackKing = i;
    if (type === 'P') {
      const rank = 8 - Math.floor(i / 8);
      if (rank === 1 || rank === 8) {
        errors.push(t(locale, 'vision.pawnOnSquare', { square: squareName(i), rank }));
      }
    }
  });

  if (counts.w.K !== 1) errors.push(t(locale, 'vision.needWhiteKingCount', { count: counts.w.K }));
  if (counts.b.K !== 1) errors.push(t(locale, 'vision.needBlackKingCount', { count: counts.b.K }));
  for (const color of ['w', 'b'] as const) {
    const c = counts[color];
    const label = t(locale, color === 'w' ? 'common.white' : 'common.black');
    if (c.total > 16)
      errors.push(t(locale, 'vision.tooManyPieces', { side: label, count: c.total }));
    if (c.P > 8) errors.push(t(locale, 'vision.tooManyPawns', { side: label, count: c.P }));
    // Extra queens/rooks/bishops/knights beyond the starting set require
    // pawn promotions, which require missing pawns.
    let extras = 0;
    for (const t of ['Q', 'R', 'B', 'N']) extras += Math.max(0, c[t] - START_COUNT[t]);
    if (extras > 0 && extras > 8 - c.P) {
      const missing = 8 - c.P;
      // Two independent counts vary in this sentence, so the catalogue
      // carries the four combinations as whole-sentence templates.
      const key =
        extras === 1 && missing === 1
          ? 'vision.materialWarningOneOne'
          : missing === 1
            ? 'vision.materialWarningMissingOne'
            : extras === 1
              ? 'vision.materialWarning'
              : 'vision.materialWarning';
      const params = { side: label, extras, missing, count: extras };
      warnings.push(
        extras === 1 && missing !== 1
          ? t(locale, 'vision.materialWarning', { ...params })
          : t(locale, key, params),
      );
    }
  }

  if (whiteKing >= 0 && blackKing >= 0) {
    const wf = whiteKing % 8;
    const wr = Math.floor(whiteKing / 8);
    const bf = blackKing % 8;
    const br = Math.floor(blackKing / 8);
    if (Math.abs(wf - bf) <= 1 && Math.abs(wr - br) <= 1) {
      errors.push(t(locale, 'vision.kingsAdjacent'));
    }
  }

  if (errors.length === 0) {
    // chess.js structural validation + the illegal-check rule: with the
    // turn flipped, "side to move is in check" ⇔ the original side NOT to
    // move is in check ⇔ the previous move was illegal.
    try {
      new Chess(fen);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : t(locale, 'vision.rejectedPosition'));
    }
    if (errors.length === 0) {
      const flipped = assembleFen(squares, turn === 'w' ? 'b' : 'w', castling);
      try {
        if (new Chess(flipped).isCheck()) {
          errors.push(t(locale, 'vision.sideNotToMoveInCheck'));
        }
      } catch {
        // chess.js could not evaluate the flipped FEN; the structural
        // checks above already passed, so don't invent an error.
      }
    }
  }

  return { errors, warnings, castling, fen };
}
