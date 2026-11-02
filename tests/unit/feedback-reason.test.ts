import { describe, expect, it } from 'vitest';
import { generateFeedback, reasonExplanation } from '@/analysis/feedback';
import { DEFAULT_SETTINGS } from '@/store/settingsStore';

const BASE = {
  san: 'Bxh7+',
  bestMoveSan: 'Bxh7+',
  epl: 0.005,
  evalSwingPawns: 0,
  fenBefore: 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1',
  moveUci: 'd3h7',
  pvSan: ['Bxh7+', 'Kxh7'],
};

describe('classification reason in feedback (Prompt 4)', () => {
  it('reasonExplanation renders the "Why this label?" line', () => {
    expect(reasonExplanation('sacrifice_piece')).toContain('Why this label?');
    expect(reasonExplanation('sacrifice_piece')).toContain('sacrifice of a piece');
    expect(reasonExplanation('only_move')).toContain('only move');
    expect(reasonExplanation('trivial_recapture_blocked')).toContain('recapture');
    expect(reasonExplanation(undefined)).toBeUndefined();
  });

  it('generateFeedback appends the reason for a brilliant move', () => {
    const fb = generateFeedback({
      ...BASE,
      classification: 'brilliant',
      classificationReason: 'sacrifice_piece',
    });
    expect(fb.headline).toContain('brilliant');
    expect(fb.detail).toContain('Why this label?');
  });

  it('generateFeedback without a reason keeps the historical text shape', () => {
    const fb = generateFeedback({ ...BASE, classification: 'brilliant' });
    expect(fb.detail ?? '').not.toContain('Why this label?');
  });

  it('generateFeedback surfaces missed_tactic for a miss', () => {
    const fb = generateFeedback({
      ...BASE,
      classification: 'miss',
      classificationReason: 'missed_tactic',
    });
    expect(fb.detail).toContain('Why this label?');
    expect(fb.detail).toContain('punish');
  });
});

describe('settings: classification profile (Prompt 4)', () => {
  it('defaults to balanced', () => {
    expect(DEFAULT_SETTINGS.classification).toBe('balanced');
  });
});
