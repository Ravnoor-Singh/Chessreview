// Adaptive analysis budget — typed façade over budgetRules.mjs.
//
// The actual rules (constants, stability tracker, swing detection) live in
// `budgetRules.mjs`, a plain-ESM module that `scripts/bench.mjs` imports
// directly, so the benchmark and the app can never drift apart. This file
// only adds TypeScript types and preset → profile resolution.
//
// Rules summary (full text in budgetRules.mjs, README and Settings):
// - A preset is a TARGET depth + HARD time ceiling, not a fixed depth.
// - Search stops early once the best move is unchanged for 4 consecutive
//   depths and the score moved < 15 cp across that window (never before
//   the preset's minimum depth).
// - Critical positions (eval swing > 12 win-% points vs the previous
//   position, or a best-move change in the final 2 depths) are re-analyzed
//   at the full target depth.
// - Terminal positions are never searched; one-legal-move positions get a
//   depth-1 evaluation only.
// - Book positions use the same rules with a lower minimum depth; the last
//   book position and the first non-book position use the full budget.

import type { AnalysisDepth } from '@/lib/types';
import { t, type Locale } from '@/i18n';
import {
  BUDGET_PROFILES,
  BUDGET_RULES,
  bestMoveFellOutOfTop3 as coreFellOut,
  createBudgetTracker as createCoreTracker,
  evalSwingWinPct as coreSwing,
  isCriticalSwing as coreIsCritical,
  requiredDepthMatch as coreRequiredDepthMatch,
  trackerScoreCp as coreTrackerScoreCp,
  type BudgetTracker,
  type BudgetTrackerState,
  type DepthUpdate,
  type WhiteEval,
} from './budgetRules.mjs';

export { BUDGET_RULES };
export type { BudgetTracker, BudgetTrackerState, DepthUpdate, WhiteEval };

/** A fully resolved budget for one position search. */
export interface BudgetProfile {
  /** Profile name — the preset name; part of the position-cache key. */
  name: string;
  /** Search never exceeds this depth. */
  targetDepth: number;
  /** Stability stop cannot fire before this depth. */
  minDepth: number;
  /** Hard time ceiling in milliseconds (the UCI movetime cap). */
  ceilingMs: number;
}

/** The canonical profile for a preset, optionally retargeted by caller-supplied depth/movetime (kept for AnalyzeOptions compatibility). */
export function budgetProfileFor(
  preset: AnalysisDepth,
  overrides?: { depth?: number; movetimeMs?: number },
): BudgetProfile {
  const base = BUDGET_PROFILES[preset];
  return {
    name: base.name,
    targetDepth: overrides?.depth ?? base.targetDepth,
    minDepth: base.minDepth,
    ceilingMs: overrides?.movetimeMs ?? base.ceilingMs,
  };
}

/** Book positions: same target/ceiling, lower minimum depth (earlier stability stop). */
export function bookProfileFor(preset: AnalysisDepth, base?: BudgetProfile): BudgetProfile {
  const resolved = base ?? budgetProfileFor(preset);
  return { ...resolved, minDepth: BUDGET_PROFILES[preset].bookMinDepth };
}

/** Full-budget profile: stability stop disabled (minDepth = targetDepth), used for critical re-analysis and the book boundary. */
export function fullBudgetProfile(base: BudgetProfile): BudgetProfile {
  return { ...base, minDepth: base.targetDepth };
}

/**
 * Critical re-analysis profile (Round 2, Prompt 3): full target depth with
 * the stability stop disabled; at Standard the hard time ceiling may
 * extend to `criticalCeilingMultiplier`× so a critical position is not
 * cut off by the clock just short of the target depth. Other presets keep
 * their normal ceiling.
 */
export function criticalProfileFor(base: BudgetProfile): BudgetProfile {
  const full = fullBudgetProfile(base);
  if (base.name !== 'standard') return full;
  return { ...full, ceilingMs: base.ceilingMs * BUDGET_RULES.criticalCeilingMultiplier };
}

/**
 * Like-for-like extension profile: search (with no stability stop) to
 * exactly `depth` — the depth the previous position reached — so the
 * played move's eval and the best move's eval come from the same depth.
 * At Standard the ceiling scales by the critical multiplier, since the
 * extension is a correctness fix, not an optional extra.
 */
export function matchDepthProfile(base: BudgetProfile, depth: number): BudgetProfile {
  return {
    ...base,
    targetDepth: depth,
    minDepth: depth,
    ceilingMs:
      base.name === 'standard'
        ? base.ceilingMs * BUDGET_RULES.criticalCeilingMultiplier
        : base.ceilingMs,
  };
}

/** Profile for one-legal-move positions: a depth-1 evaluation only. */
export function oneMoveProfile(base: BudgetProfile): BudgetProfile {
  return {
    ...base,
    targetDepth: BUDGET_RULES.oneLegalMoveDepth,
    minDepth: BUDGET_RULES.oneLegalMoveDepth,
    ceilingMs: Math.min(base.ceilingMs, 250),
  };
}

/** Create a stability tracker for one position search under `profile`. */
export function createBudgetTracker(profile: BudgetProfile): BudgetTracker {
  return createCoreTracker(profile);
}

export const trackerScoreCp: (
  scoreCp: number | undefined,
  scoreMate: number | undefined,
) => number | null = coreTrackerScoreCp;

export const evalSwingWinPct: (prev: WhiteEval, curr: WhiteEval) => number = coreSwing;

export const isCriticalSwing: (prev: WhiteEval, curr: WhiteEval, threshold?: number) => boolean =
  coreIsCritical;

export const bestMoveFellOutOfTop3: (
  earlyBestMove: string | null,
  finalTopFirstMoves: readonly string[],
) => boolean = coreFellOut;

export const requiredDepthMatch: (prevDepth: number, currDepth: number) => number =
  coreRequiredDepthMatch;

/** Human-readable statement of the exact rules, shown in Settings. */
export function budgetRulesSummary(preset: AnalysisDepth, locale: Locale = 'en'): string {
  const p = BUDGET_PROFILES[preset];
  return t(locale, 'settings.budgetSummary', {
    target: p.targetDepth,
    cap: p.ceilingMs,
    min: p.minDepth,
    window: BUDGET_RULES.stabilityWindow,
    delta: BUDGET_RULES.stabilityMaxCpDelta,
    swing: BUDGET_RULES.swingWinPctPoints,
    bookMin: p.bookMinDepth,
  });
}
