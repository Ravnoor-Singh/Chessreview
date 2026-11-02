import { describe, expect, it } from 'vitest';
import { classifyMove, classifyMoveDetailed, type ClassifyInput } from '@/analysis/classify';
import {
  BRILLIANT,
  CLASSIFICATION_PROFILES,
  EPL_THRESHOLDS,
  GREAT,
  MISS,
  resolveClassificationProfile,
} from '@/lib/constants';
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

const CLASS_RANK: Record<string, number> = {
  brilliant: 0,
  great: 1,
  best: 2,
  excellent: 3,
  good: 4,
  book: 5,
  inaccuracy: 6,
  mistake: 7,
  miss: 8,
  blunder: 9,
  forced: 10,
};

describe('CLASSIFICATION_PROFILE (Prompt 4)', () => {
  it('balanced reproduces the historical constants exactly', () => {
    const b = CLASSIFICATION_PROFILES.balanced;
    expect(b.epl).toEqual(EPL_THRESHOLDS);
    expect(b.brilliant.maxEpl).toBe(BRILLIANT.maxEpl);
    expect(b.brilliant.softCapPerTenMoves).toBe(BRILLIANT.softCapPerTenMoves);
    expect(b.great.onlyMoveGapEpl).toBe(GREAT.onlyMoveGapEpl);
    expect(b.miss).toEqual(MISS);
  });

  it('has strict, balanced and generous variants with ordered EPL bands', () => {
    const { strict, balanced, generous } = CLASSIFICATION_PROFILES;
    for (const key of ['best', 'excellent', 'good', 'inaccuracy', 'mistake'] as const) {
      expect(strict.epl[key]).toBeLessThanOrEqual(balanced.epl[key]);
      expect(balanced.epl[key]).toBeLessThanOrEqual(generous.epl[key]);
    }
    expect(strict.brilliant.maxEpl).toBeLessThan(balanced.brilliant.maxEpl);
    expect(generous.brilliant.softCapPerTenMoves).toBeGreaterThan(
      balanced.brilliant.softCapPerTenMoves,
    );
    expect(strict.great.onlyMoveGapEpl).toBeGreaterThan(balanced.great.onlyMoveGapEpl);
    expect(generous.great.onlyMoveGapEpl).toBeLessThan(balanced.great.onlyMoveGapEpl);
  });

  it('resolveClassificationProfile handles name, object and undefined', () => {
    expect(resolveClassificationProfile(undefined).name).toBe('balanced');
    expect(resolveClassificationProfile('strict').name).toBe('strict');
    expect(resolveClassificationProfile(CLASSIFICATION_PROFILES.generous).name).toBe('generous');
  });

  it('the same EPL is judged more harshly by strict than by generous', () => {
    const at = (profile: 'strict' | 'balanced' | 'generous', epl: number) =>
      classifyMove(baseInput({ epl, profile }));
    // epl 0.008: strict excellent, balanced excellent, generous best.
    expect(CLASS_RANK[at('strict', 0.008)]).toBeGreaterThanOrEqual(
      CLASS_RANK[at('balanced', 0.008)],
    );
    expect(CLASS_RANK[at('balanced', 0.008)]).toBeGreaterThanOrEqual(
      CLASS_RANK[at('generous', 0.008)],
    );
    expect(at('generous', 0.008)).toBe('best');
    // epl 0.12: strict mistake, balanced mistake, generous inaccuracy.
    expect(at('strict', 0.12)).toBe('mistake');
    expect(at('generous', 0.12)).toBe('inaccuracy');
  });

  it('strict rejects a brilliant that balanced accepts (maxEpl 0.01 vs 0.02)', () => {
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
      epl: 0.015,
    });
    expect(classifyMove({ ...input, profile: 'balanced' })).toBe('brilliant');
    expect(classifyMove({ ...input, profile: 'strict' })).not.toBe('brilliant');
  });

  it('generous allows a second brilliant inside the soft-cap window; balanced does not', () => {
    const input = baseInput({
      fenBefore: GREEK_GIFT,
      moveUci: 'd3h7',
      legalMoveCount: 35,
      linesBefore: [line(1, 150, ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5']), line(2, 40, ['f3e5'])],
      winProbBefore: 63,
      winProbAfter: 80,
      epl: 0.005,
      brilliantUsedInWindow: 1,
    });
    expect(classifyMove({ ...input, profile: 'balanced' })).not.toBe('brilliant');
    expect(classifyMove({ ...input, profile: 'generous' })).toBe('brilliant');
  });

  it('generous awards Great for a smaller only-move gap than balanced requires', () => {
    // Best cp 20 vs second cp -60: only-move gap EPL ≈ 0.083 — above the
    // generous gap (0.06), below the balanced gap (0.10).
    const input = baseInput({
      moveUci: 'e2e4',
      linesBefore: [line(1, 20, ['e2e4']), line(2, -60, ['d2d4'])],
      winProbBefore: 52,
      winProbAfter: 53,
      epl: 0,
    });
    expect(classifyMove({ ...input, profile: 'generous' })).toBe('great');
    expect(classifyMove({ ...input, profile: 'balanced' })).toBe('best');
    expect(classifyMove({ ...input, profile: 'strict' })).toBe('best');
  });
});

