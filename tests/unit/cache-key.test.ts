import { describe, expect, it } from 'vitest';
import { normalizeFen, positionKey } from '@/engine/cache';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_NORMALIZED = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

describe('normalizeFen', () => {
  it('drops the halfmove and fullmove counters (first four fields only)', () => {
    expect(normalizeFen(START)).toBe(START_NORMALIZED);
    expect(
      normalizeFen('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'),
    ).toBe('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -');
  });

  it('keeps placement, side to move, castling and en-passant fields', () => {
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    );
  });

  it('is insensitive to the move counters and surrounding whitespace', () => {
    const a = normalizeFen('  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  ');
    const b = normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 17 42');
    expect(a).toBe(b);
  });

  it('distinguishes positions that differ on the board or side to move', () => {
    expect(normalizeFen(START)).not.toBe(
      normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'),
    );
    expect(normalizeFen(START)).not.toBe(
      normalizeFen('rnbqkbnr/pppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    );
  });
});

describe('positionKey', () => {
  it('has the format "<normalized fen>|d<depth>|pv<multipv>"', () => {
    expect(positionKey(START, 18, 3)).toBe(`${START_NORMALIZED}|d18|pv3`);
    expect(positionKey(START, 14, 1)).toBe(`${START_NORMALIZED}|d14|pv1`);
  });

  it('gives the same key for the same position with different move counters', () => {
    const laterCounters = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 23 57';
    expect(positionKey(laterCounters, 18, 3)).toBe(positionKey(START, 18, 3));
  });

  it('gives different keys for different depth or multipv', () => {
    expect(positionKey(START, 18, 3)).not.toBe(positionKey(START, 22, 3));
    expect(positionKey(START, 18, 3)).not.toBe(positionKey(START, 18, 5));
  });
});
