import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { emptyFen, fenTurn, validateFen } from '@/parsers/fen';
import { t } from '@/i18n';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('validateFen', () => {
  it('rejects an empty FEN with the localized empty error', () => {
    const en = validateFen('   ');
    expect(en.valid).toBe(false);
    if (!en.valid) expect(en.error).toBe(t('en', 'input.fenEmpty'));
    const hi = validateFen('', 'hi');
    expect(hi.valid).toBe(false);
    if (!hi.valid) expect(hi.error).toBe(t('hi', 'input.fenEmpty'));
  });

  it('accepts the start position and returns the chess.js-normalized FEN', () => {
    const res = validateFen(STARTPOS);
    expect(res.valid).toBe(true);
    if (res.valid) expect(res.fen).toBe(new Chess(STARTPOS).fen());
  });

  it('accepts a mid-game FEN with black to move', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 4';
    const res = validateFen(fen);
    expect(res.valid).toBe(true);
    if (res.valid) expect(res.fen).toContain(' b ');
  });

  it('rejects garbage with a non-empty error', () => {
    const res = validateFen('not a fen at all');
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error.length).toBeGreaterThan(0);
  });

  it('rejects a structurally plausible but illegal FEN (missing kings)', () => {
    const res = validateFen('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(res.valid).toBe(false);
  });
});

describe('emptyFen / fenTurn', () => {
  it('emptyFen is the empty board, white to move, and itself valid input for fenTurn', () => {
    expect(emptyFen()).toBe('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(fenTurn(emptyFen())).toBe('w');
  });

  it('reads the side-to-move field directly', () => {
    expect(fenTurn(STARTPOS)).toBe('w');
    expect(fenTurn('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('b');
  });

  it('falls back to white for garbage input', () => {
    expect(fenTurn('garbage')).toBe('w');
    expect(fenTurn('')).toBe('w');
  });
});
