import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy, volatilityWeights } from '@/analysis/accuracy';

describe('moveAccuracy', () => {
  it('is ~100 (clamped) for a move that loses nothing', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(80, 80)).toBe(100);
  });

  it('rewards improvement the same as holding (diff floors at 0)', () => {
    expect(moveAccuracy(40, 70)).toBe(100);
  });

  it('is small for a catastrophic drop', () => {
    const acc = moveAccuracy(100, 0);
    expect(acc).toBeGreaterThanOrEqual(0);
    expect(acc).toBeLessThanOrEqual(1);
  });

  it('decreases monotonically as the win% drop grows', () => {
    let prev = Infinity;
    for (const after of [50, 45, 40, 30, 20, 10, 0]) {
      const acc = moveAccuracy(50, after);
      expect(acc).toBeLessThan(prev);
      prev = acc;
    }
  });

  it('matches the spec formula at a mid-range drop', () => {
    // diff = 20: 103.1668 * exp(-0.04354*20) - 3.1669 + 1 ≈ 41.07
    const expected = 103.1668 * Math.exp(-0.04354 * 20) - 3.1669 + 1;
    expect(moveAccuracy(70, 50)).toBeCloseTo(expected, 8);
  });
});

describe('volatilityWeights', () => {
  it('returns one weight per move, all at the 0.5 floor for a flat series', () => {
    const weights = volatilityWeights([50, 50, 50, 50, 50, 50, 50, 50], 80);
    expect(weights).toHaveLength(8);
    for (const w of weights) expect(w).toBe(0.5);
  });

  it('clamps wild swings to the 12 ceiling', () => {
    const weights = volatilityWeights([0, 100, 0, 100, 0, 100, 0, 100], 80);
    for (const w of weights) expect(w).toBe(12);
  });

  it('stays inside [0.5, 12] for a realistic series', () => {
    const series = [50, 52, 48, 65, 30, 55, 90, 20, 50, 51, 49, 53];
    const weights = volatilityWeights(series, series.length * 2);
    expect(weights).toHaveLength(series.length);
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(0.5);
      expect(w).toBeLessThanOrEqual(12);
    }
    // The swinging middle of the game must outweigh the calm start.
    expect(Math.max(...weights.slice(3, 8))).toBeGreaterThan(weights[0]);
  });

  it('handles empty and single-move series', () => {
    expect(volatilityWeights([], 0)).toEqual([]);
    expect(volatilityWeights([50], 2)).toEqual([0.5]);
  });
});

describe('gameAccuracy', () => {
  it('returns null for fewer than 6 moves', () => {
    expect(gameAccuracy([], [])).toBeNull();
    expect(gameAccuracy([100, 100, 100, 100, 100], [1, 1, 1, 1, 1])).toBeNull();
  });

  it('averages the weighted arithmetic and harmonic means (equal weights)', () => {
    const accuracies = [100, 90, 80, 70, 60, 50];
    const weights = [1, 1, 1, 1, 1, 1];
    // Hand-computed: arithmetic mean = 75.
    // Harmonic mean = 6 / (1/100 + 1/90 + 1/80 + 1/70 + 1/60 + 1/50) ≈ 70.9535.
    // Game accuracy = (75 + 70.9535) / 2 ≈ 72.9767.
    const result = gameAccuracy(accuracies, weights);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(72.9767, 3);
  });

  it('respects volatility weights in the arithmetic mean only (Lichess blend)', () => {
    // Prompt 5 correction: Lichess's game accuracy blends a
    // volatility-WEIGHTED arithmetic mean with an UNWEIGHTED harmonic
    // mean (lila AccuracyPercent.gameAccuracy + scalalib
    // Maths.harmonicMean). The previous version of this test asserted
    // a weighted harmonic mean (17 / 12.05 ≈ 1.41 → game ≈ 15.41);
    // that aggregation is ≈7 points below Lichess on real games
    // (validation: tests/fixtures/lichess-reference/), because
    // blunders cluster in volatile windows and weighting the harmonic
    // mean punishes them twice.
    const accuracies = [100, 100, 100, 100, 100, 0];
    const weights = [1, 1, 1, 1, 1, 12];
    // Weighted arithmetic = (500 + 0) / 17 ≈ 29.41 (weights sum 17).
    // Unweighted harmonic = 6 / (5 * (1/100) + 1 / max(0,1)) = 6 / 1.05 ≈ 5.71.
    // Average ≈ 17.56: the heavily weighted blunder still drags the
    // score down through the arithmetic mean.
    const result = gameAccuracy(accuracies, weights) as number;
    expect(result).toBeCloseTo((500 / 17 + 6 / 1.05) / 2, 2);
    expect(result).toBeLessThan(30);
  });

  it('is 100 for a perfect game and guards a zero with the epsilon floor', () => {
    expect(gameAccuracy([100, 100, 100, 100, 100, 100], [1, 1, 1, 1, 1, 1])).toBe(100);
    const withZero = gameAccuracy([100, 100, 100, 100, 100, 0], [1, 1, 1, 1, 1, 1]);
    expect(withZero).not.toBeNull();
    expect(withZero as number).toBeGreaterThan(0); // floored at 1 in harmonic mean
  });
});

// --- Task-spec exact anchors (independently computed) ---------------------

describe('accuracy task-spec anchors', () => {
  it('moveAccuracy(100, 90): a 10-point win% drop scores ≈ 64.66 (±0.5)', () => {
    // 103.1668 * exp(-0.04354 * 10) - 3.1669 + 1 = 64.5826 (independent calc).
    const acc = moveAccuracy(100, 90);
    expect(Math.abs(acc - 64.66)).toBeLessThan(0.5);
    expect(acc).toBeCloseTo(64.5826, 2);
  });

  it('moveAccuracy is never below 0', () => {
    for (const before of [0, 25, 50, 75, 100]) {
      for (const after of [0, 10, 50, 100]) {
        expect(moveAccuracy(before, after)).toBeGreaterThanOrEqual(0);
        expect(moveAccuracy(before, after)).toBeLessThanOrEqual(100);
      }
    }
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it('gameAccuracy of six perfect moves is exactly 100', () => {
    expect(gameAccuracy([100, 100, 100, 100, 100, 100], [1, 2, 3, 1, 2, 3])).toBe(100);
  });

  it('volatilityWeights: one weight per move, all inside [0.5, 12]', () => {
    const series = [50, 61, 42, 78, 33, 55, 90];
    const weights = volatilityWeights(series, 40);
    expect(weights).toHaveLength(series.length);
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(0.5);
      expect(w).toBeLessThanOrEqual(12);
    }
  });
});
