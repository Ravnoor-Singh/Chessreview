// All tunable constants for evaluation math and classification (spec Sections 6-8).

/** Win-probability logistic constant: winProb(cp) = 50 + 50 * (2/(1+e^(-K*cp)) - 1). */
export const WIN_PROB_K = 0.00368208;

/** Mate scores are encoded internally as ±(MATE_CP - |mateInMoves|). */
export const MATE_CP = 100000;

/** Display clamp for centipawn evals, in pawns. */
export const EVAL_DISPLAY_CLAMP_PAWNS = 99.9;

/**
 * Classification profiles (Prompt 4) — the SINGLE home for every
 * classification threshold: EPL cutoffs, brilliant/great conditions, miss
 * conditions and the brilliant soft cap. `balanced` reproduces the
 * historical defaults (spec 7.1–7.5) and is the default everywhere;
 * `strict` awards the top labels more rarely and demotes sooner,
 * `generous` does the opposite. classifyMove / the sacrifice helpers take
 * an optional profile; the analyzer passes the user's selected profile
 * (Settings → Classification). Calibration targets and measured rates
 * live in tests/fixtures/games/CALIBRATION.md.
 */
export type ClassificationProfileName = 'strict' | 'balanced' | 'generous';

export interface ClassificationProfile {
  name: ClassificationProfileName;
  /** EPL thresholds (expected-points loss, 0..1); above `mistake` -> blunder. */
  epl: { best: number; excellent: number; good: number; inaccuracy: number; mistake: number };
  brilliant: {
    maxEpl: number;
    maxTopN: number;
    /** Percent, mover perspective: at/above this the position is already winning. */
    maxWinProbBefore: number;
    /** Percent, mover perspective: the sacrifice must not leave the mover below this. */
    minWinProbAfter: number;
    minSacrificeValue: number;
    softCapPerTenMoves: number;
  };
  great: {
    /** 2nd best must be at least this much worse (EPL) for an only-move. */
    onlyMoveGapEpl: number;
    decidedHigh: number;
    decidedLow: number;
  };
  miss: { minWinProbBefore: number; minEpl: number; maxWinProbAfter: number };
}

export const CLASSIFICATION_PROFILES: Record<ClassificationProfileName, ClassificationProfile> = {
  strict: {
    name: 'strict',
    epl: { best: 0.002, excellent: 0.01, good: 0.03, inaccuracy: 0.07, mistake: 0.15 },
    brilliant: {
      maxEpl: 0.01,
      maxTopN: 2,
      maxWinProbBefore: 85,
      minWinProbAfter: 50,
      minSacrificeValue: 3,
      softCapPerTenMoves: 1,
    },
    great: { onlyMoveGapEpl: 0.18, decidedHigh: 92, decidedLow: 8 },
    miss: { minWinProbBefore: 70, minEpl: 0.12, maxWinProbAfter: 55 },
  },
  balanced: {
    name: 'balanced',
    epl: { best: 0.005, excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2 },
    brilliant: {
      maxEpl: 0.02,
      maxTopN: 3,
      maxWinProbBefore: 90,
      minWinProbAfter: 45,
      minSacrificeValue: 3,
      softCapPerTenMoves: 1,
    },
    // onlyMoveGapEpl tuned by Prompt 4 calibration: at 0.10 the master
    // fixtures produced 4.50 Great per 40 moves (target ~1–4), driven by
    // marginal only-moves (gap 0.11–0.15) in sharp games; at 0.15 the
    // measured rate is 3.89 per 40 with every documented golden Great
    // (gap >= 0.19) unaffected. See tests/fixtures/games/CALIBRATION.md.
    great: { onlyMoveGapEpl: 0.15, decidedHigh: 95, decidedLow: 5 },
    miss: { minWinProbBefore: 65, minEpl: 0.1, maxWinProbAfter: 60 },
  },
  generous: {
    name: 'generous',
    epl: { best: 0.01, excellent: 0.035, good: 0.08, inaccuracy: 0.15, mistake: 0.28 },
    brilliant: {
      maxEpl: 0.035,
      maxTopN: 3,
      maxWinProbBefore: 92,
      minWinProbAfter: 40,
      minSacrificeValue: 3,
      softCapPerTenMoves: 2,
    },
    great: { onlyMoveGapEpl: 0.06, decidedHigh: 97, decidedLow: 3 },
    miss: { minWinProbBefore: 60, minEpl: 0.08, maxWinProbAfter: 62 },
  },
};

export const DEFAULT_CLASSIFICATION_PROFILE: ClassificationProfile =
  CLASSIFICATION_PROFILES.balanced;

/** Resolve a profile argument: a full profile object, a profile name, or undefined (= balanced). */
export function resolveClassificationProfile(
  profile?: ClassificationProfile | ClassificationProfileName,
): ClassificationProfile {
  if (!profile) return DEFAULT_CLASSIFICATION_PROFILE;
  return typeof profile === 'string' ? CLASSIFICATION_PROFILES[profile] : profile;
}

/** EPL thresholds of the balanced profile (spec 7.1) — kept for existing imports. */
export const EPL_THRESHOLDS = CLASSIFICATION_PROFILES.balanced.epl;

/** Brilliant detection thresholds of the balanced profile (spec 7.2) — kept for existing imports. */
export const BRILLIANT = CLASSIFICATION_PROFILES.balanced.brilliant;

/** Great detection thresholds of the balanced profile (spec 7.3) — kept for existing imports. */
export const GREAT = CLASSIFICATION_PROFILES.balanced.great;

