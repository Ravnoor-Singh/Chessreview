import { describe, expect, it } from 'vitest';
import { pvToSan, uciToSan } from '@/lib/san';
import { formatClock, formatEval, hashString } from '@/lib/format';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciToSan', () => {
  it('converts a pawn push in the start position', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4');
    expect(uciToSan(START, 'd2d4')).toBe('d4');
  });

  it('converts castling to O-O and O-O-O', () => {
    const kingside = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
    expect(uciToSan(kingside, 'e1g1')).toBe('O-O');
    const bothSides = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(uciToSan(bothSides, 'e1c1')).toBe('O-O-O');
    expect(uciToSan(bothSides, 'e1g1')).toBe('O-O');
  });

  it('includes capture, check and promotion notation from chess.js', () => {
    // Scholar's-mate position (1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6??): Qxf7 is
    // checkmate, defended by the bishop on c4 — assert capture + mate marks.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
    expect(uciToSan(fen, 'h5f7')).toBe('Qxf7#');
    const promo = '8/P7/8/8/8/8/k6K/8 w - - 0 1';
    expect(uciToSan(promo, 'a7a8q')).toBe('a8=Q+'); // check down the a-file
  });
});

describe('pvToSan', () => {
  it('converts a full PV and reports its length', () => {
    const sans = pvToSan(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    expect(sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(sans).toHaveLength(5);
  });

  it('returns an empty array for an empty PV and stops at illegal moves', () => {
    expect(pvToSan(START, [])).toEqual([]);
    expect(pvToSan(START, ['e2e4', 'e7e5', 'e1e3'])).toEqual(['e4', 'e5']);
  });
});

describe('formatEval', () => {
  it('formats centipawn evals as signed pawns with one decimal', () => {
    expect(formatEval(130)).toBe('+1.3');
    expect(formatEval(-70)).toBe('-0.7');
    expect(formatEval(0)).toBe('0.0');
    expect(formatEval(1000)).toBe('+10.0');
    expect(formatEval(-1000)).toBe('-10.0');
  });

  it('formats explicit mate scores as M<n> / -M<n>', () => {
    expect(formatEval(0, 4)).toBe('M4');
    expect(formatEval(0, -3)).toBe('-M3');
    expect(formatEval(123, 1)).toBe('M1');
  });

  it('decodes the internal mate encoding ±(100000 - |mate|)', () => {
    expect(formatEval(100000 - 4)).toBe('M4');
    expect(formatEval(-(100000 - 3))).toBe('-M3');
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds as m:ss', () => {
    expect(formatClock(754000)).toBe('12:34'); // 754 s = 12 min 34 s
    expect(formatClock(60000)).toBe('1:00');
    expect(formatClock(599000)).toBe('9:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatClock(3723000)).toBe('1:02:03');
  });

  it('shows tenths under a minute, as real clocks do', () => {
    expect(formatClock(45200)).toBe('0:45.2');
    expect(formatClock(0)).toBe('0:00.0');
  });
});

describe('hashString', () => {
  it('matches independently computed FNV-1a 32-bit values', () => {
    // Computed with a separate (Python) implementation of FNV-1a 32-bit:
    // offset basis 0x811c9dc5, prime 0x01000193, output 8 lowercase hex.
    expect(hashString('')).toBe('811c9dc5');
    expect(hashString('a')).toBe('e40c292c');
    expect(hashString('hello')).toBe('4f9f2cab');
  });

  it('is stable across calls and sensitive to the input', () => {
    expect(hashString('some pgn text')).toBe(hashString('some pgn text'));
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    expect(hashString('hello')).not.toBe(hashString('hello '));
    expect(hashString('x')).toMatch(/^[0-9a-f]{8}$/);
  });
});
