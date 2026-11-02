// One-position adaptive search, shared by the sequential analyzer and the
// parallel pool. Wraps an engine client's fixed-depth `analyze` call with
// the budget tracker: UCI info updates stream in, the tracker decides when
// the position is stable, and the client is stopped early — the returned
// lines are whatever the deepest completed iteration produced.

import type { EngineLine } from '@/lib/types';
import {
  bestMoveFellOutOfTop3,
  createBudgetTracker,
  trackerScoreCp,
  type BudgetProfile,
} from './budget';

/**
 * The minimal engine-client surface the analyzer and pool depend on.
 * `StockfishClient` satisfies it structurally; unit tests substitute a
 * fake implementation.
 */
/**
 * Repetition context for one position (Round 2): the game position the
 * search starts from plus the UCI moves played since, so the engine is
 * told `position fen <startFen> moves …` and its repetition/hash state
 * matches the game instead of a bare FEN.
 */
export interface PositionHistory {
  startFen: string;
  /** UCI moves from `startFen` up to (not including) the searched position. */
  movesUci: string[];
}

export interface EngineClientLike {
  analyze: (
    req: {
      fen: string;
      depth: number;
      movetimeMs?: number;
      multiPv: number;
      history?: PositionHistory;
    },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ) => Promise<{ best: string; ponder?: string; lines: EngineLine[]; stopped: boolean }>;
  stop: () => void;
  newGame?: () => Promise<void>;
  terminate?: () => void;
}

export interface PositionEvalResult {
  lines: EngineLine[];
  /** Deepest completed iteration across the returned lines (0 when none). */
  depth: number;
  /** The best move changed within the final depths of the first pass. */
  lateBestMoveChange: boolean;
  /** True when the budget tracker stopped the search before the target depth. */
  stoppedEarly: boolean;
  /** Best move when the search first reached the profile's minimum depth. */
  earlyBestMove: string | null;
  /**
   * The minimum-depth best move is not among the finished first pass's
   * top-3 first moves — the position was still unstable late, so the
   * analyzer treats it as critical and re-analyzes at full depth.
   */
  bestMoveFellOut: boolean;
}

export async function analyzePositionWithBudget(
  client: EngineClientLike,
  fen: string,
  profile: BudgetProfile,
  multiPv: number,
  token?: { cancelled: boolean },
  history?: PositionHistory,
): Promise<PositionEvalResult> {
  const tracker = createBudgetTracker(profile);
  const result = await client.analyze(
    { fen, depth: profile.targetDepth, movetimeMs: profile.ceilingMs, multiPv, history },
    (lines) => {
      if (token?.cancelled) {
        client.stop();
        return;
      }
      const top = lines[0];
      if (!top || top.pv.length === 0) return;
      const decision = tracker.observe({
        depth: top.depth,
        bestMove: top.pv[0],
        scoreCp: trackerScoreCp(top.scoreCp, top.scoreMate),
      });
      if (decision === 'stop' && top.depth < profile.targetDepth) {
        // Stability reached: end the search now and keep these lines. (At
        // the target depth the engine finishes on its own.)
        client.stop();
      }
    },
  );
  const state = tracker.state();
  return {
    lines: result.lines,
    depth: result.lines.reduce((m, l) => Math.max(m, l.depth), 0),
    lateBestMoveChange: state.lateBestMoveChange,
    stoppedEarly: state.stopReason === 'stable',
    earlyBestMove: state.earlyBestMove,
    bestMoveFellOut: bestMoveFellOutOfTop3(
      state.earlyBestMove,
      result.lines.map((l) => l.pv[0]).filter((m): m is string => !!m),
    ),
  };
}
