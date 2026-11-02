import { describe, expect, it } from 'vitest';
import { formatWdl, wdlToWhitePercentages } from '@/lib/wdl';

describe('wdlToWhitePercentages', () => {
  it('passes White-to-move WDL through as White percentages', () => {
    expect(wdlToWhitePercentages([380, 520, 100], 'w')).toEqual({ w: 38, d: 52, l: 10 });
  });
  it('swaps W and L when Black is to move', () => {
    // Stockfish per-mille is side-to-move: Black winning 38% means White loses 38%.
    expect(wdlToWhitePercentages([380, 520, 100], 'b')).toEqual({ w: 10, d: 52, l: 38 });
  });
  it('always sums to exactly 100 (largest-remainder rounding)', () => {
    for (const wdl of [
      [333, 333, 334],
      [1, 1, 998],
      [335, 335, 330],
      [999, 1, 0],
      [0, 1000, 0],
    ] as const) {
      const pct = wdlToWhitePercentages(wdl, 'w');
      expect(pct).not.toBeNull();
      expect(pct!.w + pct!.d + pct!.l).toBe(100);
    }
    expect(wdlToWhitePercentages([333, 333, 334], 'w')).toEqual({ w: 33, d: 33, l: 34 });
    expect(wdlToWhitePercentages([1, 1, 998], 'w')).toEqual({ w: 0, d: 0, l: 100 });
  });
  it('normalises per-mille triples that do not sum to 1000', () => {
    expect(wdlToWhitePercentages([190, 260, 50], 'w')).toEqual({ w: 38, d: 52, l: 10 });
  });
  it('returns null for missing or empty WDL', () => {
    expect(wdlToWhitePercentages(undefined, 'w')).toBeNull();
    expect(wdlToWhitePercentages(null, 'b')).toBeNull();
    expect(wdlToWhitePercentages([0, 0, 0], 'w')).toBeNull();
  });
});

describe('formatWdl', () => {
  it('formats the compact label', () => {
    expect(formatWdl({ w: 38, d: 52, l: 10 })).toBe('W 38% · D 52% · L 10%');
  });
});
