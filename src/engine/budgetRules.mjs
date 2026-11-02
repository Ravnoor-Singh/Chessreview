// Adaptive analysis budget rules — SINGLE SOURCE OF TRUTH.
//
// This file is plain ESM JavaScript on purpose: it is imported by the app
// (via the typed façade in `budget.ts`) AND directly by `scripts/bench.mjs`
// (Node cannot import TypeScript). The benchmark therefore exercises the
// exact same stability/stop/swing logic as the app — the rules are never
// duplicated. `budget.ts` re-exports everything here with TypeScript types
// (see `budgetRules.d.mts`); if you change a rule, change it HERE.
//
// The rules (also stated in the README and the Settings UI):
// - Every preset has a TARGET depth and a HARD time ceiling (movetime).
//   Search never exceeds either.
// - Stability stop: once the search has reached the preset's minimum depth,
//   it stops early when the best move is unchanged for
//   `stabilityWindow` (4) consecutive depths AND the top-line score moved
//   less than `stabilityMaxCpDelta` (15 cp) across that whole window.
// - Critical positions: when a position's evaluation swings by more than
//   `swingWinPctPoints` (12) win-probability points versus the previous
//   position, or the best move changed at the last moment (within the final
//   2 depths of the first pass), or the best move seen at the minimum depth
//   fell out of the finished first pass's top-3, the position is
//   re-analyzed at the FULL target depth (no stability stop). At Standard
//   the re-analysis may also use up to `criticalCeilingMultiplier` (2×) the
//   normal time ceiling; the target depth itself never grows.
// - Like-for-like depths (Round 2, Prompt 3): a move is judged from two
//   searches — the best move's eval from the position before it and the
//   played move's eval from the position after it. If the after-position
//   was cut earlier (shallower) than the before-position, it is extended
//   to the before-position's depth before classification, so a depth
//   mismatch can never manufacture a fake mistake. Terminal and
//   one-legal-move positions are exempt (their evals are exact/forced).
// - Terminal positions are never searched (exact scores). Positions with a
//   single legal move get a depth-1 evaluation only.
// - Book positions use the same stability rules with a LOWER minimum depth
//   (`bookMinDepth`); the last book position and the first non-book
//   position are always analyzed at the full budget.

/** Win-probability logistic constant — must equal WIN_PROB_K in src/lib/constants.ts (guarded by a unit test). */
export const WIN_PROB_K = 0.00368208;

/** Mate encoding ceiling shared with src/lib/constants.ts (MATE_CP). */
export const MATE_CP = 100000;

export const BUDGET_RULES = {
  /** Consecutive depths the best move must be unchanged for a stability stop. */
  stabilityWindow: 4,
  /** Maximum allowed top-line score drift (cp) across the stability window. */
  stabilityMaxCpDelta: 15,
  /** Win-% swing versus the previous position that marks a position critical. */
  swingWinPctPoints: 12,
  /** A best-move change this close to the target depth counts as "last moment". */
  lateChangeWindowDepths: 2,
  /** Depth used for positions with exactly one legal move. */
  oneLegalMoveDepth: 1,
  /**
   * Critical re-analyses at Standard may exceed the normal per-position
   * time ceiling by this factor (the target depth is unchanged). The hard
   * ceiling still applies — it is just a higher hard ceiling.
   */
  criticalCeilingMultiplier: 2,
};

/**
 * Preset table. `depth`/`movetimeMs` mirror DEPTH_PRESETS in
 * src/lib/constants.ts (guarded by a unit test); the budget adds
 * `minDepth` (stability stop cannot fire before it) and `bookMinDepth`.
 */
export const BUDGET_PROFILES = {
  quick: { name: 'quick', targetDepth: 14, minDepth: 10, bookMinDepth: 6, ceilingMs: 600 },
  standard: { name: 'standard', targetDepth: 18, minDepth: 14, bookMinDepth: 8, ceilingMs: 1500 },
  deep: { name: 'deep', targetDepth: 22, minDepth: 16, bookMinDepth: 10, ceilingMs: 4000 },
};

/** Convert an engine score (side-to-move perspective) to a tracker score in cp. Mates use the ±(MATE_CP − |mate|) encoding so a mate that gets one move shorter drifts by only 1 cp. */
export function trackerScoreCp(scoreCp, scoreMate) {
  if (scoreMate !== undefined && scoreMate !== null) {
    if (scoreMate === 0) return -MATE_CP;
    return scoreMate > 0 ? MATE_CP - scoreMate : -(MATE_CP + scoreMate);
  }
  return scoreCp === undefined || scoreCp === null ? null : scoreCp;
}

/** Win probability in percent (0..100) for a centipawn score (same logistic as the app). */
export function winProbFromCp(cp) {
  const pct = 50 + 50 * (2 / (1 + Math.exp(-WIN_PROB_K * cp)) - 1);
  return Math.max(0, Math.min(100, pct));
}

/** Win probability in percent from White's perspective for a stored ply eval ({evalWhiteCp, mate} with mate from White's perspective). */
export function winPctWhite(evalWhiteCp, mate) {
  if (mate !== undefined && mate !== null) return mate >= 0 ? 100 : 0;
  return winProbFromCp(evalWhiteCp);
}

/** Absolute win-% swing between two White-perspective evals. */
export function evalSwingWinPct(prev, curr) {
  return Math.abs(
    winPctWhite(curr.evalWhiteCp, curr.mate) - winPctWhite(prev.evalWhiteCp, prev.mate),
  );
}

