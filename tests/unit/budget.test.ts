import { describe, expect, it } from 'vitest';
import {
  BUDGET_RULES,
  bestMoveFellOutOfTop3,
  budgetProfileFor,
  bookProfileFor,
  createBudgetTracker,
  criticalProfileFor,
  evalSwingWinPct,
  fullBudgetProfile,
  isCriticalSwing,
  matchDepthProfile,
  oneMoveProfile,
  requiredDepthMatch,
  trackerScoreCp,
} from '@/engine/budget';
import { DEPTH_PRESETS, WIN_PROB_K } from '@/lib/constants';
// The shared rules module itself — imported here to prove the app and
// scripts/bench.mjs consume identical constants.
import { BUDGET_PROFILES, WIN_PROB_K as RULES_WIN_PROB_K } from '@/engine/budgetRules.mjs';

const STANDARD = budgetProfileFor('standard');

/** Feed depths `from..to` with a constant best move and score. */
function feedStable(
  tracker: ReturnType<typeof createBudgetTracker>,
  from: number,
  to: number,
  move = 'e2e4',
  scoreCp = 30,
): string[] {
  const decisions: string[] = [];
  for (let d = from; d <= to; d++) {
    decisions.push(tracker.observe({ depth: d, bestMove: move, scoreCp }));
  }
  return decisions;
}

/** Feed depths with a drifting score so the stability stop can never fire. */
function feedUnstable(
  tracker: ReturnType<typeof createBudgetTracker>,
  from: number,
  to: number,
  move = 'e2e4',
): void {
  for (let d = from; d <= to; d++) {
    tracker.observe({ depth: d, bestMove: move, scoreCp: d * 20 });
  }
}

describe('budget profiles', () => {
  it('mirror DEPTH_PRESETS depths and time ceilings (bench/app share one source)', () => {
    for (const name of ['quick', 'standard', 'deep'] as const) {
      const profile = budgetProfileFor(name);
      expect(profile.targetDepth).toBe(DEPTH_PRESETS[name].depth);
      expect(profile.ceilingMs).toBe(DEPTH_PRESETS[name].movetimeMs);
      expect(BUDGET_PROFILES[name].targetDepth).toBe(DEPTH_PRESETS[name].depth);
      expect(BUDGET_PROFILES[name].ceilingMs).toBe(DEPTH_PRESETS[name].movetimeMs);
    }
  });

  it('shares the win-probability constant with the app', () => {
    expect(RULES_WIN_PROB_K).toBe(WIN_PROB_K);
  });

  it('book profile lowers only the minimum depth; full profile disables the stability stop', () => {
    const book = bookProfileFor('standard');
    expect(book.targetDepth).toBe(STANDARD.targetDepth);
    expect(book.ceilingMs).toBe(STANDARD.ceilingMs);
    expect(book.minDepth).toBeLessThan(STANDARD.minDepth);
    const full = fullBudgetProfile(STANDARD);
    expect(full.minDepth).toBe(full.targetDepth);
  });

  it('one-move profile is a depth-1 evaluation with a short ceiling', () => {
    const p = oneMoveProfile(STANDARD);
    expect(p.targetDepth).toBe(BUDGET_RULES.oneLegalMoveDepth);
    expect(p.minDepth).toBe(1);
    expect(p.ceilingMs).toBeLessThanOrEqual(250);
  });
});

