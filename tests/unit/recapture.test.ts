import { describe, expect, it } from 'vitest';
import {
  blockedLabelReason,
  classifyMove,
  classifyMoveDetailed,
  isExactRecapture,
  type ClassifyInput,
} from '@/analysis/classify';
import { analyzeSacrifice } from '@/analysis/sacrifice';
import type { EngineLine } from '@/lib/types';

function line(multipv: number, scoreCp: number, pv: string[]): EngineLine {
  return { multipv, depth: 18, scoreCp, pv };
}

// Position after Black's queen captured a pawn on d5 (…Qxd5): the white
// e-pawn can recapture the queen that just landed on d5.
const AFTER_QXD5 = 'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';

function queenRecaptureInput(overrides: Partial<ClassifyInput>): ClassifyInput {
  return {
    fenBefore: AFTER_QXD5,
    moveUci: 'e4d5',
    legalMoveCount: 30,
    isBookMove: false,
    // exd5 is best by a mile: the only-move pattern that (without the
    // recapture rule) would earn Great.
    linesBefore: [line(1, 300, ['e4d5']), line(2, -200, ['g1f3']), line(3, -260, ['d2d4'])],
    winProbBefore: 60,
    winProbAfter: 85,
    epl: 0,
    brilliantUsedInWindow: 0,
    movesSinceStart: 10,
    ...overrides,
  };
}

describe('isExactRecapture (Prompt 4)', () => {
  it('is true when the move captures the piece that just landed on that square', () => {
    expect(
      isExactRecapture({
        fenBefore: AFTER_QXD5,
        moveUci: 'e4d5',
        lastMove: { from: 'd8', to: 'd5', captured: 'p', san: 'Qxd5' },
      }),
    ).toBe(true);
  });

  it('is false when lastMove is absent (fallback path)', () => {
    expect(isExactRecapture({ fenBefore: AFTER_QXD5, moveUci: 'e4d5' })).toBe(false);
  });

  it('is false when the move lands on a different square', () => {
    expect(
      isExactRecapture({
        fenBefore: AFTER_QXD5,
        moveUci: 'g1f3',
        lastMove: { from: 'd8', to: 'd5', captured: 'p' },
      }),
    ).toBe(false);
  });

  it('is false for a non-capture onto an unrelated square even if UCI matches a quiet lastMove.to', () => {
    // d2d4 lands on d4; a (fabricated) lastMove.to of d4 must not count —
    // d4 is empty, so nothing is captured.
    expect(
      isExactRecapture({
        fenBefore: AFTER_QXD5,
        moveUci: 'd2d4',
        lastMove: { from: 'd7', to: 'd4' },
      }),
    ).toBe(false);
  });
});

describe('no Great on a pure recapture (exact lastMove path)', () => {
  it('exd5 recapturing the queen is Best, not Great, when lastMove is supplied', () => {
    const input = queenRecaptureInput({
      lastMove: { from: 'd8', to: 'd5', captured: 'p', san: 'Qxd5' },
    });
    expect(classifyMove(input)).toBe('best');
    expect(blockedLabelReason(input)).toBe('trivial_recapture_blocked');
  });

  it('the SAME capture is Great when it is fresh (lastMove was a knight move, queen already stood on d5)', () => {
    const input = queenRecaptureInput({
      lastMove: { from: 'g8', to: 'f6', san: 'Nf6' },
    });
    // Not a recapture of the last move at all: winning the queen with the
    // only good move is a genuine Great.
    expect(classifyMove(input)).toBe('great');
  });

  it('the FEN-only fallback also blocks Great for this recapture shape (documented approximation)', () => {
    // No lastMove: the approximation sees a capture of >= the moved
    // piece's value with no check and treats it as trivial. It agrees
    // here, but cannot distinguish the fresh-capture case above.
    expect(classifyMove(queenRecaptureInput({}))).toBe('best');
  });
});

// Bishop on d4, black pawn just captured a knight on e5 (…dxe5), black
// rook on e8 covers the e-file: Bxe5 "sacrifices" the bishop to the rook.
const BISHOP_RECAP_FEN = '4r1k1/8/8/4p3/3B4/8/8/6K1 w - - 0 1';
const BISHOP_RECAP_PV = ['d4e5', 'e8e5'];

