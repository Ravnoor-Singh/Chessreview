import { describe, expect, it } from 'vitest';
import { analyzeSacrifice, see, seeForMove } from '@/analysis/sacrifice';

describe('pin-aware SEE (Prompt 4)', () => {
  // Black bishop b7 "defends" the d5 pawn along the diagonal, but the
  // bishop is absolutely pinned to the b8 king by the white rook on b1:
  // it cannot capture on d5 without exposing the king.
  const PINNED = '1k6/1b6/8/R2p4/8/8/8/1R2K3 w - - 0 1';
  const UNPINNED = '1k6/1b6/8/R2p4/8/8/8/4K3 w - - 0 1';

  it('a pinned defender does not count: Rxd5 simply wins the pawn', () => {
    expect(see(PINNED, 'd5')).toBe(1);
  });

  it('the same position without the pinning rook loses the exchange sequence', () => {
    // Rxd5 Bxd5: +1 pawn, -5 rook => -4.
    expect(see(UNPINNED, 'd5')).toBe(-4);
  });

  it('a pinned piece cannot START a capture sequence (chess.js legality)', () => {
    // Bishop e2 is pinned to the e1 king by the e8 rook; Bxd3 is illegal.
    const fen = '4r2k/8/8/8/8/3p4/4B3/4K3 w - - 0 1';
    expect(seeForMove(fen, 'e2d3')).toBe(0);
    // Unpinned version (rook on a8): the bishop wins the pawn cleanly.
    const free = 'r6k/8/8/8/8/3p4/4B3/4K3 w - - 0 1';
    expect(seeForMove(free, 'e2d3')).toBe(1);
  });
});

describe('x-ray / discovered attackers in SEE', () => {
  it('a queen behind a rook joins the sequence once the rook is captured (x-ray)', () => {
    // Rxd5 Bxd5 Qxd5: wins pawn + bishop (4), loses rook (5) => -1.
    const withQueen = '4k3/8/4b3/3p4/8/8/3R4/3QK3 w - - 0 1';
    expect(see(withQueen, 'd5')).toBe(-1);
    // Without the queen behind it, the rook is simply lost: -4.
    const noQueen = '4k3/8/4b3/3p4/8/8/3R4/4K3 w - - 0 1';
    expect(see(noQueen, 'd5')).toBe(-4);
  });
});

describe('king-capture rule in SEE', () => {
  it('a king cannot recapture into a defended square (x-ray rook behind the queen)', () => {
    // Qxd5 or Rxd5 wins the pawn: the e6 king may not recapture because
    // the other heavy piece covers d5 along the d-file.
    const fen = '8/8/4k3/3p4/8/3Q4/8/3RK3 w - - 0 1';
    expect(see(fen, 'd5')).toBe(1);
  });

  it('a king CAN recapture when the square is truly undefended after the capture', () => {
    // Qxd5 Kxd5: +1 pawn, -9 queen => -8.
    const fen = '8/8/4k3/3p4/8/8/8/3QK3 w - - 0 1';
    expect(see(fen, 'd5')).toBe(-8);
  });
});

describe('promotion handling in SEE', () => {
  it('a promoting capture credits the promotion bonus and prices the new queen', () => {
    // a7xb8=Q captures a rook (+5), promotes (+8 bonus), then the a8
    // rook recaptures the queen (9): net +4.
    const fen = 'rr5k/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(seeForMove(fen, 'a7b8q')).toBe(4);
  });

  it('a quiet promotion that is immediately recaptured loses just the pawn', () => {
    // a8=Q Rxa8: the pawn is gone, nothing was captured => -1.
    const fen = '1r5k/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(seeForMove(fen, 'a7a8q')).toBe(-1);
  });
});

describe('en passant in SEE', () => {
  // White pawn e5, black pawn just double-pushed to d5 (ep square d6),
  // black rook on d8 covers the d-file: exd6 e.p. Rxd6 is an even trade.
  const EP_FEN = '3r2k1/8/8/3pP3/8/8/8/6K1 w - d6 0 1';

  it('seeForMove prices en passant as capturing the pawn beside the target', () => {
    expect(seeForMove(EP_FEN, 'e5d6')).toBe(0);
  });

  it('see() on the en-passant square agrees', () => {
    expect(see(EP_FEN, 'd6')).toBe(0);
  });

  it('en passant wins a pawn when the ep pawn is undefended', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    expect(seeForMove(fen, 'e5d6')).toBe(1);
  });
});

describe('PV material evaluation over 4 plies (analyzeSacrifice)', () => {
  // Bishop c4 can take the d5 pawn; the d8 rook recaptures the bishop,
  // but the a5 rook recaptures the rook inside the window.
  const FEN = '3rk3/8/8/R2p4/2B5/8/8/4K3 w - - 0 1';

  it('a piece regained inside the 4-ply window is NOT a sacrifice', () => {
    const res = analyzeSacrifice(FEN, 'c4d5', ['c4d5', 'd8d5', 'a5d5']);
    expect(res.isSacrifice).toBe(false);
    expect(res.pvMaterialDelta).toBe(3);
  });

  it('the same capture with the regain cut from the PV IS judged on the window that remains', () => {
    // PV stops after the rook recaptures the bishop: the mover ends the
    // (shorter) window 2 points down with the piece captured.
    const res = analyzeSacrifice(FEN, 'c4d5', ['c4d5', 'd8d5']);
    expect(res.isSacrifice).toBe(true);
  });

  it('a queen sacrifice is classified as kind=queen', () => {
    // Qxh7+ Kxh7: the queen is given for a pawn.
    const fen = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3Q1N2/PPP2PPP/RNB2RK1 w - - 0 1';
    const res = analyzeSacrifice(fen, 'd3h7', ['d3h7', 'g8h7', 'f3g5']);
    expect(res.isSacrifice).toBe(true);
    expect(res.kind).toBe('queen');
  });

  it('a rook-for-minor sacrifice is classified as kind=exchange', () => {
    // Rxbishop on d5, recaptured by the c6 pawn: rook for bishop.
    const fen = '4k3/8/2p5/R2b4/8/8/8/4K3 w - - 0 1';
    const res = analyzeSacrifice(fen, 'a5d5', ['a5d5', 'c6d5']);
    expect(res.isSacrifice).toBe(true);
    expect(res.isExchangeSac).toBe(true);
    expect(res.kind).toBe('exchange');
  });

  it('a sacrifice leading to forced mate inside the window is kind=mate', () => {
    // Rxh7+ Kxh7 Qh5#: rook given for a pawn, mate on the mover's next move.
    const fen = '7k/6pp/8/8/2B5/8/8/3QK2R w - - 0 1';
    const res = analyzeSacrifice(fen, 'h1h7', ['h1h7', 'h8h7', 'd1h5']);
    expect(res.isSacrifice).toBe(true);
    expect(res.kind).toBe('mate');
  });

  it('a pawn gambit alone is not a sacrifice (no piece offered)', () => {
    // e4-e5 offers a pawn to the d6 pawn / f6 knight — pawns do not count.
    const fen = 'rnbqkb1r/ppp1pppp/3p1n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    expect(analyzeSacrifice(fen, 'e4e5', ['e4e5', 'd6e5']).isSacrifice).toBe(false);
  });

  it('an equal trade is not a sacrifice', () => {
    // Knight takes knight on an even square (SEE 0, equal values).
    const fen = '4k3/8/8/4n3/8/5N2/8/4K3 w - - 0 1';
    expect(analyzeSacrifice(fen, 'f3e5', ['f3e5', 'e8e7']).isSacrifice).toBe(false);
  });
});
