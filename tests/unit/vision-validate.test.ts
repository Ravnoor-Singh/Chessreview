import { describe, expect, it } from 'vitest';
import {
  assembleFen,
  fenToSquares,
  flipSquares,
  inferCastling,
  squareIndex,
  squareName,
  validatePosition,
  type SquareArray,
} from '@/vision/validate';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function empty(): SquareArray {
  return new Array(64).fill(null);
}
function put(sq: SquareArray, name: string, piece: SquareArray[number]) {
  sq[squareIndex(name)] = piece;
  return sq;
}

describe('vision/validate square addressing', () => {
  it('squareName/squareIndex round-trip the corners', () => {
    expect(squareName(0)).toBe('a8');
    expect(squareName(63)).toBe('h1');
    expect(squareIndex('a8')).toBe(0);
    expect(squareIndex('h1')).toBe(63);
    expect(squareIndex('e1')).toBe(60);
    expect(squareName(60)).toBe('e1');
  });

  it('flipSquares rotates 180 degrees', () => {
    const sq = put(empty(), 'a8', 'bQ');
    const flipped = flipSquares(sq);
    expect(flipped[squareIndex('h1')]).toBe('bQ');
    expect(flipSquares(flipped)).toEqual(sq);
  });
});

describe('vision/validate FEN assembly', () => {
  it('round-trips the start position', () => {
    expect(assembleFen(fenToSquares(START), 'w')).toBe(START);
  });

  it('infers castling rights from home squares only', () => {
    expect(inferCastling(fenToSquares(START))).toBe('KQkq');
    const noRook = fenToSquares(START);
    noRook[squareIndex('h1')] = null;
    expect(inferCastling(noRook)).toBe('Qkq');
    const kingMoved = fenToSquares(START);
    kingMoved[squareIndex('e1')] = null;
    kingMoved[squareIndex('e2')] = 'wK';
    expect(inferCastling(kingMoved)).toBe('kq');
    expect(inferCastling(empty())).toBe('-');
  });

  it('fenToSquares parses sparse positions', () => {
    const sq = fenToSquares('8/8/4k3/3P4/4K3/8/8/8 w - - 0 1');
    expect(sq[squareIndex('e6')]).toBe('bK');
    expect(sq[squareIndex('d5')]).toBe('wP');
    expect(sq[squareIndex('e4')]).toBe('wK');
    expect(sq.filter(Boolean)).toHaveLength(3);
  });
});

describe('vision/validate position checks', () => {
  it('accepts the start position with no errors or warnings', () => {
    const v = validatePosition(fenToSquares(START), 'w');
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.fen).toBe(START);
  });

  it('requires exactly one king per side', () => {
    const v = validatePosition(empty(), 'w');
    expect(v.errors.join(' ')).toMatch(/white king/);
    expect(v.errors.join(' ')).toMatch(/black king/);
    const two = put(put(put(empty(), 'e1', 'wK'), 'a1', 'wK'), 'e8', 'bK');
    expect(validatePosition(two, 'w').errors.join(' ')).toMatch(
      /exactly one white king \(found 2\)/,
    );
  });

  it('rejects pawns on ranks 1 and 8', () => {
    const sq = put(put(put(empty(), 'e1', 'wK'), 'e8', 'bK'), 'a8', 'wP');
    expect(validatePosition(sq, 'w').errors.join(' ')).toMatch(/pawn cannot stand on a8/i);
    const sq2 = put(put(put(empty(), 'e1', 'wK'), 'e8', 'bK'), 'h1', 'bP');
    expect(validatePosition(sq2, 'b').errors.join(' ')).toMatch(/pawn cannot stand on h1/i);
  });

  it('rejects more than 16 pieces or 9 pawns for a side', () => {
    const sq = put(put(empty(), 'e1', 'wK'), 'e8', 'bK');
    // 9 white pawns on legal ranks.
    for (const name of ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'a3']) put(sq, name, 'wP');
    const v = validatePosition(sq, 'w');
    expect(v.errors.join(' ')).toMatch(/9 pawns/);
  });

  it('rejects adjacent kings', () => {
    const sq = put(put(empty(), 'e4', 'wK'), 'e5', 'bK');
    expect(validatePosition(sq, 'w').errors.join(' ')).toMatch(/kings are next to each other/);
  });

  it('rejects a position where the side NOT to move is in check', () => {
    // White rook on e2 attacks the black king on e8 up the open e-file.
    // With WHITE to move, Black is the side not to move: Black being in
    // check would mean Black's last move left his own king attacked —
    // illegal. With BLACK to move, Black is simply in check — legal.
    const sq = put(put(put(empty(), 'a1', 'wK'), 'e8', 'bK'), 'e2', 'wR');
    const illegal = validatePosition(sq, 'w');
    expect(illegal.errors.join(' ')).toMatch(/side not to move is in check/);
    // Same board, Black to move: Black is simply in check — legal.
    const legal = validatePosition(sq, 'b');
    expect(legal.errors).toEqual([]);
  });

  it('warns (not errors) on material needing impossible promotions', () => {
    // Three white queens but all 8 white pawns still on the board.
    const sq = fenToSquares('8/8/8/3k4/8/8/PPPPPPPP/QQ2K2Q w - - 0 1');
    const v = validatePosition(sq, 'w');
    expect(v.errors).toEqual([]);
    expect(v.warnings.join(' ')).toMatch(/promoted piece/);
  });

  it('does not warn on a legal promoted-queen position', () => {
    const v = validatePosition(fenToSquares('Q7/8/8/8/3k4/8/4q3/4K2Q w - - 0 1'), 'w');
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });
});
