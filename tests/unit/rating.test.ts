import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_ESTIMATE_NOTE,
  performanceEstimateNote,
  performanceLabel,
} from '@/analysis/rating';

// Prompt 5: the numeric estimateRating (invented anchors 50%→400 …
// 97%→2500 ± ACPL nudge) was REMOVED — it had no calibration data,
// and when real data was collected (250 Lichess games, 493 player
// samples; tests/fixtures/rating-dataset/) the best (accuracy, ACPL)
// → rating fit left an 80% band of ≈ ±490 Elo, far too wide for a
// number to be honest. These tests pin the qualitative replacement:
// bands from accuracy, demoted by ACPL, monotonic in both inputs, and
// never a number. See README "How accuracy is computed".

const ORDER = ['beginner', 'club', 'strong-club', 'expert', 'master'] as const;
const rank = (label: string | undefined): number => ORDER.indexOf(label as (typeof ORDER)[number]);

describe('performanceEstimateNote (localized tooltip text)', () => {
  it('English matches the legacy constant exactly', () => {
    expect(performanceEstimateNote('en')).toBe(PERFORMANCE_ESTIMATE_NOTE);
    expect(performanceEstimateNote('en')).toBe(
      'Rough single-game band from accuracy and average centipawn loss — not a rating.',
    );
  });

  it('follows the selected locale', () => {
    expect(performanceEstimateNote('hi')).toBe(
      'सटीकता और औसत सेंटिपawn हानि से मोटा एकल-गेम अनुमान — यह रेटिंग नहीं है।',
    );
    expect(performanceEstimateNote('pa')).toBe(
      'ਸ਼ੁੱਧਤਾ ਅਤੇ ਔਸਤ ਸੈਂਟੀਪਾਓਨ ਨੁਕਸਾਨ ਤੋਂ ਮੋਟਾ ਇੱਕ-ਖੇਡ ਅਨੁਮਾਨ — ਇਹ ਰੇਟਿੰਗ ਨਹੀਂ ਹੈ।',
    );
    expect(performanceEstimateNote('es')).not.toBe(PERFORMANCE_ESTIMATE_NOTE);
    expect(performanceEstimateNote('hi')).not.toBe(PERFORMANCE_ESTIMATE_NOTE);
  });
});

describe('performanceLabel', () => {
  it('returns null when accuracy is unavailable (no guessing from ACPL alone)', () => {
    expect(performanceLabel(null, 10)).toBeNull();
    expect(performanceLabel(null, 200)).toBeNull();
    expect(performanceLabel(NaN, 50)).toBeNull();
  });

  it('assigns the top bands only when accuracy AND ACPL both support them', () => {
    expect(performanceLabel(95, 20)?.band).toBe('master');
    expect(performanceLabel(95, 20)?.label).toBe('Master-level play');
    expect(performanceLabel(88, 40)?.band).toBe('expert');
    expect(performanceLabel(80, 60)?.band).toBe('strong-club');
    expect(performanceLabel(65, 100)?.band).toBe('club');
    expect(performanceLabel(40, 200)?.band).toBe('beginner');
  });

  it('demotes the band when ACPL is worse than the band ceiling', () => {
    // 95% accuracy but ACPL 50: too lossy for master (≤30) or expert (≤45).
    expect(performanceLabel(95, 50)?.band).toBe('strong-club');
    // ACPL 100 demotes a master-level accuracy all the way to club.
    expect(performanceLabel(95, 100)?.band).toBe('club');
    // Beginner is the floor: it is never demoted further.
    expect(performanceLabel(30, 500)?.band).toBe('beginner');
  });

  it('is monotonic in accuracy for a fixed ACPL', () => {
    let prev = -1;
    for (const acc of [10, 40, 62, 70, 78, 84, 88, 93, 99]) {
      const r = rank(performanceLabel(acc, 50)?.band);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('is monotonic in ACPL for a fixed accuracy (worse ACPL never raises the band)', () => {
    let prev = Infinity;
    for (const acpl of [5, 25, 40, 60, 90, 130, 250]) {
      const r = rank(performanceLabel(90, acpl)?.band);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it('labels are qualitative text, never a numeric rating', () => {
    for (const acc of [35, 65, 80, 90, 97]) {
      const p = performanceLabel(acc, 60);
      expect(p).not.toBeNull();
      expect(p!.label).toMatch(/play$/);
      expect(p!.label).not.toMatch(/\d/);
    }
  });
});