describe('createBudgetTracker — stability stop', () => {
  it('stops after 4 stable depths once the minimum depth is reached', () => {
    const tracker = createBudgetTracker(STANDARD); // minDepth 14 (Round 2 floor)
    const decisions = feedStable(tracker, 1, 20);
    // The first stop opportunity is at the minimum depth itself: the last
    // 4 depths (11–14) are stable, so the stop fires exactly at depth 14.
    expect(decisions[12]).toBe('continue'); // depth 13 < minDepth
    expect(decisions[13]).toBe('stop'); // depth 14
    expect(tracker.state().stopReason).toBe('stable');
    expect(tracker.state().lastDepth).toBe(14);
  });

  it('never stops before the minimum depth, however stable', () => {
    const tracker = createBudgetTracker(STANDARD);
    const decisions = feedStable(tracker, 1, 13);
    expect(decisions.every((d) => d === 'continue')).toBe(true);
    expect(tracker.state().stopped).toBe(false);
  });

  it('does not stop when the best move keeps changing', () => {
    const tracker = createBudgetTracker(STANDARD);
    let decision = 'continue';
    for (let d = 1; d <= 17; d++) {
      decision = tracker.observe({ depth: d, bestMove: d % 2 ? 'e2e4' : 'd2d4', scoreCp: 30 });
    }
    expect(decision).toBe('continue');
    expect(tracker.state().stopped).toBe(false);
  });

  it('does not stop when the score drifts 15 cp or more across the window', () => {
    const tracker = createBudgetTracker(STANDARD);
    let decision = 'continue';
    for (let d = 1; d <= 20; d++) {
      decision = tracker.observe({ depth: d, bestMove: 'e2e4', scoreCp: 30 + (d - 12) * 6 });
      if (decision === 'stop') break;
    }
    // Drift across any 4-window after depth 12 is 18 cp ≥ 15 → no stability
    // stop; the search runs to the target and stops there instead.
    expect(tracker.state().stopReason).toBe('target');
    expect(tracker.state().lastDepth).toBe(STANDARD.targetDepth);
  });

  it('stops at the target depth even when unstable', () => {
    const tracker = createBudgetTracker(STANDARD);
    let decision = 'continue';
    for (let d = 1; d <= 18; d++) {
      decision = tracker.observe({ depth: d, bestMove: d % 2 ? 'e2e4' : 'g1f3', scoreCp: d * 40 });
    }
    expect(decision).toBe('stop');
    expect(tracker.state().stopReason).toBe('target');
    expect(tracker.state().reachedTarget).toBe(true);
  });

  it('a non-consecutive depth window (missing depth) cannot trigger stability', () => {
    const tracker = createBudgetTracker(STANDARD);
    for (const d of [12, 13, 15, 16]) {
      expect(tracker.observe({ depth: d, bestMove: 'e2e4', scoreCp: 30 })).toBe('continue');
    }
    expect(tracker.state().stopped).toBe(false);
  });

  it('book profile stops earlier than the standard profile on the same stream', () => {
    const book = createBudgetTracker(bookProfileFor('standard')); // minDepth 8
    const decisions = feedStable(book, 1, 12);
    expect(decisions[6]).toBe('continue'); // depth 7 < book minDepth
    expect(decisions[7]).toBe('stop'); // depth 8: window 5–8 stable
    expect(book.state().stopReason).toBe('stable');
  });
});

describe('createBudgetTracker — critical signals', () => {
  it('flags a best-move change in the final two depths as a late change', () => {
    const tracker = createBudgetTracker(STANDARD); // target 18
    feedUnstable(tracker, 1, 16, 'e2e4');
    tracker.observe({ depth: 17, bestMove: 'd2d4', scoreCp: 25 });
    expect(tracker.state().lateBestMoveChange).toBe(true);
  });

  it('does not flag an early best-move change as late', () => {
    const tracker = createBudgetTracker(STANDARD);
    feedUnstable(tracker, 1, 5, 'e2e4');
    tracker.observe({ depth: 6, bestMove: 'd2d4', scoreCp: 25 });
    feedUnstable(tracker, 7, 10, 'd2d4');
    expect(tracker.state().lateBestMoveChange).toBe(false);
  });
});

describe('swing detection', () => {
  it('measures win-% swing between White-perspective evals', () => {
    // +30 cp ≈ 52.8% vs −300 cp ≈ 25.0% → swing ≈ 27.8 points > 12.
    const swing = evalSwingWinPct({ evalWhiteCp: 30 }, { evalWhiteCp: -300 });
    expect(swing).toBeGreaterThan(12);
    expect(isCriticalSwing({ evalWhiteCp: 30 }, { evalWhiteCp: -300 })).toBe(true);
  });

  it('a small eval change is not critical', () => {
    expect(isCriticalSwing({ evalWhiteCp: 30 }, { evalWhiteCp: 45 })).toBe(false);
    expect(evalSwingWinPct({ evalWhiteCp: 30 }, { evalWhiteCp: 30 })).toBe(0);
  });

  it('a mate appearing or disappearing is maximally critical', () => {
    expect(isCriticalSwing({ evalWhiteCp: 50 }, { evalWhiteCp: 99995, mate: 5 })).toBe(true);
    expect(evalSwingWinPct({ evalWhiteCp: 0, mate: -3 }, { evalWhiteCp: 0, mate: 3 })).toBe(100);
  });
});

