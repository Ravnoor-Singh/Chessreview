// Game analysis pipeline (spec 5.2) + live position analysis.
//
// Every position is evaluated under an ADAPTIVE budget (see budget.ts):
// a preset is a target depth + hard time ceiling; search stops early when
// the best move is stable, critical positions (eval swing > 12 win-% or a
// last-moment best-move change) are re-analyzed at full depth, terminal
// positions get exact scores without a search, and one-legal-move
// positions get a depth-1 evaluation only. Book positions use the same
// stability rules with a lower minimum depth; the last book position and
// the first non-book position always use the full budget (the book extent
// is known from the opening index before the loop starts, so the boundary
// verification is folded into their initial analysis — no stale shallow
// eval survives at the boundary).
//
// Evaluation runs either sequentially on one client (the multi-threaded
// build) or through an EnginePool of single-thread clients (single/lite
// builds). Either way, results are finalized — and streamed to the caller
// via throttled progress (≤ 10 updates/second) — strictly in ply order.

import { Chess } from 'chess.js';
import type {
  AnalysisDepth,
  EngineLine,
  GameReview,
  MoveClass,
  ParsedGame,
  PlyAnalysis,
} from '@/lib/types';
import {
  MATE_CP,
  resolveClassificationProfile,
  type ClassificationProfile,
  type ClassificationProfileName,
} from '@/lib/constants';
import { scoreToWhiteCp, winProb } from '@/analysis/winProbability';
import {
  blockedLabelReason,
  classifyMoveDetailed,
  computeEpl,
  type LastMoveInfo,
} from '@/analysis/classify';
import { accuracyWinPercent, computeGameAccuracies, moveAccuracy } from '@/analysis/accuracy';
import { epdOf, findOpening, type OpeningIndex } from '@/analysis/openings';
import { generateFeedback } from '@/analysis/feedback';
import { performanceLabel } from '@/analysis/rating';
import { pvToSan, uciToSan } from '@/lib/san';
import { computeTimeSpentMs, parseTimeControl } from '@/lib/clocks';
import { formatEval, hashString } from '@/lib/format';
import type { StockfishClient } from './stockfish.worker';
import { getCachedPositionForRequest, positionKeyV2, putCachedPosition } from './cache';
import {
  bookProfileFor,
  budgetProfileFor,
  criticalProfileFor,
  isCriticalSwing,
  matchDepthProfile,
  oneMoveProfile,
  requiredDepthMatch,
  type BudgetProfile,
} from './budget';
import {
  analyzePositionWithBudget,
  type EngineClientLike,
  type PositionEvalResult,
  type PositionHistory,
} from './analyzePosition';
import { epdOfFen, resolveTermination } from '@/analysis/termination';
import type { EnginePool } from './pool';
import { createProgressThrottler } from './progress';

export interface AnalyzeOptions {
  depth: number;
  movetimeMs: number;
  multiPv: number;
  openingIndex: OpeningIndex | null;
  onProgress?: (plies: PlyAnalysis[], done: number, total: number) => void;
  token: { cancelled: boolean };
  /** Budget preset behind `depth`/`movetimeMs`; defaults to 'standard'. Also the cache profile name. */
  presetName?: AnalysisDepth;
  /** Engine build version for cache keys (e.g. the manifest version); falls back to the engine name. */
  engineVersion?: string | null;
  /** Pool of single-thread clients (single/lite mode). Omit in multi-thread mode: exactly one client is used. */
  pool?: EnginePool | null;
  /** Explicit budget profile override (wins over presetName/depth/movetimeMs). */
  budgetProfile?: BudgetProfile;
  /** Classification profile (Prompt 4); defaults to 'balanced'. */
  classificationProfile?: ClassificationProfile | ClassificationProfileName;
  /** UI locale for generated coach feedback / performance labels (Prompt 10). */
  locale?: import('@/i18n').Locale;
  /**
   * Long-game option (Round 2): analyze only the first N plies (moves)
   * of the game. Undefined analyzes the whole game. Progress totals and
   * the returned review cover exactly the analyzed prefix.
   */
  maxPlies?: number;
}

interface TerminalEval {
  evalWhiteCp: number;
  mate?: number;
}

