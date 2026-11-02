import { describe, expect, it } from 'vitest';
import {
  expectedPointsLoss,
  scoreToWhiteCp,
  winProb,
  winProbForScore,
} from '@/analysis/winProbability';
import { MATE_CP, WIN_PROB_K } from '@/lib/constants';

describe('winProb', () => {
  it('is 50 at 0cp', () => {
    expect(winProb(0)).toBeCloseTo(50, 10);
  });

  it('matches the logistic at +100cp (≈59.1)', () => {
    // Independent form of the same logistic: 100 / (1 + e^(-K*cp)).
    const expected = 100 / (1 + Math.exp(-WIN_PROB_K * 100));
    expect(winProb(100)).toBeCloseTo(expected, 10);
    expect(winProb(100)).toBeCloseTo(59.1, 1);
  });

  it('is symmetric: winProb(-x) = 100 - winProb(x)', () => {
    for (const cp of [1, 37, 100, 250, 900]) {
      expect(winProb(-cp)).toBeCloseTo(100 - winProb(cp), 8);
    }
  });

  it('approaches 100 / 0 for extreme scores', () => {
    expect(winProb(100000)).toBeCloseTo(100, 6);
    expect(winProb(-100000)).toBeCloseTo(0, 6);
    expect(winProb(Infinity)).toBe(100);
    expect(winProb(-Infinity)).toBe(0);
  });

  it('is monotonic in cp', () => {
    let prev = -Infinity;
    for (let cp = -500; cp <= 500; cp += 25) {
      expect(winProb(cp)).toBeGreaterThan(prev);
      prev = winProb(cp);
    }
  });
});

describe('winProbForScore', () => {
  it('uses the cp logistic when no mate is present', () => {
    expect(winProbForScore(100, undefined)).toBeCloseTo(winProb(100), 10);
    expect(winProbForScore(0, undefined)).toBeCloseTo(50, 10);
  });

  it('maps mate scores to certainties from the mover perspective', () => {
    expect(winProbForScore(undefined, 4)).toBe(100);
    expect(winProbForScore(undefined, 1)).toBe(100);
    expect(winProbForScore(undefined, -3)).toBe(0);
    expect(winProbForScore(500, -2)).toBe(0); // mate overrides cp
    expect(winProbForScore(undefined, 0)).toBe(0); // side to move is mated
  });

  it('defaults to 50 with no score at all', () => {
    expect(winProbForScore(undefined, undefined)).toBe(50);
  });
});

describe('scoreToWhiteCp', () => {
  it('keeps White-to-move cp scores unchanged and flips Black-to-move', () => {
    expect(scoreToWhiteCp(150, undefined, 'w')).toEqual({ evalWhiteCp: 150 });
    expect(scoreToWhiteCp(150, undefined, 'b')).toEqual({ evalWhiteCp: -150 });
    expect(scoreToWhiteCp(-80, undefined, 'b')).toEqual({ evalWhiteCp: 80 });
  });

  it('encodes mates as ±(MATE_CP - |mate|) from White perspective', () => {
    expect(scoreToWhiteCp(undefined, 4, 'w')).toEqual({
      evalWhiteCp: MATE_CP - 4,
      mate: 4,
    });
    // Black to move mates in 3 → White is mated in 3.
    expect(scoreToWhiteCp(undefined, 3, 'b')).toEqual({
      evalWhiteCp: -(MATE_CP - 3),
      mate: -3,
    });
    // White to move is getting mated in 2.
    expect(scoreToWhiteCp(undefined, -2, 'w')).toEqual({
      evalWhiteCp: -(MATE_CP - 2),
      mate: -2,
    });
    // Black to move is getting mated in 5 → White mates in 5.
    expect(scoreToWhiteCp(undefined, -5, 'b')).toEqual({
      evalWhiteCp: MATE_CP - 5,
      mate: 5,
    });
  });

  it('returns 0 with no score', () => {
    expect(scoreToWhiteCp(undefined, undefined, 'w')).toEqual({ evalWhiteCp: 0 });
  });
});

describe('expectedPointsLoss', () => {
  it('is the win% drop as a fraction', () => {
    expect(expectedPointsLoss(60, 45)).toBeCloseTo(0.15, 10);
    expect(expectedPointsLoss(50, 50)).toBe(0);
  });

  it('never goes negative or above 1', () => {
    expect(expectedPointsLoss(40, 90)).toBe(0);
    expect(expectedPointsLoss(100, 0)).toBe(1);
  });
});

// --- Task-spec exact anchors (independently computed) ---------------------

describe('winProb task-spec anchors', () => {
  it('winProb(0) is exactly 50', () => {
    expect(winProb(0)).toBe(50);
  });

  it('winProb(100) ≈ 59.11 for K = 0.00368208', () => {
    // 50 + 50 * (2 / (1 + e^-0.368208) - 1) = 59.1026 (computed independently).
    expect(Math.abs(winProb(100) - 59.11)).toBeLessThan(0.02);
    expect(winProb(100)).toBeCloseTo(59.1026, 3);
  });

  it('is symmetric for x in {50, 200, 500}', () => {
    for (const x of [50, 200, 500]) {
      expect(winProb(-x)).toBeCloseTo(100 - winProb(x), 8);
    }
  });

  it('winProb(10000) exceeds 99.9 (and the mirror is below 0.1)', () => {
    expect(winProb(10000)).toBeGreaterThan(99.9);
    expect(winProb(-10000)).toBeLessThan(0.1);
  });
});

describe('scoreToWhiteCp task-spec cases', () => {
  it('a cp score flips sign when Black is to move', () => {
    expect(scoreToWhiteCp(200, undefined, 'b').evalWhiteCp).toBe(-200);
    expect(scoreToWhiteCp(-200, undefined, 'b').evalWhiteCp).toBe(200);
    expect(scoreToWhiteCp(200, undefined, 'w').evalWhiteCp).toBe(200);
  });

  it('mate encoding is ±(100000 - |mate|) from White\u2019s perspective', () => {
    expect(scoreToWhiteCp(undefined, 5, 'w')).toEqual({
      evalWhiteCp: 100000 - 5,
      mate: 5,
    });
    // Black to move mates in 5 → White is mated in 5.
    expect(scoreToWhiteCp(undefined, 5, 'b')).toEqual({
      evalWhiteCp: -(100000 - 5),
      mate: -5,
    });
    expect(MATE_CP).toBe(100000);
  });
});