describe('Round 2 floors and critical profiles', () => {
  it('stability floors: Standard ≥ 14, Deep ≥ 16 (never fire earlier)', () => {
    expect(budgetProfileFor('standard').minDepth).toBe(14);
    expect(budgetProfileFor('deep').minDepth).toBe(16);
    // A perfectly stable Deep search stops at 16, not before.
    const tracker = createBudgetTracker(budgetProfileFor('deep'));
    const decisions = feedStable(tracker, 1, 22);
    expect(decisions[14]).toBe('continue'); // depth 15 < 16
    expect(decisions[15]).toBe('stop'); // depth 16
  });

  it('critical profile: full depth; Standard ceiling extends to 2×, Deep keeps its ceiling', () => {
    const std = criticalProfileFor(STANDARD);
    expect(std.minDepth).toBe(std.targetDepth);
    expect(std.ceilingMs).toBe(STANDARD.ceilingMs * BUDGET_RULES.criticalCeilingMultiplier);
    expect(BUDGET_RULES.criticalCeilingMultiplier).toBe(2);
    const deep = criticalProfileFor(budgetProfileFor('deep'));
    expect(deep.ceilingMs).toBe(budgetProfileFor('deep').ceilingMs);
    expect(deep.minDepth).toBe(deep.targetDepth);
  });

  it('match-depth profile targets exactly the required depth with no stability stop', () => {
    const p = matchDepthProfile(STANDARD, 18);
    expect(p.targetDepth).toBe(18);
    expect(p.minDepth).toBe(18);
    expect(p.ceilingMs).toBe(STANDARD.ceilingMs * 2);
  });
});

describe('bestMoveFellOutOfTop3 / requiredDepthMatch', () => {
  it('flags an early best move that fell out of the final top-3', () => {
    expect(bestMoveFellOutOfTop3('e2e4', ['g1f3', 'd2d4', 'c2c4'])).toBe(true);
    expect(bestMoveFellOutOfTop3('e2e4', ['d2d4', 'e2e4', 'c2c4'])).toBe(false);
    expect(bestMoveFellOutOfTop3('e2e4', ['e2e4'])).toBe(false);
    expect(bestMoveFellOutOfTop3(null, ['d2d4'])).toBe(false);
  });

  it('tracker records the best move at the minimum depth as earlyBestMove', () => {
    const tracker = createBudgetTracker(STANDARD); // minDepth 14
    for (let d = 1; d <= 13; d++) {
      tracker.observe({ depth: d, bestMove: 'e2e4', scoreCp: d * 20 });
    }
    expect(tracker.state().earlyBestMove).toBeNull();
    tracker.observe({ depth: 14, bestMove: 'd2d4', scoreCp: 300 });
    expect(tracker.state().earlyBestMove).toBe('d2d4');
  });

  it('requiredDepthMatch extends only a shallower, non-terminal current position', () => {
    expect(requiredDepthMatch(18, 14)).toBe(18);
    expect(requiredDepthMatch(18, 18)).toBe(0);
    expect(requiredDepthMatch(14, 18)).toBe(0);
    expect(requiredDepthMatch(0, 14)).toBe(0); // terminal predecessor
    expect(requiredDepthMatch(18, 0)).toBe(0); // terminal current
  });
});

describe('trackerScoreCp', () => {
  it('passes cp through and encodes mates so mate-distance drift is tiny', () => {
    expect(trackerScoreCp(42, undefined)).toBe(42);
    expect(trackerScoreCp(undefined, 5)).toBe(100000 - 5);
    expect(trackerScoreCp(undefined, -5)).toBe(-(100000 - 5));
    expect(trackerScoreCp(undefined, 0)).toBe(-100000);
    expect(trackerScoreCp(undefined, undefined)).toBeNull();
    // Mate in 5 → mate in 6 changes the encoded score by exactly 1 cp,
    // far under the 15 cp stability threshold.
    expect(Math.abs(trackerScoreCp(undefined, 5)! - trackerScoreCp(undefined, 6)!)).toBe(1);
  });
});