/**
 * Exact score for a position the rules have already decided, or null
 * when the position must be searched. NEVER searched endings: checkmate
 * (exact mate score), stalemate, insufficient material, threefold /
 * fivefold repetition, and the fifty- / seventy-five-move counters —
 * every rule-draw is exactly 0.0 cp (50% win probability for both
 * sides; see src/analysis/termination.ts for how that feeds accuracy).
 * Resignation/timeout/abandonment are not board states and are
 * deliberately NOT terminal here: the final position keeps its engine
 * evaluation and the ending event creates no classified move.
 */
export function terminalEval(fen: string): TerminalEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    // Side to move is checkmated.
    return chess.turn() === 'w'
      ? { evalWhiteCp: -MATE_CP, mate: 0 }
      : { evalWhiteCp: MATE_CP, mate: 0 };
  }
  if (
    chess.isStalemate() ||
    chess.isDraw() ||
    chess.isThreefoldRepetition() ||
    chess.isInsufficientMaterial()
  ) {
    return { evalWhiteCp: 0 };
  }
  return null;
}

function topLineEvalWhite(lines: EngineLine[], fen: string): TerminalEval {
  const top = lines[0];
  if (!top) return { evalWhiteCp: 0 };
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return scoreToWhiteCp(top.scoreCp, top.scoreMate, turn);
}

function winProbWhiteOf(evalWhite: TerminalEval): number {
  if (evalWhite.mate !== undefined) {
    // Mate 0 means the side to move HAS been mated: the sign of the
    // encoded eval says which side won (previously this returned 100
    // even when White was the mated side).
    if (evalWhite.mate === 0) return evalWhite.evalWhiteCp > 0 ? 100 : 0;
    return evalWhite.mate > 0 ? 100 : 0;
  }
  return winProb(evalWhite.evalWhiteCp);
}

