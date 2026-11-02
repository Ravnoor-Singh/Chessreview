// Type declarations for budgetRules.mjs (the runtime single source of truth
// for the adaptive budget rules, shared with scripts/bench.mjs).

export interface BudgetProfileShape {
  name: string;
  targetDepth: number;
  minDepth: number;
  bookMinDepth: number;
  ceilingMs: number;
}

export interface BudgetRulesShape {
  stabilityWindow: number;
  stabilityMaxCpDelta: number;
  swingWinPctPoints: number;
  lateChangeWindowDepths: number;
  oneLegalMoveDepth: number;
  criticalCeilingMultiplier: number;
}

export interface DepthUpdate {
  depth: number;
  bestMove: string;
  scoreCp: number | null;
}

export interface BudgetTrackerState {
  lastDepth: number;
  bestMove: string | null;
  scoreCp: number | null;
  stopped: boolean;
  stopReason: 'target' | 'stable' | null;
  lateBestMoveChange: boolean;
  earlyBestMove: string | null;
  reachedTarget: boolean;
}

export interface BudgetTracker {
  observe: (update: DepthUpdate) => 'continue' | 'stop';
  state: () => BudgetTrackerState;
}

export interface WhiteEval {
  evalWhiteCp: number;
  mate?: number;
}

export declare const WIN_PROB_K: number;
export declare const MATE_CP: number;
export declare const BUDGET_RULES: BudgetRulesShape;
export declare const BUDGET_PROFILES: Record<'quick' | 'standard' | 'deep', BudgetProfileShape>;
export declare function trackerScoreCp(
  scoreCp: number | undefined,
  scoreMate: number | undefined,
): number | null;
export declare function winProbFromCp(cp: number): number;
export declare function winPctWhite(evalWhiteCp: number, mate?: number): number;
export declare function evalSwingWinPct(prev: WhiteEval, curr: WhiteEval): number;
export declare function isCriticalSwing(
  prev: WhiteEval,
  curr: WhiteEval,
  threshold?: number,
): boolean;
export declare function bestMoveFellOutOfTop3(
  earlyBestMove: string | null,
  finalTopFirstMoves: readonly string[],
): boolean;
export declare function requiredDepthMatch(prevDepth: number, currDepth: number): number;
export declare function createBudgetTracker(profile: {
  targetDepth: number;
  minDepth: number;
}): BudgetTracker;
