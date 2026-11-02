import { describe, expect, it } from 'vitest';
import { averageAchievedDepth, medianAchievedDepth } from '@/analysis/depthStats';

describe('achieved-depth statistics (review header honesty)', () => {
  it('averages only searched plies (terminal depth-0 plies excluded)', () => {
    const plies = [{ depth: 14 }, { depth: 18 }, { depth: 0 }, { depth: 16 }];
    expect(averageAchievedDepth(plies)).toBe(16);
  });

  it('returns null when nothing was searched', () => {
    expect(averageAchievedDepth([])).toBeNull();
    expect(averageAchievedDepth([{ depth: 0 }])).toBeNull();
    expect(medianAchievedDepth([])).toBeNull();
  });

  it('median handles odd and even counts', () => {
    expect(medianAchievedDepth([{ depth: 12 }, { depth: 20 }, { depth: 14 }])).toBe(14);
    expect(medianAchievedDepth([{ depth: 12 }, { depth: 20 }])).toBe(16);
  });
});
