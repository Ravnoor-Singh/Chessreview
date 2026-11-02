import { describe, expect, it } from 'vitest';
import { applyUci, pvToSan, squareToXY, uciToSan } from '@/lib/san';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciToSan', () => {
  it('converts e2e4 in the start position to "e4"', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4');
    expect(uciToSan(START, 'g1f3')).toBe('Nf3');
    expect(uciToSan(START, 'd2d4')).toBe('d4');
  });

  it('falls back to the UCI string for an illegal move', () => {
    expect(uciToSan(START, 'e2e5')).toBe('e2e5');
    expect(uciToSan(START, 'a1a8')).toBe('a1a8');
  });

  it('handles promotion and capture notation', () => {
    const fen = '8/P7/8/8/8/8/1k5K/8 w - - 0 1';
    expect(uciToSan(fen, 'a7a8q')).toBe('a8=Q');
  });
});

describe('pvToSan', () => {
  it('converts a whole line', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('converts a castling line', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
    expect(pvToSan(fen, ['e1g1'])).toEqual(['O-O']);
    expect(uciToSan(fen, 'e1g1')).toBe('O-O');
  });

  it('stops at the first illegal move', () => {
    expect(pvToSan(START, ['e2e4', 'e7e9', 'e7e5'])).toEqual(['e4']);
    expect(pvToSan(START, ['e2e5', 'e7e5'])).toEqual([]);
  });
});

describe('applyUci', () => {
  it('returns the new FEN after a legal move', () => {
    const fen = applyUci(START, 'e2e4');
    expect(fen).not.toBeNull();
    expect(fen).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq');
  });

  it('returns null for an illegal move', () => {
    expect(applyUci(START, 'e2e5')).toBeNull();
    expect(applyUci('not a fen', 'e2e4')).toBeNull();
  });
});

describe('squareToXY', () => {
  it('maps corners correctly (y measured from rank 8)', () => {
    expect(squareToXY('a1')).toEqual({ x: 0, y: 7 });
    expect(squareToXY('h8')).toEqual({ x: 7, y: 0 });
    expect(squareToXY('a8')).toEqual({ x: 0, y: 0 });
    expect(squareToXY('h1')).toEqual({ x: 7, y: 7 });
    expect(squareToXY('e4')).toEqual({ x: 4, y: 4 });
  });
});