describe('classifyMoveDetailed reasons (Prompt 4)', () => {
  it('forced and book carry their own reasons', () => {
    expect(classifyMoveDetailed(baseInput({ legalMoveCount: 1 })).reason).toBe('forced');
    expect(classifyMoveDetailed(baseInput({ isBookMove: true })).reason).toBe('book');
  });

  it('a band classification reports epl_threshold; the engine best reports best_move', () => {
    expect(classifyMoveDetailed(baseInput({ epl: 0.3 })).reason).toBe('epl_threshold');
    expect(classifyMoveDetailed(baseInput({ epl: 0.3 })).classification).toBe('blunder');
    const best = classifyMoveDetailed(baseInput({ moveUci: 'd2d4', epl: 0 }));
    expect(best.classification).toBe('best');
    expect(best.reason).toBe('best_move');
  });

  it('a miss reports missed_tactic', () => {
    const res = classifyMoveDetailed(
      baseInput({
        epl: 0.16,
        winProbBefore: 72,
        winProbAfter: 52,
        prevPly: { classification: 'blunder' },
      }),
    );
    expect(res.classification).toBe('miss');
    expect(res.reason).toBe('missed_tactic');
  });

  it('an only-move Great reports only_move', () => {
    const res = classifyMoveDetailed(
      baseInput({
        moveUci: 'e2e4',
        linesBefore: [line(1, 20, ['e2e4']), line(2, -260, ['d2d4'])],
        winProbBefore: 48,
        winProbAfter: 52,
        epl: 0,
      }),
    );
    expect(res.classification).toBe('great');
    expect(res.reason).toBe('only_move');
  });

  it('a mate-line Great reports mate_threat', () => {
    const mateLine: EngineLine = { multipv: 1, depth: 18, scoreMate: 3, pv: ['e2e4'] };
    const res = classifyMoveDetailed(
      baseInput({
        moveUci: 'e2e4',
        linesBefore: [mateLine, line(2, 900, ['d2d4'])],
        winProbBefore: 60,
        winProbAfter: 100,
        epl: 0,
      }),
    );
    expect(res.classification).toBe('great');
    expect(res.reason).toBe('mate_threat');
  });

  it('the Greek Gift reports a sacrifice reason', () => {
    const res = classifyMoveDetailed(
      baseInput({
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
      }),
    );
    expect(res.classification).toBe('brilliant');
    expect(res.reason).toBe('sacrifice_piece');
    expect(res.sacrifice?.isSacrifice).toBe(true);
  });

  it('classifyMove always delegates to classifyMoveDetailed', () => {
    const cases: Partial<ClassifyInput>[] = [
      { epl: 0 },
      { epl: 0.04 },
      { epl: 0.09 },
      { epl: 0.5 },
      { legalMoveCount: 1 },
      { isBookMove: true },
    ];
    for (const c of cases) {
      const input = baseInput(c);
      expect(classifyMove(input)).toBe(classifyMoveDetailed(input).classification);
    }
  });
});
