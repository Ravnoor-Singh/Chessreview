// SAN / UCI conversion helpers built on chess.js.
//
// chess.js 1.x `move()` throws an Error on an illegal move, so every call is
// wrapped in try/catch and degraded gracefully (fallback / stop / null)
// instead of propagating.

import { Chess } from 'chess.js';

export interface ParsedUci {
  from: string;
  to: string;
  promotion?: string;
}

/** Split a UCI move ("e2e4", "a7a8q") into its parts. */
export function parseUci(uci: string): ParsedUci {
  const clean = uci.trim().toLowerCase();
  return {
    from: clean.slice(0, 2),
    to: clean.slice(2, 4),
    promotion: clean.length >= 5 ? clean.slice(4, 5) : undefined,
  };
}

/** Assemble a UCI string from from/to/promotion parts. */
export function makeUci(from: string, to: string, promotion?: string): string {
  return promotion ? `${from}${to}${promotion}` : `${from}${to}`;
}

/**
 * Convert a UCI move played in the position `fen` to SAN.
 * Falls back to the UCI string itself when the move is illegal (or the FEN
 * cannot be loaded), so callers always get something displayable.
 */
export function uciToSan(fen: string, uci: string): string {
  if (!uci) return uci;
  try {
    const chess = new Chess(fen);
    const { from, to, promotion } = parseUci(uci);
    const move = chess.move({ from, to, promotion });
    return move.san;
  } catch {
    return uci;
  }
}

/**
 * Convert a principal variation (UCI moves starting from `fen`) to SAN.
 * Stops at the first illegal move and returns the SANs gathered so far.
 */
export function pvToSan(fen: string, uciMoves: string[]): string[] {
  const sans: string[] = [];
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return sans;
  }
  for (const uci of uciMoves) {
    try {
      const { from, to, promotion } = parseUci(uci);
      const move = chess.move({ from, to, promotion });
      sans.push(move.san);
    } catch {
      break;
    }
  }
  return sans;
}

/**
 * Apply a UCI move to `fen`, returning the resulting FEN, or null when the
 * move (or the FEN) is illegal.
 */
export function applyUci(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const { from, to, promotion } = parseUci(uci);
    chess.move({ from, to, promotion });
    return chess.fen();
  } catch {
    return null;
  }
}

/** File index (0 = a-file … 7 = h-file) of an algebraic square. */
export function squareToFile(square: string): number {
  return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

/** Rank index (0 = rank 1 … 7 = rank 8) of an algebraic square. */
export function squareToRank(square: string): number {
  return square.charCodeAt(1) - '1'.charCodeAt(0);
}

/**
 * Board coordinates for an algebraic square: `x` is the file (0 = a … 7 = h)
 * and `y` is the row from the top of a White-oriented board (0 = rank 8 …
 * 7 = rank 1), matching CSS/canvas rendering.
 */
export function squareToXY(square: string): { x: number; y: number } {
  return { x: squareToFile(square), y: 7 - squareToRank(square) };
}

/** Inverse of squareToFile/squareToRank: file/rank indices → square name. */
export function fileRankToSquare(file: number, rank: number): string {
  return `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank + 1}`;
}

/** True when `square` looks like a valid algebraic square ("a1"…"h8"). */
export function isSquare(square: string): boolean {
  return /^[a-h][1-8]$/.test(square);
}

/** The opposite colour. */
export function oppositeColor(color: 'w' | 'b'): 'w' | 'b' {
  return color === 'w' ? 'b' : 'w';
}
