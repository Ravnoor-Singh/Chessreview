import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { classifyMove } from '@/analysis/classify';
import { analyzeSacrifice } from '@/analysis/sacrifice';
import type { EngineLine } from '@/lib/types';

// Greek Gift: Bd3xh7+ Kxh7 Ng5+ ... — the bishop is genuinely sacrificed.
const GREEK_FEN = 'r1bq1rk1/pppn1ppp/3p4/2b1P3/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 1';
const GREEK_PV = ['d3h7', 'g8h7', 'f3g5', 'h7h8', 'd1h5', 'f8e8', 'h5h7', 'h8g8'];

describe('brilliant detection (Greek Gift fixture)', () => {
  it('analyzeSacrifice flags Bxh7+ as a sacrifice', () => {
    const res = analyzeSacrifice(GREEK_FEN, 'd3h7', GREEK_PV);
    expect(res.isSacrifice).toBe(true);
  });

  it('classifyMove awards brilliant for Bxh7+', () => {
    const chess = new Chess(GREEK_FEN);
    const lines: EngineLine[] = [
      { multipv: 1, depth: 18, scoreCp: 145, pv: GREEK_PV },
      { multipv: 2, depth: 18, scoreCp: 55, pv: ['f3g5', 'c5b6'] },
      { multipv: 3, depth: 18, scoreCp: 30, pv: ['e4e5', 'd6e5'] },
    ];
    const cls = classifyMove({
      fenBefore: GREEK_FEN,
      moveUci: 'd3h7',
      legalMoveCount: chess.moves().length,
      isBookMove: false,
      linesBefore: lines,
      winProbBefore: 60,
      winProbAfter: 76,
      epl: 0.004,
      brilliantUsedInWindow: 0,
      movesSinceStart: 12,
    });
    expect(cls).toBe('brilliant');
  });

  it('does not award brilliant when already completely winning', () => {
    const chess = new Chess(GREEK_FEN);
    const lines: EngineLine[] = [
      { multipv: 1, depth: 18, scoreCp: 900, pv: GREEK_PV },
      { multipv: 2, depth: 18, scoreCp: 700, pv: ['f3g5'] },
      { multipv: 3, depth: 18, scoreCp: 650, pv: ['e4e5'] },
    ];
    const cls = classifyMove({
      fenBefore: GREEK_FEN,
      moveUci: 'd3h7',
      legalMoveCount: chess.moves().length,
      isBookMove: false,
      linesBefore: lines,
      winProbBefore: 97,
      winProbAfter: 98,
      epl: 0.001,
      brilliantUsedInWindow: 0,
      movesSinceStart: 12,
    });
    expect(cls).not.toBe('brilliant');
  });
});

describe('great detection (only-move fixture)', () => {
  it('awards great when the best move is the only one holding the position', () => {
    // Quiet middlegame position; fixture lines: best keeps equality, every
    // alternative collapses (gap >> 0.10 EPL).
    const fen = 'r2q1rk1/ppp1ppbp/2n2np1/8/3P4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 1';
    const chess = new Chess(fen);
    const lines: EngineLine[] = [
      { multipv: 1, depth: 18, scoreCp: 15, pv: ['f1e2', 'f6e4'] },
      { multipv: 2, depth: 18, scoreCp: -320, pv: ['d4d5', 'e7e6'] },
      { multipv: 3, depth: 18, scoreCp: -410, pv: ['c3b5', 'a7a6'] },
    ];
    const cls = classifyMove({
      fenBefore: fen,
      moveUci: 'f1e2',
      legalMoveCount: chess.moves().length,
      isBookMove: false,
      linesBefore: lines,
      winProbBefore: 47,
      winProbAfter: 52,
      epl: 0.002,
      brilliantUsedInWindow: 0,
      movesSinceStart: 16,
    });
    expect(cls).toBe('great');
  });
});
