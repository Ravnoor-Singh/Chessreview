import { describe, expect, it } from 'vitest';
import { analyzeSacrifice, see, seeForMove } from '@/analysis/sacrifice';

// The classic Greek Gift position: Bd3 (its diagonal to h7 clear), Nf3, Qd1
// vs a castled king with the h7 pawn guarded only by the king.
// Bxh7+ Kxh7 Ng5+ follows.
const GREEK_GIFT = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';
const GREEK_GIFT_PV = ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5'];

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('see', () => {
  it('wins a free pawn: exd5 when d5 is undefended', () => {
    // Bare position: the d5 pawn has no defender, so exd5 nets +1.
    const fen = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1';
    expect(see(fen, 'd5')).toBe(1);
  });

  it('is an even trade when the pawn is defended by another pawn', () => {
    // exd5 cxd5: each side loses a pawn → 0.
    const fen = '4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1';
    expect(see(fen, 'd5')).toBe(0);
  });

  it('loses the bishop on h7 in the Greek Gift capture sequence', () => {
    // Bxh7+ Kxh7: +1 for the pawn, -3 for the bishop → -2.
    expect(see(GREEK_GIFT, 'h7')).toBe(-2);
    expect(seeForMove(GREEK_GIFT, 'd3h7')).toBe(-2);
  });

  it('is 0 when the side to move has no attacker on the square', () => {
    expect(see(START, 'e4')).toBe(0);
    expect(see(START, 'd5')).toBe(0);
  });

  it('sees through a defended queen capture', () => {
    // Qxd5?? exd5 would follow — queen for a pawn is deeply negative.
    // Position: black pawn d5 defended by the e6 pawn; White queen on d1.
    // NOTE (Prompt 4): the original fixture FEN had White's d2 pawn still
    // on d2, which blocks Qd1-d5 entirely — the move was never legal, a
    // fact the old legality-free SEE could not notice. The d2 pawn is
    // removed here so the intended capture is genuinely playable; the
    // assertion is unchanged.
    const fen = 'rnbqkbnr/ppp2ppp/4p3/3p4/4P3/8/PPP2PPP/RNBQKBNR w KQkq - 0 1';
    expect(seeForMove(fen, 'd1d5')).toBeLessThan(0);
  });
});

describe('analyzeSacrifice', () => {
  it('flags the Greek Gift Bxh7+ as a sacrifice worth 2 points', () => {
    const result = analyzeSacrifice(GREEK_GIFT, 'd3h7', GREEK_GIFT_PV);
    expect(result.isSacrifice).toBe(true);
    expect(result.value).toBe(2);
    expect(result.isExchangeSac).toBe(false);
  });

  it('does not flag a plain pawn capture (exd5)', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const result = analyzeSacrifice(fen, 'e4d5', ['e4d5']);
    expect(result.isSacrifice).toBe(false);
    expect(result.value).toBe(0);
  });

  it('does not flag a quiet developing move', () => {
    expect(analyzeSacrifice(START, 'g1f3', ['g1f3']).isSacrifice).toBe(false);
    expect(analyzeSacrifice(START, 'e2e4', ['e2e4']).isSacrifice).toBe(false);
  });

  it('does not flag an equal-value capture (rook takes rook)', () => {
    // Rxe1+ captures a piece worth exactly the moved piece: excluded as an
    // equal-value capture before any PV/SEE reasoning.
    const rookFen = '4k3/8/8/8/8/8/4r3/4R2K b - - 0 1';
    const result = analyzeSacrifice(rookFen, 'e2e1', ['e2e1', 'h1h2']);
    expect(result.isSacrifice).toBe(false);
  });

  it('excludes promotions and mate-in-1 moves', () => {
    const promoFen = '8/P7/8/8/8/8/k6K/8 w - - 0 1';
    expect(analyzeSacrifice(promoFen, 'a7a8q', ['a7a8q']).isSacrifice).toBe(false);
    // Qxf7# style mate in one (Scholar's mate pattern), queen is "given up"
    // onto a defended square but it is mate, so never a sacrifice.
    const mateFen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
    expect(analyzeSacrifice(mateFen, 'h5f7', ['h5f7']).isSacrifice).toBe(false);
  });

  it('returns not-a-sacrifice for illegal moves', () => {
    expect(analyzeSacrifice(START, 'e2e5', ['e2e5']).isSacrifice).toBe(false);
    expect(analyzeSacrifice(START, 'a1a8', []).isSacrifice).toBe(false);
  });
});

// --- Task-spec fixtures ------------------------------------------------------

// The task's original Greek-Gift FEN had the white pawn on e4, where it
// blocks the Bd3-h7 diagonal and makes Bxh7+ illegal; the pawn is placed on
// d4 here so the sacrifice is actually playable (same adjustment as the
// classify fixture). Everything else is the task fixture verbatim.
const TASK_GREEK_GIFT = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';

describe('sacrifice task-spec fixtures', () => {
  it('analyzeSacrifice flags the Greek Gift Bxh7+', () => {
    const result = analyzeSacrifice(TASK_GREEK_GIFT, 'd3h7', [
      'd3h7',
      'g8h7',
      'f3g5',
      'h7g8',
      'd1h5',
    ]);
    expect(result.isSacrifice).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(2);
    expect(result.isExchangeSac).toBe(false);
  });

  it('a plain pawn capture e4xd5 (with Qxd5 recapture in the PV) is no sacrifice', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const result = analyzeSacrifice(fen, 'e4d5', ['e4d5', 'd8d5']);
    expect(result.isSacrifice).toBe(false);
  });

  it('SEE on the defended d5 pawn square is not positive for the attacker', () => {
    // exd5 is met by ...Qxd5 (and the e-pawn is also covered), so the
    // exchange sequence cannot win material: SEE comes out at 0.
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w';
    expect(see(fen, 'd5')).toBeLessThanOrEqual(0);
    expect(see(fen, 'd5')).toBe(0);
  });
});
