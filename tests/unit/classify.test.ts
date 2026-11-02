import { describe, expect, it } from 'vitest';
import { classifyMove, computeEpl, type ClassifyInput } from '@/analysis/classify';
import type { EngineLine } from '@/lib/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const GREEK_GIFT = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';

function line(multipv: number, scoreCp: number, pv: string[]): EngineLine {
  return { multipv, depth: 18, scoreCp, pv };
}

function baseInput(overrides: Partial<ClassifyInput>): ClassifyInput {
  return {
    fenBefore: START,
    moveUci: 'e2e4',
    legalMoveCount: 20,
    isBookMove: false,
    linesBefore: [line(1, 20, ['d2d4']), line(2, 10, ['e2e4'])],
    winProbBefore: 52,
    winProbAfter: 52,
    epl: 0.01,
    brilliantUsedInWindow: 0,
    movesSinceStart: 0,
    ...overrides,
  };
}

describe('classifyMove decision order', () => {
  it('forced: only one legal move wins over everything', () => {
    expect(classifyMove(baseInput({ legalMoveCount: 1, isBookMove: true, epl: 0.5 }))).toBe(
      'forced',
    );
  });

  it('book: a book move is book even with a large EPL', () => {
    expect(classifyMove(baseInput({ isBookMove: true, epl: 0.4 }))).toBe('book');
  });

  it('brilliant: Greek Gift Bxh7+ with engine approval', () => {
    const input = baseInput({
      fenBefore: GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 35,
      linesBefore: [
        line(1, 150, ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5']),
        line(2, 40, ['f3e5']),
        line(3, 0, ['c1g5']),
      ],
      winProbBefore: 63,
      winProbAfter: 80,
      epl: 0.005,
      movesSinceStart: 20,
    });
    expect(classifyMove(input)).toBe('brilliant');
  });

  it('not brilliant when the position is already winning (winProbBefore 97)', () => {
    const input = baseInput({
      fenBefore: GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 35,
      linesBefore: [
        line(1, 150, ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5']),
        line(2, 40, ['f3e5']),
        line(3, 0, ['e4e5']),
      ],
      winProbBefore: 97,
      winProbAfter: 98,
      epl: 0.005,
      movesSinceStart: 20,
    });
    expect(classifyMove(input)).not.toBe('brilliant');
    expect(classifyMove(input)).toBe('best'); // still the engine's top move
  });

  it('not brilliant when the soft cap for the window is used up', () => {
    const input = baseInput({
      fenBefore: GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 35,
      linesBefore: [line(1, 150, ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5']), line(2, 40, ['f3e5'])],
      winProbBefore: 63,
      winProbAfter: 80,
      epl: 0.005,
      brilliantUsedInWindow: 1,
      movesSinceStart: 20,
    });
    expect(classifyMove(input)).not.toBe('brilliant');
  });

  it('great: engine best and the only move that holds (2nd line far worse)', () => {
    const input = baseInput({
      moveUci: 'e2e4',
      linesBefore: [line(1, 100, ['e2e4']), line(2, -100, ['d2d4'])],
      winProbBefore: 59,
      winProbAfter: 62,
      epl: 0,
    });
    expect(classifyMove(input)).toBe('great');
  });

  it('great is skipped in a decided position; best applies instead', () => {
    const input = baseInput({
      moveUci: 'e2e4',
      linesBefore: [line(1, 100, ['e2e4']), line(2, -100, ['d2d4'])],
      winProbBefore: 97,
      winProbAfter: 98,
      epl: 0,
    });
    expect(classifyMove(input)).toBe('best');
  });
});

describe('classifyMove EPL thresholds', () => {
  it('best when the played move is the engine best, regardless of small EPL', () => {
    const input = baseInput({
      moveUci: 'd2d4',
      linesBefore: [line(1, 20, ['d2d4']), line(2, 10, ['e2e4'])],
      epl: 0.004,
    });
    expect(classifyMove(input)).toBe('best');
  });

  it('best when epl <= 0.005 even if not the listed best line', () => {
    expect(classifyMove(baseInput({ epl: 0.003 }))).toBe('best');
  });

  it('excellent at epl 0.015', () => {
    expect(classifyMove(baseInput({ epl: 0.015 }))).toBe('excellent');
  });

  it('good at epl 0.04', () => {
    expect(classifyMove(baseInput({ epl: 0.04 }))).toBe('good');
  });

  it('inaccuracy at epl 0.08', () => {
    expect(classifyMove(baseInput({ epl: 0.08 }))).toBe('inaccuracy');
  });

  it('mistake at epl 0.15', () => {
    expect(classifyMove(baseInput({ epl: 0.15 }))).toBe('mistake');
  });

  it('blunder at epl 0.30', () => {
    expect(classifyMove(baseInput({ epl: 0.3 }))).toBe('blunder');
  });
});

describe('classifyMove miss post-pass', () => {
  it('miss: opponent blundered, position was winning, reply threw it away', () => {
    const input = baseInput({
      epl: 0.15,
      winProbBefore: 70,
      winProbAfter: 55,
      prevPly: { classification: 'blunder', winProbMoverBefore: 45 },
    });
    expect(classifyMove(input)).toBe('miss');
  });

  it('no miss when the opponent did not just err', () => {
    const input = baseInput({
      epl: 0.15,
      winProbBefore: 70,
      winProbAfter: 55,
      prevPly: { classification: 'good' },
    });
    expect(classifyMove(input)).toBe('mistake');
  });

  it('no miss when the position was not winning enough', () => {
    const input = baseInput({
      epl: 0.15,
      winProbBefore: 60,
      winProbAfter: 55,
      prevPly: { classification: 'mistake' },
    });
    expect(classifyMove(input)).toBe('mistake');
  });

  it('miss never overrides an excellent move', () => {
    const input = baseInput({
      epl: 0.015,
      winProbBefore: 70,
      winProbAfter: 55,
      prevPly: { classification: 'blunder' },
    });
    expect(classifyMove(input)).toBe('excellent');
  });
});

describe('computeEpl', () => {
  it('uses the played line score when the move is among the lines', () => {
    const lines = [line(1, 100, ['e2e4']), line(2, -100, ['d2d4'])];
    // best win% = winProb(100) ≈ 59.11; played (line 2) ≈ 40.89 → EPL ≈ 0.182
    expect(computeEpl(lines, 'd2d4', 50)).toBeCloseTo(0.182, 2);
    expect(computeEpl(lines, 'e2e4', 50)).toBe(0);
  });

  it('falls back to the next-position win% for moves outside the lines', () => {
    const lines = [line(1, 100, ['e2e4'])];
    expect(computeEpl(lines, 'g1f3', 40.89)).toBeCloseTo(0.182, 2);
  });

  it('is 0 with no lines', () => {
    expect(computeEpl([], 'e2e4', 30)).toBe(0);
  });
});

// --- Task-spec fixtures ------------------------------------------------------

// NOTE on the FEN: the task's original Greek-Gift FEN places the white pawn
// on e4 ("4P3" on rank 4), where it sits on the Bd3-h7 diagonal and makes
// Bxh7+ illegal, so no implementation of the spec could call it brilliant.
// The pawn is placed on d4 here (as in the sacrifice fixture), which keeps
// the Greek Gift legal; scores, PV, win-probs and EPL are the task's values.
const SPEC_GREEK_GIFT = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';
const SPEC_GREEK_LINES = [
  line(1, 130, ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5']),
  line(2, 60, ['f3g5']),
  line(3, 40, ['c2c3']),
];

describe('classifyMove task-spec fixtures', () => {
  it('brilliant: the Greek Gift Bxh7+ (winProb 62 → 78, epl 0.004)', () => {
    const input = baseInput({
      fenBefore: SPEC_GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 30,
      linesBefore: SPEC_GREEK_LINES,
      winProbBefore: 62,
      winProbAfter: 78,
      epl: 0.004,
    });
    expect(classifyMove(input)).toBe('brilliant');
  });

  it('brilliant negative: same fixture with winProbBefore 97 is NOT brilliant', () => {
    const input = baseInput({
      fenBefore: SPEC_GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 30,
      linesBefore: SPEC_GREEK_LINES,
      winProbBefore: 97,
      winProbAfter: 98,
      epl: 0.004,
    });
    expect(classifyMove(input)).not.toBe('brilliant');
  });

  it('miss: prev ply blunder, winProbBefore 72, epl 0.16, winProbAfter 52', () => {
    const input = baseInput({
      epl: 0.16,
      winProbBefore: 72,
      winProbAfter: 52,
      prevPly: { classification: 'blunder' },
    });
    expect(classifyMove(input)).toBe('miss');
  });

  it('great: only move — best cp 20, second line cp -260 (EPL gap ≈ 0.241 > 0.10)', () => {
    const input = baseInput({
      moveUci: 'e2e4',
      linesBefore: [line(1, 20, ['e2e4']), line(2, -260, ['d2d4'])],
      winProbBefore: 48,
      winProbAfter: 55,
      epl: 0,
    });
    expect(classifyMove(input)).toBe('great');
  });

  it('great negative: a decided position (winProbBefore 97) is not great', () => {
    const input = baseInput({
      moveUci: 'e2e4',
      linesBefore: [line(1, 20, ['e2e4']), line(2, -260, ['d2d4'])],
      winProbBefore: 97,
      winProbAfter: 98,
      epl: 0,
    });
    expect(classifyMove(input)).not.toBe('great');
    expect(classifyMove(input)).toBe('best');
  });

  it('forced: one legal move classifies forced even with a huge EPL', () => {
    expect(classifyMove(baseInput({ legalMoveCount: 1, epl: 0.9 }))).toBe('forced');
  });

  it('blunder at the task EPL of 0.35', () => {
    expect(classifyMove(baseInput({ epl: 0.35 }))).toBe('blunder');
  });
});