/** True when the eval swing between consecutive positions marks the later one critical. */
export function isCriticalSwing(prev, curr, threshold = BUDGET_RULES.swingWinPctPoints) {
  return evalSwingWinPct(prev, curr) > threshold;
}

/**
 * Late best-move instability: the best move the search had settled on when
 * it first reached the minimum depth is not even among the finished first
 * pass's top-3 first moves. The position was still moving late, so it
 * earns a full-depth re-analysis (Round 2, Prompt 3, rule 3b).
 */
export function bestMoveFellOutOfTop3(earlyBestMove, finalTopFirstMoves) {
  if (!earlyBestMove) return false;
  return !finalTopFirstMoves.slice(0, 3).includes(earlyBestMove);
}

/**
 * Like-for-like depth rule: the position AFTER a move must be searched at
 * least as deep as the position BEFORE it, otherwise the two evals that
 * classification compares come from different depths. Returns the depth
 * the after-position must reach (0 = no extension needed). Terminal
 * positions report depth 0 and never force an extension.
 */
export function requiredDepthMatch(prevDepth, currDepth) {
  if (prevDepth <= 0 || currDepth <= 0) return 0;
  return currDepth < prevDepth ? prevDepth : 0;
}

/**
 * Create a deterministic stability tracker for one position search.
 *
 * Feed it the top line's depth updates in arrival order:
 *   tracker.observe({ depth, bestMove, scoreCp }) -> 'continue' | 'stop'
 * `scoreCp` is the top line's score in centipawns (side-to-move perspective,
 * mates pre-encoded — see trackerScoreCp). The tracker stops when the
 * target depth is reached, or when the stability rule fires at/after the
 * profile's minimum depth. `tracker.state()` exposes diagnostics
 * (including `lateBestMoveChange`, the critical-position signal).
 */
export function createBudgetTracker(profile) {
  const targetDepth = profile.targetDepth;
  const minDepth = profile.minDepth;
  const windowSize = BUDGET_RULES.stabilityWindow;
  const maxDelta = BUDGET_RULES.stabilityMaxCpDelta;
  /** @type {Map<number, { bestMove: string, scoreCp: number }>} */
  const byDepth = new Map();
  let maxDepthSeen = 0;
  let lastMaxBestMove = null;
  let stopped = false;
  let stopReason = null;
  let lateBestMoveChange = false;
  let earlyBestMove = null;

  function sortedDepths() {
    return [...byDepth.keys()].sort((a, b) => a - b);
  }

  function checkStability() {
    if (maxDepthSeen < minDepth) return false;
    const depths = sortedDepths().filter((d) => d <= maxDepthSeen);
    if (depths.length < windowSize) return false;
    const windowDepths = depths.slice(-windowSize);
    // The window must be consecutive depths ending at the deepest update.
    if (windowDepths[windowDepths.length - 1] !== maxDepthSeen) return false;
    for (let i = 1; i < windowDepths.length; i++) {
      if (windowDepths[i] !== windowDepths[i - 1] + 1) return false;
    }
    const first = byDepth.get(windowDepths[0]);
    if (!first) return false;
    const move = first.bestMove;
    let min = Infinity;
    let max = -Infinity;
    for (const d of windowDepths) {
      const entry = byDepth.get(d);
      if (!entry || entry.bestMove !== move) return false;
      if (entry.scoreCp < min) min = entry.scoreCp;
      if (entry.scoreCp > max) max = entry.scoreCp;
    }
    return max - min < maxDelta;
  }

  return {
    observe(update) {
      if (stopped) return 'stop';
      const { depth, bestMove, scoreCp } = update;
      if (typeof depth !== 'number' || !bestMove) return 'continue';
      if (depth > maxDepthSeen) {
        // A best-move change arriving in the final `lateChangeWindowDepths`
        // depths of the search is a "last moment" change: the position is
        // critical and earns a full-depth re-analysis.
        if (
          lastMaxBestMove !== null &&
          bestMove !== lastMaxBestMove &&
          depth >= targetDepth - BUDGET_RULES.lateChangeWindowDepths + 1
        ) {
          lateBestMoveChange = true;
        }
        maxDepthSeen = depth;
        lastMaxBestMove = bestMove;
        // The best move at the moment the search first reaches the
        // minimum depth: the "first-pass" candidate for the fell-out-of-
        // top-3 critical check.
        if (earlyBestMove === null && depth >= minDepth) earlyBestMove = bestMove;
      }
      if (scoreCp !== null && scoreCp !== undefined) {
        byDepth.set(depth, { bestMove, scoreCp });
      }
      if (maxDepthSeen >= targetDepth) {
        stopped = true;
        stopReason = 'target';
        return 'stop';
      }
      if (checkStability()) {
        stopped = true;
        stopReason = 'stable';
        return 'stop';
      }
      return 'continue';
    },
    state() {
      const depths = sortedDepths();
      const top = depths.length ? byDepth.get(depths[depths.length - 1]) : undefined;
      return {
        lastDepth: maxDepthSeen,
        bestMove: top ? top.bestMove : null,
        scoreCp: top ? top.scoreCp : null,
        stopped,
        stopReason,
        lateBestMoveChange,
        earlyBestMove,
        reachedTarget: maxDepthSeen >= targetDepth,
      };
    },
  };
}