function bishopRecapInput(overrides: Partial<ClassifyInput>): ClassifyInput {
  return {
    fenBefore: BISHOP_RECAP_FEN,
    moveUci: 'd4e5',
    legalMoveCount: 25,
    isBookMove: false,
    linesBefore: [line(1, 50, BISHOP_RECAP_PV), line(2, 40, ['d4c5']), line(3, 30, ['d4b6'])],
    winProbBefore: 55,
    winProbAfter: 58,
    epl: 0.005,
    brilliantUsedInWindow: 0,
    movesSinceStart: 20,
    ...overrides,
  };
}

describe('a recapture is not a sacrifice (exact lastMove path)', () => {
  it('analyzeSacrifice flags Bxe5 as a sacrifice WITHOUT last-move knowledge', () => {
    // This is exactly the false positive the exact path exists to fix:
    // from the FEN alone, Bxe5 looks like a bishop offered to the rook.
    expect(analyzeSacrifice(BISHOP_RECAP_FEN, 'd4e5', BISHOP_RECAP_PV).isSacrifice).toBe(true);
  });

  it('analyzeSacrifice rejects Bxe5 when told it exactly recaptures the pawn that just captured', () => {
    const res = analyzeSacrifice(BISHOP_RECAP_FEN, 'd4e5', BISHOP_RECAP_PV, {
      lastMove: { from: 'd6', to: 'e5', captured: 'n', san: 'dxe5' },
    });
    expect(res.isSacrifice).toBe(false);
    const flagged = analyzeSacrifice(BISHOP_RECAP_FEN, 'd4e5', BISHOP_RECAP_PV, {
      isExactRecapture: true,
    });
    expect(flagged.isSacrifice).toBe(false);
  });

  it('classifyMove awards Brilliant for Bxe5 without lastMove, but not with it', () => {
    expect(classifyMove(bishopRecapInput({}))).toBe('brilliant');
    const withLast = bishopRecapInput({
      lastMove: { from: 'd6', to: 'e5', captured: 'n', san: 'dxe5' },
    });
    expect(classifyMove(withLast)).toBe('best');
    expect(blockedLabelReason(withLast)).toBe('recapture_not_sacrifice');
    const detailed = classifyMoveDetailed(withLast);
    expect(detailed.classification).toBe('best');
  });

  it('a lastMove that landed elsewhere does not suppress the sacrifice', () => {
    const input = bishopRecapInput({ lastMove: { from: 'g8', to: 'f7', san: 'Kg8-f7' } });
    // lastMove.to (f7) != the capture square (e5): Bxe5 is a fresh
    // capture, judged on its merits — still a sacrifice.
    expect(classifyMove(input)).toBe('brilliant');
  });
});

describe('no Brilliant on promotions (targeted proof)', () => {
  // Pawn on a7 captures the rook on a8 and promotes; the rook on b8 can
  // recapture the new queen — SEE alone might call the pawn "offered",
  // but promotions are excluded from sacrifices by definition.
  const PROMO_FEN = 'rr6/P7/8/8/8/8/8/4K2k w - - 0 1';

  it('analyzeSacrifice never flags a promotion', () => {
    expect(analyzeSacrifice(PROMO_FEN, 'a7a8q', ['a7a8q', 'b8a8']).isSacrifice).toBe(false);
  });

  it('classifyMove does not award Brilliant to a promotion', () => {
    const res = classifyMove({
      fenBefore: PROMO_FEN,
      moveUci: 'a7a8q',
      legalMoveCount: 12,
      isBookMove: false,
      linesBefore: [line(1, 200, ['a7a8q', 'b8a8']), line(2, 0, ['a7b8q'])],
      winProbBefore: 60,
      winProbAfter: 75,
      epl: 0.002,
      brilliantUsedInWindow: 0,
      movesSinceStart: 40,
    });
    expect(res).not.toBe('brilliant');
  });
});
