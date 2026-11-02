// Material counting from a FEN piece-placement field.
// Piece letters in results are lowercase piece types ('q', 'r', 'b', 'n', 'p').

import { PIECE_VALUES } from './constants';

/** How many of each piece type each colour starts a normal game with. */
const START_COUNTS: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

export interface PieceCounts {
  white: Record<string, number>;
  black: Record<string, number>;
}

/** Count the pieces on the board described by `fen` (placement field only). */
export function countPieces(fen: string): PieceCounts {
  const counts: PieceCounts = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  for (const ch of placement) {
    if (ch === '/' || /\d/.test(ch)) continue;
    const lower = ch.toLowerCase();
    if (!(lower in counts.white)) continue;
    if (ch === lower) counts.black[lower] += 1;
    else counts.white[lower] += 1;
  }
  return counts;
}

function totalMaterial(counts: Record<string, number>): number {
  let sum = 0;
  for (const [piece, value] of Object.entries(PIECE_VALUES)) {
    sum += (counts[piece] ?? 0) * value;
  }
  return sum;
}

/**
 * Material balance of the position in points, White minus Black
 * (positive = White is up material). Kings contribute 0.
 */
export function materialBalance(fen: string): number {
  const counts = countPieces(fen);
  return totalMaterial(counts.white) - totalMaterial(counts.black);
}

export interface CapturedPieces {
  /** Piece types captured BY White (i.e. missing Black pieces), value desc. */
  byWhite: string[];
  /** Piece types captured BY Black (i.e. missing White pieces), value desc. */
  byBlack: string[];
  /** White's material advantage in points (same as materialBalance). */
  diff: number;
}

function missingPieces(present: Record<string, number>): string[] {
  const missing: string[] = [];
  for (const [piece, startCount] of Object.entries(START_COUNTS)) {
    if (piece === 'k') continue; // kings are never captured
    // Promotions can push a count above the starting count; the surplus is
    // not "missing", so clamp at zero instead of going negative.
    const gone = Math.max(0, startCount - (present[piece] ?? 0));
    for (let i = 0; i < gone; i += 1) missing.push(piece);
  }
  missing.sort((a, b) => (PIECE_VALUES[b] ?? 0) - (PIECE_VALUES[a] ?? 0));
  return missing;
}

/**
 * Which pieces each side has captured, inferred by comparing the position
 * against the standard starting complement of pieces.
 */
export function capturedPieces(fen: string): CapturedPieces {
  const counts = countPieces(fen);
  return {
    byWhite: missingPieces(counts.black),
    byBlack: missingPieces(counts.white),
    diff: totalMaterial(counts.white) - totalMaterial(counts.black),
  };
}

/** Point value of a piece type letter ('q' → 9); 0 for unknown letters. */
export function pieceValue(piece: string): number {
  return PIECE_VALUES[piece.toLowerCase()] ?? 0;
}