/** Miss detection thresholds of the balanced profile (spec 7.5) — kept for existing imports. */
export const MISS = CLASSIFICATION_PROFILES.balanced.miss;

/** Accuracy formula constants (spec 8.1): acc = A * exp(-B * diff) - C + bonus. */
export const ACCURACY_FORMULA = {
  a: 103.1668,
  b: 0.04354,
  c: 3.1669,
  uncertaintyBonus: 1,
} as const;

/** Volatility weighting for game accuracy (spec 8.2). */
export const VOLATILITY = { min: 0.5, max: 12 } as const;

/**
 * Accuracy win% ceiling (Prompt 5, matching Lichess's WinPercent):
 * evaluations are clamped to ±1000 cp before the win% conversion used
 * for accuracy — mate scores included (Lichess converts mates through
 * the same ±1000 ceiling). Accuracy win% therefore lives in
 * [≈2.46, ≈97.54], never 0/100. The eval bar and classification keep
 * using the unclamped `winProb`; only the accuracy path clamps.
 */
export const ACCURACY_EVAL_CEILING_CP = 1000;

/**
 * Depth presets (spec 5.2, redefined by Prompt 3 as ADAPTIVE budgets):
 * `depth` is a TARGET depth and `movetimeMs` a HARD time ceiling, not a
 * fixed search depth. Search stops early on stability (best move unchanged
 * for 4 consecutive depths, score drift < 15 cp, after a per-preset minimum
 * depth); critical positions are re-analyzed at the full target. The rules'
 * single source of truth is src/engine/budgetRules.mjs (BUDGET_PROFILES
 * mirrors these depth/movetime values — a unit test guards the match).
 */
export const DEPTH_PRESETS = {
  quick: { depth: 14, movetimeMs: 600, label: 'Quick (adaptive · target depth 14 · ≤600 ms)' },
  standard: {
    depth: 18,
    movetimeMs: 1500,
    label: 'Standard (adaptive · target depth 18 · ≤1.5 s)',
  },
  deep: { depth: 22, movetimeMs: 4000, label: 'Deep (adaptive · target depth 22 · ≤4 s)' },
} as const;

// NOTE: the old flat BOOK_SHORTCUT_DEPTH shortcut was removed in Prompt 3.
// Book positions now use the same stability rules with a lower minimum
// depth, and the last book position is verified at the full budget — see
// src/engine/budget.ts (bookProfileFor) and budgetRules.mjs.

/** IndexedDB position-cache LRU cap (spec 5.3). */
export const CACHE_MAX_ENTRIES = 50000;

/** Material values in points, used by sacrifice / SEE helpers. */
export const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Classification presentation: symbol + color (spec 7.6). */
export const CLASS_STYLE: Record<string, { symbol: string; color: string; label: string }> = {
  brilliant: { symbol: '!!', color: '#1baca6', label: 'Brilliant' },
  // #7fb0d8 (lightened from #5c8bb0 in Round 2 Prompt 5): 5.87:1 on the
  // panel background vs 3.72:1 — the old tint failed axe color-contrast
  // wherever the Great color carries text (counts, performance labels).
  great: { symbol: '!', color: '#7fb0d8', label: 'Great' },
  best: { symbol: '★', color: '#81b64c', label: 'Best' },
  excellent: { symbol: '👍', color: '#96bc4b', label: 'Excellent' },
  good: { symbol: '✓', color: '#a3b787', label: 'Good' },
  book: { symbol: '📖', color: '#a88865', label: 'Book' },
  inaccuracy: { symbol: '?!', color: '#f7c631', label: 'Inaccuracy' },
  mistake: { symbol: '?', color: '#e58f2a', label: 'Mistake' },
  blunder: { symbol: '??', color: '#ca3431', label: 'Blunder' },
  miss: { symbol: '✕', color: '#ca3431', label: 'Miss' },
  forced: { symbol: '⧗', color: '#8b8987', label: 'Forced' },
};

/** Human-readable text for each ClassificationReason ("Why this label?"). */
export const CLASSIFICATION_REASON_TEXT: Record<string, string> = {
  forced: 'It was the only legal move.',
  book: 'A known opening (book) move.',
  only_move: 'The only move that holds the position — every alternative is much worse.',
  turning_point: 'It turns the evaluation around, crossing from worse/equal to better.',
  critical_moment: 'A critical moment: the alternatives lose, this move holds.',
  mate_threat: 'It finds or creates a forced mate threat the alternatives miss.',
  sacrifice_piece: 'A sound sacrifice of a piece that the engine rates (near-)best.',
  sacrifice_exchange:
    'A sound exchange sacrifice (rook for a minor piece) the engine rates (near-)best.',
  sacrifice_queen: 'A sound queen sacrifice that the engine rates (near-)best.',
  sacrifice_mate: 'A sacrifice that leads to forced mate in the engine line.',
  trivial_recapture_blocked:
    'A pure recapture of the piece that just moved — recaptures are never labelled Great.',
  recapture_not_sacrifice: 'A recapture — taking back material is not a sacrifice.',
  epl_threshold: 'Classified by expected-points loss against the engine’s best move.',
  best_move: 'The engine’s top move (or within a hair of it).',
  missed_tactic: 'It fails to punish the opponent’s previous mistake/blunder.',
};

/** NAG codes for annotated PGN export (spec Section 11). */
export const CLASS_NAG: Record<string, number> = {
  good: 1,
  brilliant: 3,
  mistake: 2,
  blunder: 4,
  great: 5,
  inaccuracy: 6,
  miss: 6,
  excellent: 1,
  best: 1,
};