export async function analyzeGame(
  client: StockfishClient,
  parsed: ParsedGame & { pgn: string },
  engineMeta: { name: string; mode: GameReview['engine']['mode'] },
  opts: AnalyzeOptions,
): Promise<GameReview | null> {
  const totalPositions =
    opts.maxPlies !== undefined
      ? Math.min(parsed.fens.length, Math.max(1, Math.floor(opts.maxPlies) + 1))
      : parsed.fens.length;
  const plies: PlyAnalysis[] = [];
  const chess = new Chess(parsed.startFen);
  // Chess960 games never reach analysis (the UI blocks them), but if one
  // ever did, the standard opening book must not be applied to it.
  const openingIndex = parsed.isChess960 ? null : opts.openingIndex;

  // Reconstruct UCI moves + book continuity. The verbose move objects are
  // kept too: the move that produced a position is the `lastMove` the
  // classifier needs for EXACT recapture detection (Prompt 4).
  const ucis: string[] = [];
  const verboseMoves: LastMoveInfo[] = [];
  for (const san of parsed.moves) {
    const mv = chess.move(san);
    ucis.push(mv.from + mv.to + (mv.promotion ?? ''));
    verboseMoves.push({ from: mv.from, to: mv.to, captured: mv.captured, san: mv.san });
  }
  const classificationProfile = resolveClassificationProfile(opts.classificationProfile);

  // Repetition awareness (Round 2): occurrenceCount[idx] is how often
  // the position at idx has occurred up to and including idx. When a
  // position repeats, (a) the engine is sent the game history
  // (`position fen <start> moves …`) instead of a bare FEN so its own
  // repetition state matches the game, and (b) the cache key carries
  // the occurrence count, so an evaluation made when the position was
  // new can never be served for its third occurrence (where a draw
  // claim changes the position's true value), or vice versa.
  const occurrenceCount: number[] = [];
  {
    const seen = new Map<string, number>();
    for (let i = 0; i < parsed.fens.length; i++) {
      const epd = epdOfFen(parsed.fens[i]);
      const n = (seen.get(epd) ?? 0) + 1;
      seen.set(epd, n);
      occurrenceCount.push(n);
    }
  }
  const repTagFor = (idx: number): string | undefined =>
    occurrenceCount[idx] > 1 ? String(occurrenceCount[idx]) : undefined;
  const historyFor = (idx: number): PositionHistory | undefined =>
    occurrenceCount[idx] > 1
      ? { startFen: parsed.startFen, movesUci: ucis.slice(0, idx) }
      : undefined;

  // Per-move time spent, derived from the [%clk] clocks (Prompt 6):
  // spent = previous clock OF THE SAME PLAYER - this clock + increment,
  // with the TimeControl base time as the "previous clock" for each
  // player's first move. See src/lib/clocks.ts for the full derivation.
  const timeControl = parseTimeControl(parsed.headers.TimeControl);
  const spentByMove = computeTimeSpentMs(parsed.clocksMs, {
    incrementMs: timeControl?.incrementMs ?? 0,
    baseMs: timeControl?.baseMs ?? null,
  });

  const inBook: boolean[] = [false];
  if (openingIndex) {
    // The index keys positions AFTER an opening line, so a game's start
    // position is (almost) never itself a key. Seed the streak from what
    // the start position IS instead: book territory when it is the
    // standard initial position (the root of every book line) or when it
    // is itself an indexed book position (a FEN-set opening position).
    // Seeding with `has(start)` alone made the streak false from ply 0
    // for every standard-start game, so no move was ever classified
    // "book" (Fix 0 — found by re-running a real Halloween Gambit game).
    const startEpd = epdOf(parsed.fens[0]);
    let streak = openingIndex.has(startEpd) || startEpd === epdOf(new Chess().fen());
    inBook[0] = streak;
    for (let i = 1; i < totalPositions; i++) {
      streak = streak && openingIndex.has(epdOf(parsed.fens[i]));
      inBook.push(streak);
    }
  } else {
    for (let i = 1; i < totalPositions; i++) inBook.push(false);
  }

  // --- Adaptive budget setup ------------------------------------------------
  const presetName: AnalysisDepth = opts.presetName ?? 'standard';
  const baseProfile =
    opts.budgetProfile ??
    budgetProfileFor(presetName, { depth: opts.depth, movetimeMs: opts.movetimeMs });
  const bookProf = bookProfileFor(presetName, baseProfile);
  const firstNonBookIdx = inBook.indexOf(false);
  const lastBookIdx = firstNonBookIdx > 0 ? firstNonBookIdx - 1 : -1;
  const profileFor = (idx: number): BudgetProfile => {
    if (!inBook[idx]) return baseProfile;
    if (idx === lastBookIdx) return baseProfile; // boundary: verified at full budget
    return bookProf;
  };
  const engineVersion = opts.engineVersion ?? engineMeta.name;

  // --- Progress (throttled to at most 10 updates/second) --------------------
  const progress = opts.onProgress
    ? createProgressThrottler<[PlyAnalysis[], number, number]>((v) => opts.onProgress!(...v), 100)
    : null;
  const emitProgress = (done: number): void => {
    progress?.emit([plies.slice(), done, totalPositions]);
  };

  const counts: GameReview['counts'] = {
    white: emptyCounts(),
    black: emptyCounts(),
  };
  const cpLoss: Record<'w' | 'b', number[]> = { w: [], b: [] };
  const brilliantWindow: Record<'w' | 'b', number[]> = { w: [], b: [] };

  /** Build the PlyAnalysis for `idx` from its final lines and classify the move that led to it. */
  const finalizePly = (
    idx: number,
    lines: EngineLine[],
    depthUsed: number,
    term: TerminalEval | null,
  ): void => {
    const fen = parsed.fens[idx];
    const evalWhite: TerminalEval = term ?? topLineEvalWhite(lines, fen);
    const ply: PlyAnalysis = {
      ply: idx,
      fen,
      lines,
      depth: depthUsed,
      evalWhiteCp: evalWhite.evalWhiteCp,
      mate: evalWhite.mate,
      winProbWhite: winProbWhiteOf(evalWhite),
    };
    if (idx > 0) {
      ply.san = parsed.moves[idx - 1];
      ply.uci = ucis[idx - 1];
      ply.color = moverColor(parsed.startFen, idx);
      ply.clockMs = parsed.clocksMs[idx - 1] ?? undefined;
      ply.timeSpentMs = spentByMove[idx - 1];
    }
    plies.push(ply);

    // Classify the move that led here, now that both positions are known.
    if (idx > 0) {
      const prev = plies[idx - 1];
      const mover = ply.color!;
      const wpBefore = mover === 'w' ? prev.winProbWhite : 100 - prev.winProbWhite;
      const wpAfter = mover === 'w' ? ply.winProbWhite : 100 - ply.winProbWhite;
      const epl = computeEpl(prev.lines, ply.uci!, wpAfter);
      ply.epl = epl;
      // Per-move accuracy uses the ACCURACY win% (eval clamped to
      // ±1000 cp, Lichess-style — see accuracyWinPercent), not the
      // unclamped win% used for classification/EPL above.
      ply.accuracy = moveAccuracy(
        mover === 'w'
          ? accuracyWinPercent(prev.evalWhiteCp)
          : 100 - accuracyWinPercent(prev.evalWhiteCp),
        mover === 'w'
          ? accuracyWinPercent(ply.evalWhiteCp)
          : 100 - accuracyWinPercent(ply.evalWhiteCp),
      );
      const legalCount = new Chess(prev.fen).moves().length;
      const window = brilliantWindow[mover];
      // The move that produced fenBefore (= prev.fen) is main-line move
      // idx-1 (1-based), i.e. verboseMoves[idx - 2]; ply 1 has none.
      const lastMove = idx >= 2 ? verboseMoves[idx - 2] : undefined;
      const detailed = classifyMoveDetailed({
        fenBefore: prev.fen,
        moveUci: ply.uci!,
        legalMoveCount: legalCount,
        isBookMove: inBook[idx],
        linesBefore: prev.lines,
        winProbBefore: wpBefore,
        winProbAfter: wpAfter,
        epl,
        prevPly:
          idx >= 2
            ? {
                classification: plies[idx - 1].classification,
                winProbMoverBefore:
                  mover === 'w' ? plies[idx - 2].winProbWhite : 100 - plies[idx - 2].winProbWhite,
              }
            : undefined,
        brilliantUsedInWindow: window.filter((p) => idx - p <= 10).length,
        movesSinceStart: idx,
        lastMove,
        profile: classificationProfile,
      });
      const cls = detailed.classification;
      ply.classification = cls;
      // Explainability: keep the classifier's reason; for a pure
      // recapture that landed in a plain band, the more informative
      // reason is WHY it was kept out of Great/Brilliant.
      ply.reason = detailed.reason;
      if (cls === 'best' || cls === 'excellent' || cls === 'good') {
        const blocked = blockedLabelReason({
          fenBefore: prev.fen,
          moveUci: ply.uci!,
          legalMoveCount: legalCount,
          isBookMove: inBook[idx],
          linesBefore: prev.lines,
          winProbBefore: wpBefore,
          winProbAfter: wpAfter,
          epl,
          brilliantUsedInWindow: 0,
          movesSinceStart: idx,
          lastMove,
          profile: classificationProfile,
        });
        if (blocked) ply.reason = blocked;
      }
      if (cls === 'brilliant') window.push(idx);
      counts[mover === 'w' ? 'white' : 'black'][cls]++;
      // Approximate centipawn loss from mover-perspective eval swing.
      const sign = mover === 'w' ? 1 : -1;
      const cpBefore = clampCp(sign * prev.evalWhiteCp);
      const cpAfter = clampCp(-sign * ply.evalWhiteCp);
      cpLoss[mover].push(Math.min(1000, Math.max(0, cpBefore - cpAfter)));

      const bestUci = prev.lines[0]?.pv[0];
      if (bestUci) {
        ply.bestMoveUci = bestUci;
        ply.bestMoveSan = uciToSan(prev.fen, bestUci);
      }
      if (inBook[idx] && openingIndex) {
        const entry = openingIndex.get(epdOf(fen));
        if (entry) {
          ply.bookName = entry.name;
          ply.bookEco = entry.eco;
        }
      }
      const fb = generateFeedback({
        locale: opts.locale ?? 'en',
        san: ply.san!,
        classification: cls,
        classificationReason: ply.reason,
        bestMoveSan: ply.bestMoveSan,
        bestEvalText: ply.bestMoveSan ? formatEval(prev.evalWhiteCp, prev.mate) : undefined,
        epl,
        evalSwingPawns: Math.abs(cpBefore - cpAfter) / 100,
        bookName: ply.bookName,
        bookEco: ply.bookEco,
        fenBefore: prev.fen,
        moveUci: ply.uci!,
        pvSan: prev.lines[0] ? pvToSan(prev.fen, prev.lines[0].pv.slice(0, 5)) : [],
      });
      ply.feedback = fb.detail ? `${fb.headline} ${fb.detail}` : fb.headline;
    }
  };

  type SearchFn = (
    fen: string,
    profile: BudgetProfile,
    history?: PositionHistory,
  ) => Promise<PositionEvalResult>;

  /**
   * Critical-position rule: a first pass whose eval swings > 12 win-%
   * points versus the previous (already finalized) position, or whose best
   * move changed at the last moment, is re-analyzed at the full target
   * depth. Requires plies[idx − 1] to be final — both drivers below call
   * this strictly in ply order.
   */
  const maybeDeepen = async (
    idx: number,
    fen: string,
    prof: BudgetProfile,
    oneMove: boolean,
    current: { lines: EngineLine[]; depth: number },
    lateChange: boolean,
    search: SearchFn,
    fellOut = false,
  ): Promise<{ lines: EngineLine[]; depth: number }> => {
    if (oneMove || current.lines.length === 0 || idx === 0) return current;
    if (current.depth >= prof.targetDepth) return current;
    const prev = plies[idx - 1];
    if (!prev) return current;
    const currEval = topLineEvalWhite(current.lines, fen);
    if (
      !lateChange &&
      !fellOut &&
      !isCriticalSwing(
        { evalWhiteCp: prev.evalWhiteCp, mate: prev.mate },
        { evalWhiteCp: currEval.evalWhiteCp, mate: currEval.mate },
      )
    ) {
      return current;
    }
    const deep = await search(fen, criticalProfileFor(prof), historyFor(idx));
    if (opts.token.cancelled || deep.lines.length === 0) return current;
    void putCachedPosition(
      positionKeyV2(fen, deep.depth, opts.multiPv, engineVersion, prof.name, repTagFor(idx)),
      deep.lines,
      deep.depth,
      engineMeta.name,
    );
    return { lines: deep.lines, depth: deep.depth };
  };

  /**
   * Like-for-like depth rule (Round 2, Prompt 3): the move leading to
   * `idx` is classified by comparing plies[idx − 1]'s lines (the best
   * move's eval) with this position's eval (the played move's result).
   * If this position was cut shallower than the previous one, extend it
   * to the previous position's depth first — mismatched depths would
   * manufacture fake mistakes. Because every position is matched to its
   * predecessor before finalizing, achieved depths are non-decreasing
   * along the game (terminal and one-legal-move positions exempt: their
   * evals are exact/forced, and a terminal predecessor has depth 0,
   * which never forces an extension).
   */
  const ensureLikeForLike = async (
    idx: number,
    fen: string,
    prof: BudgetProfile,
    oneMove: boolean,
    current: { lines: EngineLine[]; depth: number },
    search: SearchFn,
  ): Promise<{ lines: EngineLine[]; depth: number }> => {
    if (oneMove || current.lines.length === 0 || idx === 0) return current;
    const prev = plies[idx - 1];
    if (!prev) return current;
    const needed = requiredDepthMatch(prev.depth, current.depth);
    if (needed === 0) return current;
    const deep = await search(fen, matchDepthProfile(prof, needed), historyFor(idx));
    if (opts.token.cancelled || deep.lines.length === 0 || deep.depth <= current.depth) {
      return current;
    }
    void putCachedPosition(
      positionKeyV2(fen, deep.depth, opts.multiPv, engineVersion, prof.name, repTagFor(idx)),
      deep.lines,
      deep.depth,
      engineMeta.name,
    );
    return { lines: deep.lines, depth: deep.depth };
  };

  /**
   * Resolve one position's lines from cache, or mark it as needing the
   * engine. The reuse rule (cache.ts) is "cached depth >= requested"; for
   * an adaptive profile the requested depth is the profile's MINIMUM depth
   * — a completed adaptive search under this profile never returns less,
   * so any same-profile entry at or above it is a finished result, and
   * deeper entries (e.g. critical re-analyses) serve as well.
   */
  const cacheLookup = async (
    fen: string,
    prof: BudgetProfile,
    repTag?: string,
  ): Promise<{ lines: EngineLine[]; depth: number } | null> => {
    const cached = await getCachedPositionForRequest(
      fen,
      opts.multiPv,
      engineVersion,
      prof.name,
      prof.minDepth,
      repTag,
    );
    if (cached && cached.lines.length > 0) return { lines: cached.lines, depth: cached.depth };
    return null;
  };

  const storeInCache = (
    fen: string,
    prof: BudgetProfile,
    res: PositionEvalResult,
    repTag?: string,
  ): void => {
    if (res.lines.length === 0) return;
    void putCachedPosition(
      positionKeyV2(fen, res.depth, opts.multiPv, engineVersion, prof.name, repTag),
      res.lines,
      res.depth,
      engineMeta.name,
    );
  };

  // A bare FEN carries no repetition history, so terminalEval alone
  // cannot see threefold/fivefold: the game's occurrence count decides.
  const terminalFor = (idx: number, fen: string): TerminalEval | null => {
    const term = terminalEval(fen);
    if (term) return term;
    if (occurrenceCount[idx] >= 3) return { evalWhiteCp: 0 };
    return null;
  };

  // --- Drivers ---------------------------------------------------------------
  if (opts.pool) {
    await runWithPool();
  } else {
    await client.newGame();
    await runSequential();
  }

  if (opts.token.cancelled) {
    progress?.dispose();
    return null;
  }
  progress?.flush();
  progress?.dispose();

  async function runSequential(): Promise<void> {
    const search: SearchFn = (fen, profile, history) =>
      analyzePositionWithBudget(
        client as EngineClientLike,
        fen,
        profile,
        opts.multiPv,
        opts.token,
        history,
      );
    for (let idx = 0; idx < totalPositions; idx++) {
      if (opts.token.cancelled) return;
      const fen = parsed.fens[idx];
      const term = terminalFor(idx, fen);
      if (term) {
        finalizePly(idx, [], 0, term);
        emitProgress(idx + 1);
        continue;
      }
      const prof = profileFor(idx);
      const oneMove = new Chess(fen).moves().length === 1;
      const effProfile = oneMove ? oneMoveProfile(prof) : prof;
      let current = await cacheLookup(fen, effProfile, repTagFor(idx));
      let lateChange = false;
      let fellOut = false;
      if (!current) {
        const res = await search(fen, effProfile, historyFor(idx));
        if (opts.token.cancelled) return;
        current = { lines: res.lines, depth: res.depth > 0 ? res.depth : effProfile.targetDepth };
        lateChange = res.lateBestMoveChange;
        fellOut = res.bestMoveFellOut;
        if (res.lines.length > 0)
          storeInCache(fen, effProfile, { ...res, depth: current.depth }, repTagFor(idx));
      }
      current = await maybeDeepen(idx, fen, prof, oneMove, current, lateChange, search, fellOut);
      if (opts.token.cancelled) return;
      current = await ensureLikeForLike(idx, fen, prof, oneMove, current, search);
      if (opts.token.cancelled) return;
      finalizePly(idx, current.lines, current.depth, null);
      emitProgress(idx + 1);
    }
  }

  async function runWithPool(): Promise<void> {
    const pool = opts.pool!;
    type Plan =
      | { kind: 'terminal'; term: TerminalEval }
      | { kind: 'ready'; lines: EngineLine[]; depth: number }
      | { kind: 'engine'; profile: BudgetProfile; oneMove: boolean };
    const plans: Plan[] = [];
    const engineRequests: {
      index: number;
      fen: string;
      multiPv: number;
      profile: BudgetProfile;
      history?: PositionHistory;
    }[] = [];

    for (let idx = 0; idx < totalPositions; idx++) {
      const fen = parsed.fens[idx];
      const term = terminalFor(idx, fen);
      if (term) {
        plans.push({ kind: 'terminal', term });
        continue;
      }
      const prof = profileFor(idx);
      const oneMove = new Chess(fen).moves().length === 1;
      const effProfile = oneMove ? oneMoveProfile(prof) : prof;
      const cached = await cacheLookup(fen, effProfile, repTagFor(idx));
      if (cached) {
        plans.push({ kind: 'ready', lines: cached.lines, depth: cached.depth });
      } else {
        plans.push({ kind: 'engine', profile: effProfile, oneMove });
        engineRequests.push({
          index: idx,
          fen,
          multiPv: opts.multiPv,
          profile: effProfile,
          history: historyFor(idx),
        });
      }
      if (opts.token.cancelled) return;
    }

    const searchViaPool: SearchFn = async (fen, profile, history) => {
      const r = await pool.submit(
        { index: -1, fen, multiPv: opts.multiPv, profile, history },
        { priority: true, token: opts.token },
      );
      return (
        r.result ?? {
          lines: [],
          depth: 0,
          lateBestMoveChange: false,
          stoppedEarly: false,
          earlyBestMove: null,
          bestMoveFellOut: false,
        }
      );
    };

    const outcomes = new Map<number, { lines: EngineLine[]; depth: number }>();
    let nextFinalize = 0;
    let drainChain: Promise<void> = Promise.resolve();
    const drainOnce = async (): Promise<void> => {
      while (nextFinalize < totalPositions && !opts.token.cancelled) {
        const idx = nextFinalize;
        const plan = plans[idx];
        if (plan.kind === 'terminal') {
          finalizePly(idx, [], 0, plan.term);
        } else if (plan.kind === 'ready') {
          // Mirror the sequential path: a cached result that turns out to
          // be critical (big swing vs the previous, now-final position) is
          // deepened at the full budget before it is finalized.
          let { lines, depth } = plan;
          const prof = profileFor(idx);
          const prev = idx > 0 ? plies[idx - 1] : undefined;
          if (prev && lines.length > 0 && depth < prof.targetDepth) {
            const currEval = topLineEvalWhite(lines, parsed.fens[idx]);
            if (
              isCriticalSwing(
                { evalWhiteCp: prev.evalWhiteCp, mate: prev.mate },
                { evalWhiteCp: currEval.evalWhiteCp, mate: currEval.mate },
              )
            ) {
              const deep = await searchViaPool(
                parsed.fens[idx],
                criticalProfileFor(prof),
                historyFor(idx),
              );
              if (opts.token.cancelled) return;
              if (deep.lines.length > 0) {
                lines = deep.lines;
                depth = deep.depth;
                storeInCache(parsed.fens[idx], prof, deep, repTagFor(idx));
              }
            }
          }
          if (!opts.token.cancelled) {
            const matched = await ensureLikeForLike(
              idx,
              parsed.fens[idx],
              prof,
              false,
              { lines, depth },
              searchViaPool,
            );
            lines = matched.lines;
            depth = matched.depth;
          }
          if (opts.token.cancelled) return;
          finalizePly(idx, lines, depth, null);
        } else {
          const outcome = outcomes.get(idx);
          if (!outcome) return; // engine result for this ply has not arrived yet
          finalizePly(idx, outcome.lines, outcome.depth, null);
        }
        nextFinalize++;
        emitProgress(nextFinalize);
      }
    };
    const drain = (): Promise<void> => {
      drainChain = drainChain.then(drainOnce);
      return drainChain;
    };

    await drain(); // leading terminal / cached positions
    if (engineRequests.length > 0) {
      await pool.analyzeAll(engineRequests, opts.token, async (plyIdx, result) => {
        const plan = plans[plyIdx];
        let current = {
          lines: result.lines,
          depth:
            result.depth > 0 ? result.depth : plan.kind === 'engine' ? plan.profile.targetDepth : 0,
        };
        if (result.lines.length > 0 && plan.kind === 'engine') {
          storeInCache(
            parsed.fens[plyIdx],
            plan.profile,
            { ...result, depth: current.depth },
            repTagFor(plyIdx),
          );
        }
        // Finalize everything before this ply so maybeDeepen sees the
        // previous position's final eval, then deepen if critical.
        await drain();
        if (plan.kind === 'engine') {
          current = await maybeDeepen(
            plyIdx,
            parsed.fens[plyIdx],
            profileFor(plyIdx),
            plan.oneMove,
            current,
            result.lateBestMoveChange,
            searchViaPool,
            result.bestMoveFellOut,
          );
          if (!opts.token.cancelled) {
            current = await ensureLikeForLike(
              plyIdx,
              parsed.fens[plyIdx],
              profileFor(plyIdx),
              plan.oneMove,
              current,
              searchViaPool,
            );
          }
        }
        outcomes.set(plyIdx, current);
        await drain();
      });
    }
    await drain();
    if (opts.token.cancelled) pool.cancelRun(opts.token);
  }

  // Game accuracy (spec 8.2, Lichess-aligned in Prompt 5): computed
  // from the accuracy win% series (evals clamped to ±1000 cp) by the
  // shared computeGameAccuracies wiring — volatility-weighted
  // arithmetic mean blended with the unweighted harmonic mean.
  const winSeriesAcc = plies.map((p) => accuracyWinPercent(p.evalWhiteCp));
  const gameAcc = computeGameAccuracies(winSeriesAcc, moverColor(parsed.startFen, 1));
  const acplFor = (color: 'w' | 'b'): number =>
    cpLoss[color].length
      ? Math.round(cpLoss[color].reduce((a, b) => a + b, 0) / cpLoss[color].length)
      : 0;

  const accW = gameAcc.white;
  const accB = gameAcc.black;

  // Opening summary (spec 9).
  let opening: GameReview['opening'];
  if (openingIndex) {
    const found = findOpening(parsed.fens, openingIndex);
    if (found) {
      opening = {
        eco: found.eco,
        name: found.name,
        leftBookAtPly: found.matchedPly < plies.length - 1 ? found.matchedPly + 1 : undefined,
        sequenceSan: parsed.moves.slice(0, found.matchedPly),
      };
    }
  }
  if (!opening && (parsed.headers.Opening || parsed.headers.ECO)) {
    opening = {
      eco: parsed.headers.ECO ?? '',
      name: parsed.headers.Opening ?? 'Unknown opening',
      sequenceSan: [],
    };
  }

  return {
    id: hashString(parsed.pgn),
    pgn: parsed.pgn,
    headers: parsed.headers,
    plies,
    accuracy: { white: accW, black: accB },
    counts,
    opening,
    termination:
      parsed.termination ??
      resolveTermination({
        finalFen: parsed.fens[parsed.fens.length - 1],
        fens: parsed.fens,
        headers: parsed.headers,
        result: parsed.result,
        meta: parsed.terminationMeta,
      }),
    performance: {
      white: performanceLabel(accW, acplFor('w'), opts.locale ?? 'en'),
      black: performanceLabel(accB, acplFor('b'), opts.locale ?? 'en'),
    },
    acpl: { white: acplFor('w'), black: acplFor('b') },
    engine: { name: engineMeta.name, depth: opts.depth, mode: engineMeta.mode },
    createdAt: Date.now(),
  };
}

function emptyCounts(): Record<MoveClass, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    forced: 0,
  };
}

function other(c: 'w' | 'b'): 'w' | 'b' {
  return c === 'w' ? 'b' : 'w';
}

function moverColor(startFen: string, plyIdx: number): 'w' | 'b' {
  const startTurn = startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return plyIdx % 2 === 1 ? startTurn : other(startTurn);
}

function clampCp(cp: number): number {
  return Math.max(-1000, Math.min(1000, cp));
}

/** One live analysis session for explored/custom positions (spec 10.8). */
export class LiveSession {
  private stopped = false;

  constructor(private client: StockfishClient) {}

  async start(
    fen: string,
    multiPv: number,
    onUpdate: (lines: EngineLine[], depth: number, nps: number) => void,
  ): Promise<EngineLine[]> {
    this.stopped = false;
    if (terminalEval(fen)) return [];
    const res = await this.client.analyze(
      { fen, depth: 24, movetimeMs: 15000, multiPv },
      (lines, depth, _nodes, nps) => {
        if (!this.stopped) onUpdate(lines, depth, nps);
      },
    );
    return res.lines;
  }

  stop(): void {
    this.stopped = true;
    this.client.stop();
  }
}
