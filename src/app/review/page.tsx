'use client';

import dynamic from 'next/dynamic';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Board } from '@/components/board/Board';
import type { ArrowDef } from '@/components/board/Arrows';
import { EvalBar } from '@/components/eval/EvalBar';
import { EvalGraph } from '@/components/eval/EvalGraph';
import SummaryTable from '@/components/review/SummaryTable';
import TerminationBanner from '@/components/review/TerminationBanner';
import type { ParsedGameWithPgn } from '@/store/gameStore';
import StatisticsPanel from '@/components/review/StatisticsPanel';
import EplChart from '@/components/review/EplChart';
import { ClassBadge } from '@/components/board/SquareBadge';
import EngineLines, { sideToMove } from '@/components/engine/EngineLines';
import EngineControls from '@/components/engine/EngineControls';
import MoveList from '@/components/moves/MoveList';
import VariationTree from '@/components/moves/VariationTree';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/ui/ThemeToggle';
// Lazy: the drawer (and framer-motion, used only by it) stays out of
// First Load JS; it mounts on first open and stays mounted after
// (Round 2, Prompt 6). The SettingsState types stay a type-only
// static import below.
const SettingsDrawer = dynamic(() => import('@/components/ui/SettingsDrawer'), { ssr: false });
import { ToastViewport, type ToastItem } from '@/components/ui/Toast';
import { currentFen, useGameStore } from '@/store/gameStore';
import { useAnalysisStore } from '@/store/analysisStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getEngineClient, getEnginePool, useEngine } from '@/hooks/useEngine';
import { estimateRemainingMs, formatEta } from '@/engine/progress';
import { formatFileSize } from '@/engine/engineManifest';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useSound, soundForMove } from '@/hooks/useSound';
import { analyzeGame, LiveSession } from '@/engine/analyzer';
import { getReview, saveReview, clearPositionCache } from '@/engine/cache';
import { requestPersistentStorage } from '@/lib/storage';
import { bookContinuations, loadOpeningIndex, type BookContinuation } from '@/analysis/openings';
import { formatPlayerClock, parseTimeControl } from '@/lib/clocks';
import { formatWdl, wdlToWhitePercentages } from '@/lib/wdl';
import { parsePgn } from '@/parsers/pgn';
import { takePendingReview } from '@/lib/startReview';
import {
  pgnFromShareHash,
  buildAnnotatedPgn,
  shareUrlForPgn,
  copyText,
  downloadText,
} from '@/lib/export';
import { DEPTH_PRESETS } from '@/lib/constants';
import type { EngineLine, MoveClass, PlyAnalysis } from '@/lib/types';
import { scoreToWhiteCp, winProb } from '@/analysis/winProbability';
import { averageAchievedDepth } from '@/analysis/depthStats';
import { performanceEstimateNote } from '@/analysis/rating';
import { formatEngineError } from '@/engine/engineErrors';
import { formatEval } from '@/lib/format';
import { capturedPieces } from '@/lib/material';
import { pieceSrc } from '@/lib/pieces';
import { hashString } from '@/lib/format';
import { useMessages } from '@/i18n/useMessages';
import { classificationLabel, classificationPhrase } from '@/i18n/helpers';
import { t as translate, type MessageKey } from '@/i18n';

const BUILD_MESSAGE_KEY: Record<'multi' | 'single' | 'lite', MessageKey> = {
  multi: 'pwa.buildFull',
  single: 'pwa.buildSingle',
  lite: 'pwa.buildLite',
};

const CRITICAL: ReadonlySet<MoveClass> = new Set([
  'brilliant',
  'great',
  'mistake',
  'blunder',
  'miss',
]);

const PRESET_MESSAGE_KEY: Record<string, MessageKey> = {
  quick: 'review.presetQuick',
  standard: 'review.presetStandard',
  deep: 'review.presetDeep',
};

/** Original flat-style coach avatar (not chess.com artwork). */
function CoachAvatar({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0" aria-hidden>
      <rect width="64" height="64" rx="10" fill="#4a6fa5" />
      <circle cx="32" cy="70" r="20" fill="#7c4a2d" />
      <circle cx="32" cy="30" r="14" fill="#c68642" />
      <path
        d="M18 30c0-10 6-16 14-16s14 6 14 16c0 2-1 3-2 3-1-6-3-9-6-11-4 2-9 2-13 0-3 2-5 5-6 11-1 0-2-1-2-3z"
        fill="#22201d"
      />
      <circle cx="27" cy="31" r="1.8" fill="#22201d" />
      <circle cx="37" cy="31" r="1.8" fill="#22201d" />
      <path
        d="M27 38c2 2.4 8 2.4 10 0"
        stroke="#22201d"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <rect
        x="23"
        y="24"
        width="8"
        height="4.6"
        rx="2.3"
        fill="none"
        stroke="#22201d"
        strokeWidth="1.3"
      />
      <rect
        x="33"
        y="24"
        width="8"
        height="4.6"
        rx="2.3"
        fill="none"
        stroke="#22201d"
        strokeWidth="1.3"
      />
    </svg>
  );
}

/** White speech bubble with a left tail, chess.com coach style. */
function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1 rounded-xl bg-[#f4f4f4] px-3.5 py-3 text-[#262522] shadow-sm">
      <span
        aria-hidden
        className="absolute -left-[7px] top-6 h-4 w-4 rotate-45 rounded-[3px] bg-[#f4f4f4]"
      />
      {children}
    </div>
  );
}

function evalOfLines(
  fen: string,
  lines: EngineLine[],
): { wp: number; text: string; mate?: number } {
  const top = lines[0];
  if (!top) return { wp: 50, text: '0.0' };
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const w = scoreToWhiteCp(top.scoreCp, top.scoreMate, turn);
  return {
    wp: w.mate !== undefined ? (w.mate >= 0 ? 100 : 0) : winProb(w.evalWhiteCp),
    text: formatEval(w.evalWhiteCp, w.mate),
    mate: w.mate,
  };
}

function PlayerBar({
  name,
  elo,
  fen,
  color,
  clockMs,
  active,
}: {
  name: string;
  elo?: string;
  fen: string;
  color: 'w' | 'b';
  clockMs?: number;
  active: boolean;
}) {
  const { t } = useMessages();
  const pieceSet = useSettingsStore((s) => s.settings.pieceSet);
  const cap = capturedPieces(fen);
  const taken = color === 'w' ? cap.byWhite : cap.byBlack;
  const diff = color === 'w' ? cap.diff : -cap.diff;
  return (
    <div
      className="flex items-center gap-2 px-1 py-1.5"
      aria-label={t('review.playerBar', { name })}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
          color === 'w' ? 'bg-[#f0f0f0] text-black' : 'bg-[#3a3834] text-white'
        }`}
        aria-hidden
      >
        {name.charAt(0).toUpperCase() || '?'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {name}
        {elo ? <span className="ml-1 font-normal text-muted">({elo})</span> : null}
      </span>
      <span className="flex items-center gap-0.5" aria-hidden>
        {taken.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={pieceSrc(pieceSet, `${color === 'w' ? 'b' : 'w'}${p.toUpperCase()}`)}
            alt=""
            className="-ml-2 h-5 w-5 first:ml-0"
            draggable={false}
          />
        ))}
        {diff > 0 && <span className="ml-1 text-xs font-semibold text-muted">+{diff}</span>}
      </span>
      {clockMs !== undefined && (
        <span
          className={`rounded px-2 py-0.5 font-mono text-sm ${active ? 'bg-hover font-bold' : 'bg-panel2 text-muted'}`}
          aria-label={t('review.clockLabel', { time: formatPlayerClock(clockMs) })}
        >
          {formatPlayerClock(clockMs)}
        </span>
      )}
    </div>
  );
}

function ReviewInner() {
  const { t, locale, formatDecimal1 } = useMessages();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const { ready: engineReady, error: engineError, loadProgress } = useEngine();
  const { play } = useSound();

  const parsed = useGameStore((s) => s.parsed);
  const review = useGameStore((s) => s.review);
  const partialPlies = useGameStore((s) => s.partialPlies);
  const analyzing = useGameStore((s) => s.analyzing);
  const progress = useGameStore((s) => s.progress);
  const currentPly = useGameStore((s) => s.currentPly);
  const orientation = useGameStore((s) => s.orientation);
  const filterClass = useGameStore((s) => s.filterClass);
  const explore = useGameStore((s) => s.explore);
  const variations = useGameStore((s) => s.variations);
  const retry = useGameStore((s) => s.retry);
  const previewUci = useGameStore((s) => s.previewUci);
  const engineName = useAnalysisStore((s) => s.engineName);
  const engineMode = useAnalysisStore((s) => s.engineMode);
  const engineBuildFile = useAnalysisStore((s) => s.engineBuildFile);
  const engineWasmSize = useAnalysisStore((s) => s.engineWasmSize);
  const engineVersion = useAnalysisStore((s) => s.engineVersion);
  const liveLines = useAnalysisStore((s) => s.liveLines);
  const liveDepth = useAnalysisStore((s) => s.liveDepth);
  const liveNps = useAnalysisStore((s) => s.liveNps);
  const liveThinking = useAnalysisStore((s) => s.liveThinking);
  const liveFen = useAnalysisStore((s) => s.liveFen);
  const showBestArrow = useAnalysisStore((s) => s.showBestArrow);
  const engineEnabled = useAnalysisStore((s) => s.engineEnabled);

  const [deepResult, setDeepResult] = useState<{
    fen: string;
    lines: EngineLine[];
    depth: number;
  } | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [positionMode, setPositionMode] = useState(false);
  const [panelMode, setPanelMode] = useState<'summary' | 'review'>('summary');
  const [explainOpen, setExplainOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const openSettings = useCallback(() => {
    setDrawerMounted(true);
    setSettingsOpen(true);
  }, []);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocked960, setBlocked960] = useState(false);
  const [recoveryGame, setRecoveryGame] = useState<ParsedGameWithPgn | null>(null);
  const [analyzeLimit, setAnalyzeLimit] = useState<number | undefined>(undefined);
  const analyzeParsedRef = useRef<
    ((game: ParsedGameWithPgn, limit?: number) => Promise<void>) | null
  >(null);
  const tokenRef = useRef({ cancelled: false });
  const analysisStartRef = useRef<number>(0);
  const liveRef = useRef<LiveSession | null>(null);
  const startedRef = useRef(false);

  const toast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  // A fresh review always opens on the summary screen (chess.com flow).
  const reviewId = review?.id;
  useEffect(() => {
    if (reviewId) {
      setPanelMode('summary');
      setExplainOpen(false);
      setDeepResult(null);
    }
  }, [reviewId]);

  const plies: PlyAnalysis[] = review?.plies ?? partialPlies;
  const displayFen = useGameStore((s) => currentFen(s));
  const exploring = !!explore;
  const currentPlyData: PlyAnalysis | null =
    !exploring && plies[currentPly] ? plies[currentPly] : null;

  // ----- Load pending input + run analysis ---------------------------------
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const store = useGameStore.getState();

    const analyzeParsed = async (game: ParsedGameWithPgn, limit?: number) => {
      // Instant reopen from a saved review (full-game runs only).
      if (limit === undefined) {
        const saved = await getReview(hashString(game.pgn));
        if (saved) {
          store.setReview(saved);
          return;
        }
      }
      store.setAnalyzing(true);
      tokenRef.current = { cancelled: false };
      analysisStartRef.current = Date.now();
      try {
        const client = await getEngineClient();
        let openingIndex = null;
        try {
          openingIndex = await loadOpeningIndex();
        } catch {
          openingIndex = null;
        }
        const presetName = useSettingsStore.getState().settings.depth;
        const preset = DEPTH_PRESETS[presetName];
        const engineModeNow = useAnalysisStore.getState().engineMode;
        const result = await analyzeGame(
          client,
          game,
          { name: useAnalysisStore.getState().engineName, mode: engineModeNow },
          {
            depth: preset.depth,
            movetimeMs: preset.movetimeMs,
            multiPv: useSettingsStore.getState().settings.multiPv,
            openingIndex,
            token: tokenRef.current,
            presetName,
            classificationProfile:
              useSettingsStore.getState().settings.classification ?? 'balanced',
            locale: useSettingsStore.getState().settings.locale ?? 'en',
            engineVersion: useAnalysisStore.getState().engineVersion,
            // Single/lite mode analyzes through the parallel pool;
            // multi-thread mode uses exactly one client (null pool).
            pool: getEnginePool(engineModeNow),
            maxPlies: limit,
            onProgress: (p, done, total) => {
              useGameStore.getState().setPartialPlies(p, done, total);
            },
          },
        );
        if (result && !tokenRef.current.cancelled) {
          store.setReview(result);
          void saveReview(result);
          // First saved review asks the browser to keep storage persistent
          // (Prompt 9) so saved reviews aren't evicted under storage pressure.
          void requestPersistentStorage();
          play('end');
        }
      } catch (e) {
        if (!tokenRef.current.cancelled) {
          // Engine failures arrive as structured errors and are
          // localized here; anything else keeps its raw message.
          setLoadError(
            e instanceof Error ? formatEngineError(locale, e) : t('review.analysisFailed'),
          );
        }
      } finally {
        store.setAnalyzing(false);
      }
    };
    analyzeParsedRef.current = analyzeParsed;

    const runAnalysis = async (pgn: string) => {
      let games;
      try {
        games = parsePgn(pgn, locale);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t('review.couldNotParsePgn'));
        return;
      }
      if (games.length === 0) {
        setLoadError(t('review.noGameFound'));
        return;
      }
      const game = games[0];
      store.loadParsed(game);
      // Chess960 is never analyzed as standard chess (see README).
      if (game.isChess960) {
        setBlocked960(true);
        return;
      }
      // Truncated/corrupt PGN: offer the valid prefix before analyzing.
      if (game.parseError) {
        setRecoveryGame(game);
        return;
      }
      await analyzeParsed(game);
    };

    const pending = takePendingReview();
    const hashPgn = typeof window !== 'undefined' ? pgnFromShareHash(window.location.hash) : null;
    // Randomize after every game (Themes & Presets): a freshly submitted
    // game (PGN/FEN/share link — not a saved review being reopened) gets
    // a random theme combination when the user opted in.
    if (pending?.pgn || pending?.fen || (!pending && hashPgn)) {
      const current = useSettingsStore.getState().settings;
      if (current.randomizeThemesAfterGame) {
        // Lazy chunk: the preset registry stays out of First Load JS.
        void import('@/themes/presets').then(({ randomSelection }) => {
          useSettingsStore.getState().update(randomSelection());
        });
      }
    }
    if (pending?.reviewId) {
      void getReview(pending.reviewId).then(async (r) => {
        if (!r) {
          setLoadError(t('review.savedReviewNotFound'));
          return;
        }
        try {
          const games = parsePgn(r.pgn, locale);
          if (games.length > 0) store.loadParsed(games[0]);
        } catch {
          // review still displays without parsed data
        }
        store.setReview(r);
      });
    } else if (pending?.pgn) {
      void runAnalysis(pending.pgn);
    } else if (pending?.fen) {
      setPositionMode(true);
      store.loadParsed({
        headers: {
          Event: t('review.positionEvent'),
          White: t('common.white'),
          Black: t('common.black'),
          Result: '*',
        },
        moves: [],
        fens: [pending.fen],
        startFen: pending.fen,
        clocksMs: [],
        result: '*',
        pgn: '',
      });
    } else if (hashPgn) {
      void runAnalysis(hashPgn);
    } else {
      setLoadError(t('review.noGameProvided'));
    }

    return () => {
      tokenRef.current.cancelled = true;
      liveRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Live analysis for explored / custom positions ----------------------
  const mainLineFen = useMemo(() => {
    if (exploring || positionMode) return null;
    return plies[currentPly]?.fen ?? null;
  }, [exploring, positionMode, plies, currentPly]);

  useEffect(() => {
    const store = useAnalysisStore.getState();
    if (!engineEnabled || analyzing || !engineReady) {
      store.setLiveThinking(false);
      return;
    }
    if (mainLineFen && displayFen === mainLineFen) {
      store.clearLive();
      return;
    }
    let cancelled = false;
    store.setLiveThinking(true);
    const t = setTimeout(() => {
      void (async () => {
        const client = await getEngineClient();
        if (cancelled) return;
        const session = new LiveSession(client);
        liveRef.current = session;
        const lines = await session.start(displayFen, settings.multiPv, (l, d, nps) => {
          if (!cancelled) useAnalysisStore.getState().setLive(displayFen, l, d, nps);
        });
        if (!cancelled) {
          useAnalysisStore
            .getState()
            .setLive(displayFen, lines, lines[0]?.depth ?? 0, lines[0]?.nps ?? 0);
          useAnalysisStore.getState().setLiveThinking(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
      liveRef.current?.stop();
      useAnalysisStore.getState().setLiveThinking(false);
    };
  }, [displayFen, mainLineFen, engineEnabled, analyzing, engineReady, settings.multiPv]);

  // ----- Derived display data ------------------------------------------------
  const isLivePosition =
    exploring ||
    positionMode ||
    (mainLineFen !== null && displayFen !== mainLineFen) ||
    (!!liveFen && liveFen === displayFen && liveLines.length > 0);
  // A per-move deeper re-analysis (fixed depth 24) of the current
  // main-line position, when present, replaces the review's own lines.
  const deepForCurrent =
    deepResult && deepResult.fen === displayFen && !exploring && !positionMode ? deepResult : null;
  const shownLines: EngineLine[] = useMemo(
    () =>
      deepForCurrent
        ? deepForCurrent.lines
        : isLivePosition
          ? liveLines
          : (currentPlyData?.lines ?? []),
    [deepForCurrent, isLivePosition, liveLines, currentPlyData],
  );
  const shownDepth = deepForCurrent
    ? deepForCurrent.depth
    : isLivePosition
      ? liveDepth
      : (currentPlyData?.depth ?? 0);

  // White-perspective WDL label for the EvalBar tooltip (Prompt 6): from
  // the current position's top engine line; undefined when it has no WDL.
  const wdlText = useMemo(() => {
    const top = shownLines[0];
    if (!top?.wdl) return undefined;
    const fen = isLivePosition ? displayFen : (currentPlyData?.fen ?? displayFen);
    const pct = wdlToWhitePercentages(top.wdl, sideToMove(fen));
    return pct ? formatWdl(pct) : undefined;
  }, [shownLines, isLivePosition, displayFen, currentPlyData]);

  // Book continuations at the position where the game left the book.
  const [continuations, setContinuations] = useState<BookContinuation[] | null>(null);
  const openingForContinuations = review?.opening;
  useEffect(() => {
    if (
      !openingForContinuations?.leftBookAtPly ||
      openingForContinuations.sequenceSan.length === 0
    ) {
      setContinuations(null);
      return;
    }
    let cancelled = false;
    void loadOpeningIndex().then((index) => {
      if (!cancelled)
        setContinuations(bookContinuations(openingForContinuations.sequenceSan, index));
    });
    return () => {
      cancelled = true;
    };
  }, [openingForContinuations]);

  const evalDisplay = useMemo(() => {
    if (isLivePosition) return evalOfLines(displayFen, liveLines);
    if (currentPlyData) {
      return {
        wp: currentPlyData.winProbWhite,
        text:
          currentPlyData.ply === plies.length - 1 && parsed?.result && parsed.result !== '*'
            ? currentPlyData.mate === 0
              ? parsed.result
              : formatEval(currentPlyData.evalWhiteCp, currentPlyData.mate)
            : formatEval(currentPlyData.evalWhiteCp, currentPlyData.mate),
        mate: currentPlyData.mate,
      };
    }
    return { wp: 50, text: '0.0', mate: undefined as number | undefined };
  }, [isLivePosition, displayFen, liveLines, currentPlyData, plies.length, parsed?.result]);

  const arrows: ArrowDef[] = useMemo(() => {
    if (!settings.showArrows || !showBestArrow) return [];
    const out: ArrowDef[] = [];
    if (!exploring && !positionMode && currentPly >= 1) {
      const prev = plies[currentPly - 1];
      const best = prev?.lines[0]?.pv[0];
      if (best)
        out.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: '#81b64c', width: 0.32 });
    } else {
      const best = shownLines[0]?.pv[0];
      if (best)
        out.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: '#81b64c', width: 0.32 });
      const second = shownLines[1]?.pv[0];
      if (second)
        out.push({
          from: second.slice(0, 2),
          to: second.slice(2, 4),
          color: '#81b64c',
          width: 0.16,
          opacity: 0.45,
        });
    }
    return out;
  }, [settings.showArrows, showBestArrow, exploring, positionMode, currentPly, plies, shownLines]);

  const badge = useMemo(() => {
    if (exploring || !currentPlyData?.classification || !currentPlyData.uci) return null;
    return {
      square: currentPlyData.uci.slice(2, 4),
      classification: currentPlyData.classification,
      reason: currentPlyData.reason,
    };
  }, [exploring, currentPlyData]);

  const lastMove = useMemo(() => {
    if (previewUci && previewUci.length > 0) {
      const last = previewUci[previewUci.length - 1];
      return { from: last.slice(0, 2), to: last.slice(2, 4) };
    }
    if (exploring && explore && explore.chain.length > 0) {
      let node = variations.find((v) => v.id === explore.chain[0]);
      for (const id of explore.chain.slice(1)) node = node?.children.find((c) => c.id === id);
      if (node) return { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) };
      return null;
    }
    if (currentPlyData?.uci) {
      return { from: currentPlyData.uci.slice(0, 2), to: currentPlyData.uci.slice(2, 4) };
    }
    return null;
  }, [previewUci, exploring, explore, variations, currentPlyData]);

  // ----- Sounds on navigation -------------------------------------------------
  const prevPlyRef = useRef(currentPly);
  useEffect(() => {
    if (prevPlyRef.current !== currentPly) {
      prevPlyRef.current = currentPly;
      const ply = plies[currentPly];
      if (ply?.san) {
        const chess = new Chess(ply.fen);
        play(
          soundForMove(ply.san, {
            capture: ply.san.includes('x'),
            castle: ply.san.startsWith('O-O'),
            promotion: ply.san.includes('='),
            check: ply.san.includes('+') || ply.san.includes('#'),
            gameEnd: chess.isCheckmate() || chess.isStalemate() || chess.isDraw(),
          }),
        );
      }
    }
  }, [currentPly, plies, play]);

  // ----- Actions ---------------------------------------------------------------
  const store = useGameStore;

  const onUserMove = useCallback(
    (uci: string): boolean => {
      const s = store.getState();
      if (s.retry) {
        const target = s.review?.plies[s.currentPly + 1];
        const base = s.review?.plies[s.currentPly];
        let verdict: 'best' | 'better' | 'again' = 'again';
        if (target && base) {
          if (target.bestMoveUci === uci) verdict = 'best';
          else {
            const line = base.lines.find((l) => l.pv[0] === uci);
            if (line && base.lines[0]) {
              const bestWp = winProb(base.lines[0].scoreCp ?? 0);
              const playedWp =
                line.scoreMate !== undefined
                  ? line.scoreMate > 0
                    ? 100
                    : 0
                  : winProb(line.scoreCp ?? 0);
              if ((bestWp - playedWp) / 100 <= 0.05) verdict = 'better';
            }
          }
        }
        s.setRetry({ ...s.retry, verdict });
        play(verdict === 'again' ? 'illegal' : 'move');
        return true;
      }
      const ok = s.playUserMove(uci);
      if (ok) play('move');
      return ok;
    },
    [play, store],
  );

  const nextCritical = useCallback(
    (dir: 1 | -1) => {
      const s = store.getState();
      const list = s.review?.plies ?? s.partialPlies;
      let p = s.currentPly + dir;
      while (p >= 1 && p < list.length) {
        const c = list[p].classification;
        if (c && CRITICAL.has(c)) {
          s.goToPly(p);
          return;
        }
        p += dir;
      }
    },
    [store],
  );

  const stepClass = useCallback(
    (dir: 1 | -1) => {
      const s = store.getState();
      const fc = s.filterClass;
      if (!fc) return;
      const list = s.review?.plies ?? s.partialPlies;
      let p = s.currentPly + dir;
      while (p >= 1 && p < list.length) {
        if (list[p].classification === fc) {
          s.goToPly(p);
          return;
        }
        p += dir;
      }
    },
    [store],
  );

  const startRetry = useCallback(() => {
    const s = store.getState();
    if (currentPly < 1) return;
    s.setRetry({ basePly: currentPly - 1, verdict: 'waiting' });
    s.goToPly(currentPly - 1);
  }, [currentPly, store]);

  const keyboardMap = useMemo(
    () => ({
      ArrowLeft: () => store.getState().step(-1),
      ArrowRight: () => store.getState().step(1),
      ArrowUp: () => store.getState().goToPly(0),
      ArrowDown: () =>
        store
          .getState()
          .goToPly(
            (store.getState().review?.plies.length ?? store.getState().parsed?.fens.length ?? 1) -
              1,
          ),
      Home: () => store.getState().goToPly(0),
      End: () =>
        store
          .getState()
          .goToPly(
            (store.getState().review?.plies.length ?? store.getState().parsed?.fens.length ?? 1) -
              1,
          ),
      f: () => store.getState().flip(),
      ' ': () =>
        useAnalysisStore.getState().setEngineEnabled(!useAnalysisStore.getState().engineEnabled),
      b: () =>
        useAnalysisStore.getState().setShowBestArrow(!useAnalysisStore.getState().showBestArrow),
      j: () => nextCritical(1),
      k: () => nextCritical(-1),
      r: () => startRetry(),
      m: () => updateSettings({ sounds: !settings.sounds }),
      Escape: () => {
        const s = store.getState();
        if (s.retry) s.setRetry(null);
        else if (s.previewUci) s.setPreviewUci(null);
        else if (s.explore) s.exitExplore();
        setSettingsOpen(false);
      },
    }),
    [nextCritical, startRetry, settings.sounds, store, updateSettings],
  );
  useKeyboard(keyboardMap);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const cancelAnalysis = () => {
    tokenRef.current.cancelled = true;
    void getEngineClient().then((c) => c.stop());
    // Stop every pool worker too (no-op in multi-thread mode: no pool).
    getEnginePool(useAnalysisStore.getState().engineMode)?.cancelRun(tokenRef.current);
    store.getState().setAnalyzing(false);
  };

  const retryAvailable =
    !!currentPlyData?.classification &&
    (CRITICAL.has(currentPlyData.classification) || currentPlyData.classification === 'inaccuracy');

  // Per-move "re-analyze deeper": a fixed depth-24 look at the current
  // position (the same depth/movetime the live explorer uses), shown in
  // the engine-lines panel. The stored review is not rewritten.
  const reanalyzeDeeper = useCallback(async () => {
    if (deepBusy) return;
    const fen = displayFen;
    setDeepBusy(true);
    try {
      const client = await getEngineClient();
      const res = await client.analyze({
        fen,
        depth: 24,
        movetimeMs: 15000,
        multiPv: settings.multiPv,
      });
      setDeepResult({
        fen,
        lines: res.lines,
        depth: res.lines.reduce((m, l) => Math.max(m, l.depth), 0),
      });
      setExplainOpen(true);
    } catch {
      toast(t('review.analysisFailed'), 'error');
    } finally {
      setDeepBusy(false);
    }
  }, [deepBusy, displayFen, settings.multiPv, t, toast]);

  const avgDepth = review ? averageAchievedDepth(review.plies) : null;

  const headers = review?.headers ?? parsed?.headers ?? {};
  const baseTimeMs = parseTimeControl(headers.TimeControl)?.baseMs ?? null;
  const topColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor = orientation;
  const nameFor = (c: 'w' | 'b') =>
    c === 'w' ? (headers.White ?? t('common.white')) : (headers.Black ?? t('common.black'));
  const eloFor = (c: 'w' | 'b') => (c === 'w' ? headers.WhiteElo : headers.BlackElo);
  const clockFor = (c: 'w' | 'b'): number | undefined => {
    // Clock of the last move played by that color at the current ply.
    for (let p = currentPly; p >= 1; p--) {
      if (plies[p]?.color === c && plies[p]?.clockMs !== undefined) return plies[p].clockMs;
    }
    return undefined;
  };

  // Estimated time remaining from the observed completion rate (progress
  // updates are throttled to ≤10/s by the analyzer, which also re-renders us).
  const etaMs =
    analyzing && progress
      ? estimateRemainingMs(Date.now() - analysisStartRef.current, progress.done, progress.total)
      : null;
  const etaText = etaMs !== null && etaMs > 2000 ? formatEta(etaMs) : null;

  const termination = review?.termination ?? parsed?.termination;
  const finalResultMarker =
    termination && termination.result !== '*' ? termination.result : undefined;
  const atFinalPly = plies.length > 1 && currentPly === plies.length - 1 && !exploring;

  if (blocked960) {
    return (
      <div className="grid min-h-screen place-items-center bg-page p-4 text-ink">
        <div
          className="max-w-md rounded-base bg-panel p-6 text-center"
          data-testid="chess960-blocked"
        >
          <span className="inline-block rounded bg-panel2 px-2 py-0.5 text-xs font-semibold text-muted">
            {t('termination.chess960Label')}
          </span>
          <h1 className="mt-2 text-lg font-bold">{t('termination.chess960Title')}</h1>
          <p className="mt-2 text-sm text-muted">{t('termination.chess960Body')}</p>
          <Link href="/" className="mt-4 inline-block">
            <Button>{t('review.backToInput')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center bg-page p-4 text-ink">
        <div className="max-w-md rounded-base bg-panel p-6 text-center">
          <h1 className="text-lg font-bold">{t('review.couldNotStart')}</h1>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          {engineError && (
            <p className="mt-1 text-sm text-red-400">
              {t('review.enginePrefix', { error: engineError })}
            </p>
          )}
          <Link href="/" className="mt-4 inline-block">
            <Button>{t('review.backToInput')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-base bg-accent text-xl font-black text-white shadow-[0_3px_0_var(--accent-shadow)]">
            ♞
          </span>
          <span className="text-lg font-bold tracking-tight">{t('common.appName')}</span>
        </Link>
        <div className="flex items-center gap-2">
          {analyzing && (
            <Button variant="danger" size="sm" onClick={cancelAnalysis}>
              {t('review.cancelAnalysis')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => router.push('/')}>
            {t('review.newGame')}
          </Button>
          <ThemeToggle
            theme={settings.theme}
            onToggle={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          />
          <Button variant="secondary" size="sm" onClick={openSettings}>
            {t('common.settings')}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1320px] items-start gap-4 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_430px]">
        {/* Board column */}
        <div className="mx-auto flex w-full max-w-[820px] gap-2">
          <div className="hidden sm:block">
            <EvalBar
              winProbWhite={evalDisplay.wp}
              evalText={evalDisplay.text}
              orientation={orientation}
              mate={evalDisplay.mate}
              wdlText={wdlText}
              resultMarker={atFinalPly ? finalResultMarker : undefined}
            />
          </div>
          <div className="w-full" style={{ maxWidth: settings.boardSizePx }}>
            <PlayerBar
              name={nameFor(topColor)}
              elo={eloFor(topColor)}
              fen={displayFen}
              color={topColor}
              clockMs={clockFor(topColor)}
              active={plies[currentPly]?.color === topColor}
            />
            <div className="sm:hidden">
              <EvalBar
                winProbWhite={evalDisplay.wp}
                evalText={evalDisplay.text}
                orientation={orientation}
                mate={evalDisplay.mate}
                wdlText={wdlText}
                resultMarker={atFinalPly ? finalResultMarker : undefined}
                horizontal
              />
            </div>
            <div
              onTouchStart={(e) => {
                const t = e.touches[0];
                (e.currentTarget as HTMLDivElement).dataset.swipeX = String(t.clientX);
              }}
              onTouchEnd={(e) => {
                const startX = Number((e.currentTarget as HTMLDivElement).dataset.swipeX ?? 'NaN');
                const endX = e.changedTouches[0].clientX;
                if (!Number.isNaN(startX) && Math.abs(endX - startX) > 48) {
                  store.getState().step(endX < startX ? 1 : -1);
                }
              }}
            >
              <Board
                fen={displayFen}
                orientation={orientation}
                interactive
                onUserMove={onUserMove}
                lastMove={lastMove}
                suggestionArrows={arrows}
                badge={badge}
                boardTheme={settings.boardTheme}
                coordinates={settings.coordinates}
                animationMs={settings.animationMs}
              />
            </div>
            <PlayerBar
              name={nameFor(bottomColor)}
              elo={eloFor(bottomColor)}
              fen={displayFen}
              color={bottomColor}
              clockMs={clockFor(bottomColor)}
              active={plies[currentPly]?.color === bottomColor}
            />

            {/* Controls */}
            <div
              className="mt-1 flex items-center justify-center gap-1"
              role="group"
              aria-label={t('review.navigationControls')}
            >
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('review.firstMove')}
                onClick={() => store.getState().goToPly(0)}
              >
                ⏮
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('review.previousMove')}
                onClick={() => store.getState().step(-1)}
              >
                ◀
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('review.nextMove')}
                onClick={() => store.getState().step(1)}
              >
                ▶
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('review.lastMove')}
                onClick={() => store.getState().goToPly(plies.length - 1)}
              >
                ⏭
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('review.flipBoard')}
                onClick={() => store.getState().flip()}
              >
                {t('review.flipShort')}
              </Button>
              {exploring && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => store.getState().exitExplore()}
                >
                  {t('review.backToGame')}
                </Button>
              )}
            </div>

            {atFinalPly && termination && (
              <div className="mt-2">
                <TerminationBanner
                  termination={termination}
                  whiteName={nameFor('w')}
                  blackName={nameFor('b')}
                  compact
                />
              </div>
            )}

            {/* Export row */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const text = review ? buildAnnotatedPgn(review) : (parsed?.pgn ?? '');
                  void copyText(text).then((ok) =>
                    toast(
                      ok ? t('review.pgnCopied') : t('review.copyFailed'),
                      ok ? 'info' : 'error',
                    ),
                  );
                }}
              >
                {t('review.copyPgn')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void copyText(displayFen).then((ok) =>
                    toast(
                      ok ? t('review.fenCopied') : t('review.copyFailed'),
                      ok ? 'info' : 'error',
                    ),
                  );
                }}
              >
                {t('review.copyFen')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!review}
                onClick={() => {
                  if (!review) return;
                  downloadText(
                    `${(headers.White ?? 'white').replace(/\s+/g, '_')}_vs_${(headers.Black ?? 'black').replace(/\s+/g, '_')}_annotated.pgn`,
                    buildAnnotatedPgn(review),
                  );
                  toast(t('review.annotatedDownloaded'));
                }}
              >
                {t('review.downloadPgn')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!parsed?.pgn}
                onClick={() => {
                  if (!parsed?.pgn) return;
                  const url = shareUrlForPgn(parsed.pgn, window.location.origin);
                  void copyText(url).then((ok) =>
                    toast(
                      ok ? t('review.shareLinkCopied') : t('review.copyFailed'),
                      ok ? 'info' : 'error',
                    ),
                  );
                }}
              >
                {t('review.shareLink')}
              </Button>
            </div>
          </div>
        </div>

        {/* Review panel — chess.com Game Review flow */}
        <aside className="flex min-w-0 flex-col overflow-hidden rounded-base bg-panel shadow-lg lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          {/* Panel header */}
          <div className="relative flex items-center border-b border-line px-3 py-3">
            {panelMode === 'review' && !positionMode ? (
              <button
                type="button"
                onClick={() => setPanelMode('summary')}
                aria-label={t('review.backToSummary')}
                className="grid h-8 w-8 place-items-center rounded text-lg text-muted hover:bg-hover hover:text-ink"
              >
                ‹
              </button>
            ) : (
              <span
                className="grid h-8 w-8 place-items-center rounded-full bg-accent text-base text-white"
                aria-hidden
              >
                ♟
              </span>
            )}
            <h1 className="pointer-events-none absolute inset-x-0 text-center text-[17px] font-bold">
              {t('review.title')}
            </h1>
            <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 text-[11px] font-medium text-muted">
              <span>{engineName}</span>
              <span>{t(PRESET_MESSAGE_KEY[settings.depth] ?? 'review.presetStandard')}</span>
              <span>d{review?.engine.depth ?? DEPTH_PRESETS[settings.depth].depth}</span>
              {avgDepth !== null && (
                <span>{t('review.analyzedAtDepthAvg', { depth: formatDecimal1(avgDepth) })}</span>
              )}
              <span>{t(BUILD_MESSAGE_KEY[engineMode])}</span>
              {engineWasmSize && <span>{formatFileSize(engineWasmSize)}</span>}
            </span>
          </div>
          <p className="flex flex-wrap items-baseline justify-center gap-x-2.5 border-b border-line px-4 py-1.5 text-center text-xs text-muted">
            <span>
              {nameFor('w')} {t('common.vs')} {nameFor('b')}
            </span>
            {headers.Result && <span className="font-semibold text-ink">{headers.Result}</span>}
            {review?.opening && (
              <span>
                {review.opening.eco} {review.opening.name}
              </span>
            )}
          </p>
          {review && settings.depth !== 'deep' && (
            <p className="border-b border-line px-4 py-1.5 text-center text-[11px] text-muted">
              {t('review.adaptiveDepthNote')}
            </p>
          )}
          {termination && !positionMode && (
            <TerminationBanner
              termination={termination}
              whiteName={nameFor('w')}
              blackName={nameFor('b')}
            />
          )}
          {parsed && parsed.moves.length > 200 && !positionMode && (
            <div className="flex items-center justify-center gap-2 border-b border-line px-4 py-1.5 text-xs text-muted">
              <label htmlFor="analyze-limit">{t('termination.analyzeFirstLabel')}</label>
              <select
                id="analyze-limit"
                className="rounded bg-panel2 px-1.5 py-0.5 text-ink"
                value={analyzeLimit === undefined ? 'full' : String(analyzeLimit)}
                onChange={(e) => {
                  const v = e.target.value;
                  const limit = v === 'full' ? undefined : Number(v);
                  setAnalyzeLimit(limit);
                  const game = useGameStore.getState().parsed;
                  if (game && analyzeParsedRef.current) {
                    tokenRef.current.cancelled = true;
                    tokenRef.current = { cancelled: false };
                    void analyzeParsedRef.current(game, limit);
                  }
                }}
              >
                <option value="full">{t('termination.analyzeFull')}</option>
                <option value="200">{t('termination.analyzeFirst100')}</option>
                <option value="400">{t('termination.analyzeFirst200')}</option>
              </select>
            </div>
          )}
          {!engineReady && (
            <p
              className="border-b border-line px-4 py-1.5 text-center text-xs text-muted"
              role="status"
            >
              {engineError
                ? t('review.engineFailedToLoad', { error: engineError })
                : loadProgress !== null
                  ? t('review.loadingEnginePct', { pct: Math.round(loadProgress) })
                  : t('review.loadingEngine')}
            </p>
          )}

          {positionMode ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="flex items-start gap-3">
                <CoachAvatar size={52} />
                <CoachBubble>
                  <p className="text-sm leading-snug">{t('review.positionCoach')}</p>
                </CoachBubble>
              </div>
              <section aria-label={t('review.engineSection')}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-muted">{t('review.engineSection')}</h2>
                  <EngineControls
                    enabled={engineEnabled}
                    onToggle={(v) => useAnalysisStore.getState().setEngineEnabled(v)}
                    depthLabel={t('engine.depthLabel', {
                      depth: shownDepth || DEPTH_PRESETS[settings.depth].depth,
                    })}
                    mode={engineMode}
                    engineName={engineName}
                  />
                </div>
                {liveThinking && (
                  <p className="mb-1 text-xs text-muted">
                    <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-accent" />
                    {liveNps
                      ? t('review.thinkingNps', { nps: Math.round(liveNps / 1000) })
                      : t('review.thinking')}
                  </p>
                )}
                <EngineLines
                  fen={displayFen}
                  lines={engineEnabled ? shownLines : []}
                  thinking={liveThinking}
                  depth={shownDepth}
                  onPreviewPv={(moves) => store.getState().setPreviewUci(moves)}
                  onPlayPv={(moves) => {
                    store.getState().setPreviewUci(null);
                    for (const u of moves) store.getState().playUserMove(u);
                  }}
                />
              </section>
              {variations.length > 0 && (
                <div className="border-t border-line pt-2">
                  <h3 className="mb-1 text-xs font-semibold text-muted">
                    {t('review.variations')}
                  </h3>
                  <VariationTree
                    nodes={variations}
                    activeId={explore?.chain[explore.chain.length - 1] ?? null}
                    onSelect={(node) => store.getState().selectVariationNode(node.id)}
                    onDelete={(id) => store.getState().deleteVariation(id)}
                    onPromote={(id) => store.getState().promoteVariation(id)}
                  />
                </div>
              )}
            </div>
          ) : recoveryGame?.parseError ? (
            /* Truncated PGN recovery: valid prefix offered before analysis */
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="pgn-recovery">
              <div className="flex items-start gap-3">
                <CoachAvatar size={52} />
                <CoachBubble>
                  <p className="text-sm font-semibold leading-snug">
                    {t('termination.parseErrorTitle', { ply: recoveryGame.parseError.ply })}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-[#5a5751]">
                    {t('termination.parseErrorBody', {
                      san: recoveryGame.parseError.san,
                      count: recoveryGame.parseError.validMoves,
                    })}
                  </p>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-base bg-accent py-2.5 text-sm font-bold text-[#1d2b12] shadow-[0_3px_0_var(--accent-shadow)] transition hover:brightness-110"
                    onClick={() => {
                      const game = recoveryGame;
                      setRecoveryGame(null);
                      if (game && analyzeParsedRef.current) void analyzeParsedRef.current(game);
                    }}
                  >
                    {t('termination.analyzeUpTo', {
                      move: Math.max(1, Math.ceil(recoveryGame.parseError.validMoves / 2)),
                    })}
                  </button>
                </CoachBubble>
              </div>
            </div>
          ) : !review ? (
            /* Analyzing state */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start gap-3 p-4 pb-2">
                <CoachAvatar size={52} />
                <CoachBubble>
                  <p className="text-sm font-semibold leading-snug">
                    {analyzing ? t('review.analyzingGame') : t('review.gettingReady')}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-[#5a5751]">
                    {analyzing && progress
                      ? etaText
                        ? t('review.analyzingEta', {
                            done: progress.done,
                            total: progress.total,
                            eta: etaText,
                          })
                        : t('review.analyzingProgress', {
                            done: progress.done,
                            total: progress.total,
                          })
                      : t('review.fullSummaryLater')}
                  </p>
                  {analyzing && progress && (
                    <span className="mt-2 block h-1.5 overflow-hidden rounded bg-black/15">
                      <span
                        className="block h-full rounded bg-accent transition-all"
                        style={{
                          width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </CoachBubble>
              </div>
              <div className="px-2">
                <EvalGraph
                  plies={plies}
                  currentPly={currentPly}
                  onSeek={(p) => store.getState().goToPly(p)}
                  resultLabel={finalResultMarker}
                />
              </div>
              <div className="mx-4 mt-2 min-h-0 flex-1 border-t border-line max-lg:h-[340px]">
                <MoveList
                  plies={plies}
                  currentPly={currentPly}
                  onSelect={(p) => store.getState().goToPly(p)}
                  filterClass={filterClass}
                  showEval
                  baseTimeMs={baseTimeMs}
                />
              </div>
            </div>
          ) : panelMode === 'summary' ? (
            /* Summary screen */
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex items-start gap-3 p-4 pb-2">
                  <CoachAvatar />
                  <CoachBubble>
                    <p className="text-[15px] font-medium leading-snug">
                      {t('review.coachSummary')}
                    </p>
                  </CoachBubble>
                </div>

                <div className="px-2">
                  <EvalGraph
                    plies={plies}
                    currentPly={currentPly}
                    onSeek={(p) => store.getState().goToPly(p)}
                    resultLabel={finalResultMarker}
                  />
                </div>
                <EplChart
                  plies={plies}
                  onJump={(p) => {
                    store.getState().goToPly(p);
                    setPanelMode('review');
                  }}
                />

                {/* Players / accuracy table */}
                <div className="px-4 pb-1 pt-2">
                  <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-y-2">
                    <span />
                    <span className="truncate text-center text-sm font-semibold">
                      {nameFor('w')}
                    </span>
                    <span className="truncate text-center text-sm font-semibold">
                      {nameFor('b')}
                    </span>
                    <span className="text-sm font-medium text-muted">{t('review.players')}</span>
                    <span className="flex justify-center">
                      <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-md bg-[#e8e8e8] ring-2 ring-accent">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pieceSrc(settings.pieceSet, 'wP')}
                          alt={t('common.white')}
                          className="h-9 w-9"
                          draggable={false}
                        />
                      </span>
                    </span>
                    <span className="flex justify-center">
                      <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-md bg-[#3a3834]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pieceSrc(settings.pieceSet, 'bP')}
                          alt={t('common.black')}
                          className="h-9 w-9"
                          draggable={false}
                        />
                      </span>
                    </span>
                    <span className="text-sm font-medium text-muted">{t('review.accuracy')}</span>
                    <span className="flex justify-center">
                      <span className="min-w-[4.25rem] rounded-md bg-white px-2 py-1 text-center text-[15px] font-bold tabular-nums text-black">
                        {review.accuracy.white !== null
                          ? formatDecimal1(review.accuracy.white)
                          : '—'}
                      </span>
                    </span>
                    <span className="flex justify-center">
                      <span className="min-w-[4.25rem] rounded-md bg-panel2 px-2 py-1 text-center text-[15px] font-bold tabular-nums text-ink">
                        {review.accuracy.black !== null
                          ? formatDecimal1(review.accuracy.black)
                          : '—'}
                      </span>
                    </span>
                    {review.performance && (
                      <>
                        <span
                          className="text-sm font-medium text-muted"
                          title={performanceEstimateNote(locale)}
                        >
                          {t('review.performanceEstimate')}
                        </span>
                        <span className="text-center text-[13px] font-bold leading-snug text-[#7fb0d8]">
                          {review.performance.white?.label ?? '—'}
                        </span>
                        <span className="text-center text-[13px] font-bold leading-snug text-[#7fb0d8]">
                          {review.performance.black?.label ?? '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mx-4 border-t border-line" />
                <SummaryTable
                  counts={review.counts}
                  whiteName={nameFor('w')}
                  blackName={nameFor('b')}
                  activeClass={filterClass}
                  onSelectClass={(c) => {
                    store.getState().setFilterClass(c);
                    if (c) {
                      const list = review.plies;
                      const first = list.findIndex((p) => p.classification === c);
                      if (first >= 1) {
                        store.getState().goToPly(first);
                        setPanelMode('review');
                      }
                    }
                  }}
                  onStepClass={stepClass}
                />

                <StatisticsPanel
                  review={review}
                  onJump={(p) => {
                    store.getState().goToPly(p);
                    setPanelMode('review');
                  }}
                />

                {review.opening && (
                  <div className="px-4 pb-3 text-[13px] leading-relaxed text-muted">
                    <span className="font-semibold text-ink">{t('review.openingLabel')}</span>{' '}
                    {review.opening.eco} {review.opening.name}
                    {review.opening.sequenceSan.length > 0 && (
                      <span className="block truncate text-xs">
                        {review.opening.sequenceSan.join(' ')}
                      </span>
                    )}
                    {review.opening.leftBookAtPly !== undefined && (
                      <span className="mt-1.5 block">
                        {plies[review.opening.leftBookAtPly]?.san
                          ? (() => {
                              const parts = t('review.leftBookPlayed', {
                                move: Math.ceil(review.opening.leftBookAtPly / 2),
                                san: '\u0001',
                              }).split('\u0001');
                              return (
                                <>
                                  {parts[0]}
                                  <strong className="text-ink">
                                    {plies[review.opening.leftBookAtPly].san}
                                  </strong>
                                  {parts[1] ?? ''}
                                </>
                              );
                            })()
                          : `${t('review.leftBookAtMove', { move: Math.ceil(review.opening.leftBookAtPly / 2) })}.`}
                      </span>
                    )}
                    {review.opening.leftBookAtPly !== undefined &&
                      continuations !== null &&
                      (continuations.length === 0 ? (
                        <span className="mt-1 block">{t('review.noBookContinuations')}</span>
                      ) : (
                        <span className="mt-1 block">
                          <span className="font-semibold text-ink">
                            {t('review.bookContinuations')}
                          </span>
                          {continuations.map((c) => (
                            <span key={c.san} className="block text-xs">
                              {c.san} — {c.eco} {c.name}
                            </span>
                          ))}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              <div className="border-t border-line p-4">
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('review');
                    store.getState().goToPly(plies.length > 1 ? 1 : 0);
                  }}
                  // Dark text on the accent green (white is 2.41:1 — axe
                  // color-contrast, Round 2 Prompt 5; see Button.tsx).
                  className="w-full rounded-base bg-accent py-3.5 text-lg font-bold text-[#1d2b12] shadow-[0_4px_0_var(--accent-shadow)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none"
                >
                  {t('review.startReview')}
                </button>
                <p className="mt-2.5 text-center text-[11px] text-muted">
                  {engineWasmSize
                    ? t('review.engineFooter', {
                        name: engineName,
                        version: engineVersion ? ` ${engineVersion}` : '',
                        build: t(BUILD_MESSAGE_KEY[engineMode]),
                        file: engineBuildFile ? ` (${engineBuildFile})` : '',
                        size: formatFileSize(engineWasmSize),
                      })
                    : t('review.engineFooterNoSize', {
                        name: engineName,
                        version: engineVersion ? ` ${engineVersion}` : '',
                        build: t(BUILD_MESSAGE_KEY[engineMode]),
                        file: engineBuildFile ? ` (${engineBuildFile})` : '',
                      })}
                </p>
              </div>
            </>
          ) : (
            /* Review walkthrough */
            <>
              <div className="flex items-start gap-3 p-4 pb-2">
                <CoachAvatar size={56} />
                {retry ? (
                  <CoachBubble>
                    <p className="text-[15px] font-bold leading-snug">
                      {t('review.findBetterMove')}
                    </p>
                    {retry.verdict === 'waiting' && (
                      <p className="mt-0.5 text-[13px] leading-snug text-[#5a5751]">
                        {t('review.retryWeak')}
                      </p>
                    )}
                    {retry.verdict === 'best' && (
                      <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#4c7a34]">
                        {t('review.retryBest')}
                      </p>
                    )}
                    {retry.verdict === 'better' && (
                      <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#4c7a34]">
                        {t('review.retryBetter')}
                      </p>
                    )}
                    {retry.verdict === 'again' && (
                      <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#b96a12]">
                        {t('review.retryAgain')}
                      </p>
                    )}
                    <span className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = review?.plies[retry.basePly + 1];
                          if (target?.bestMoveUci) {
                            store.getState().setPreviewUci([target.bestMoveUci]);
                            useAnalysisStore.getState().setShowBestArrow(true);
                          }
                        }}
                        className="rounded bg-[#262522] px-2.5 py-1 text-xs font-semibold text-white hover:bg-black"
                      >
                        {t('review.showSolution')}
                      </button>
                      <button
                        type="button"
                        onClick={() => store.getState().setRetry(null)}
                        className="rounded bg-black/10 px-2.5 py-1 text-xs font-semibold text-[#262522] hover:bg-black/20"
                      >
                        {t('review.skip')}
                      </button>
                    </span>
                  </CoachBubble>
                ) : (
                  <CoachBubble>
                    {currentPlyData && currentPlyData.ply >= 1 && currentPlyData.san ? (
                      <>
                        <span className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[15px] font-bold leading-snug">
                            {currentPlyData.classification && (
                              <ClassBadge
                                classification={currentPlyData.classification}
                                size={20}
                              />
                            )}
                            {currentPlyData.classification
                              ? t('feedback.moveIsPhraseNoPeriod', {
                                  san: currentPlyData.san,
                                  phrase: classificationPhrase(
                                    locale,
                                    currentPlyData.classification,
                                  ),
                                })
                              : t('feedback.played', { san: currentPlyData.san })}
                          </span>
                          <span className="shrink-0 rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums">
                            {formatEval(currentPlyData.evalWhiteCp, currentPlyData.mate)}
                          </span>
                        </span>
                        <span className="mt-1 block text-[13.5px] leading-snug text-[#3d3b37]">
                          {currentPlyData.feedback ??
                            (currentPlyData.classification
                              ? t('feedback.moveIsPhrase', {
                                  san: currentPlyData.san,
                                  phrase: classificationPhrase(
                                    locale,
                                    currentPlyData.classification,
                                  ),
                                })
                              : '')}
                        </span>
                        {currentPlyData.bestMoveSan &&
                          currentPlyData.classification &&
                          (CRITICAL.has(currentPlyData.classification) ||
                            currentPlyData.classification === 'inaccuracy') && (
                            <span className="mt-1 block text-[13.5px] leading-snug text-[#3d3b37]">
                              {(() => {
                                const parts = t('review.bestWas', { best: '\u0001' }).split(
                                  '\u0001',
                                );
                                return (
                                  <>
                                    {parts[0]}
                                    <strong>{currentPlyData.bestMoveSan}</strong>
                                    {parts[1] ?? ''}
                                  </>
                                );
                              })()}
                            </span>
                          )}
                      </>
                    ) : (
                      <>
                        <span className="block text-[15px] font-bold leading-snug">
                          {t('review.startingPosition')}
                        </span>
                        <span className="mt-1 block text-[13.5px] leading-snug text-[#3d3b37]">
                          {t('review.startingHint')}
                        </span>
                      </>
                    )}
                  </CoachBubble>
                )}
              </div>

              {/* Explain / Next */}
              <div className="flex gap-2 px-4 pb-1">
                <button
                  type="button"
                  onClick={() => setExplainOpen((v) => !v)}
                  aria-expanded={explainOpen}
                  className={`flex-1 rounded-base py-2.5 text-[15px] font-bold transition ${
                    explainOpen ? 'bg-hover text-ink' : 'bg-panel2 text-ink hover:bg-hover'
                  }`}
                >
                  {t('review.explain')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentPly >= plies.length - 1) setPanelMode('summary');
                    else store.getState().step(1);
                  }}
                  className="flex-1 rounded-base bg-accent py-2.5 text-[15px] font-bold text-[#1d2b12] shadow-[0_3px_0_var(--accent-shadow)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none"
                >
                  {currentPly >= plies.length - 1 ? t('review.finish') : t('review.next')}
                </button>
              </div>
              {(retryAvailable || currentPlyData?.bestMoveSan || currentPlyData) && !retry && (
                <div className="flex flex-wrap gap-3 px-4 pb-1 text-[13px] font-semibold">
                  {currentPlyData?.bestMoveSan && (
                    <button
                      type="button"
                      onClick={() => useAnalysisStore.getState().setShowBestArrow(!showBestArrow)}
                      className="text-accent hover:underline"
                    >
                      {showBestArrow ? t('review.hideBestMove') : t('review.showBestMove')}
                    </button>
                  )}
                  {retryAvailable && (
                    <button
                      type="button"
                      onClick={startRetry}
                      className="text-accent hover:underline"
                    >
                      {t('review.retryThisMove')}
                    </button>
                  )}
                  {currentPlyData && (
                    <button
                      type="button"
                      onClick={() => void reanalyzeDeeper()}
                      disabled={deepBusy}
                      className="text-accent hover:underline disabled:opacity-50"
                    >
                      {deepBusy
                        ? t('review.reanalyzingDeeper', { depth: 24 })
                        : t('review.reanalyzeDeeper')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => nextCritical(1)}
                    className="text-muted hover:underline"
                  >
                    {t('review.nextCriticalMoment')}
                  </button>
                </div>
              )}

              {explainOpen && (
                <section
                  className="mx-4 mt-2 rounded-base bg-panel2 p-3"
                  aria-label={t('review.engineExplanation')}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-muted">{t('review.engineLines')}</h2>
                    <EngineControls
                      enabled={engineEnabled}
                      onToggle={(v) => useAnalysisStore.getState().setEngineEnabled(v)}
                      depthLabel={t('engine.depthLabel', {
                        depth: shownDepth || DEPTH_PRESETS[settings.depth].depth,
                      })}
                      mode={engineMode}
                      engineName={engineName}
                    />
                  </div>
                  {liveThinking && (
                    <p className="mb-1 text-xs text-muted">
                      <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-accent" />
                      {liveNps
                        ? t('review.thinkingNps', { nps: Math.round(liveNps / 1000) })
                        : t('review.thinking')}
                    </p>
                  )}
                  {deepForCurrent && (
                    <p className="mb-1 text-xs font-semibold text-accent">
                      {t('review.deeperResult', { depth: deepForCurrent.depth })}
                    </p>
                  )}
                  <EngineLines
                    fen={displayFen}
                    lines={engineEnabled ? shownLines : []}
                    thinking={liveThinking}
                    depth={shownDepth}
                    onPreviewPv={(moves) => store.getState().setPreviewUci(moves)}
                    onPlayPv={(moves) => {
                      store.getState().setPreviewUci(null);
                      for (const u of moves) store.getState().playUserMove(u);
                    }}
                  />
                </section>
              )}

              {/* Move list */}
              <div className="mx-2 mt-2 min-h-0 flex-1 max-lg:h-[340px]">
                <MoveList
                  plies={plies}
                  currentPly={currentPly}
                  onSelect={(p) => store.getState().goToPly(p)}
                  filterClass={filterClass}
                  showEval
                  baseTimeMs={baseTimeMs}
                />
              </div>
              {variations.length > 0 && (
                <div className="max-h-36 overflow-y-auto border-t border-line px-4 py-2">
                  <h3 className="mb-1 text-xs font-semibold text-muted">
                    {t('review.variations')}
                  </h3>
                  <VariationTree
                    nodes={variations}
                    activeId={explore?.chain[explore.chain.length - 1] ?? null}
                    onSelect={(node) => store.getState().selectVariationNode(node.id)}
                    onDelete={(id) => store.getState().deleteVariation(id)}
                    onPromote={(id) => store.getState().promoteVariation(id)}
                  />
                </div>
              )}

              <div className="border-t border-line px-2 pt-1">
                <EvalGraph
                  plies={plies}
                  currentPly={currentPly}
                  onSeek={(p) => store.getState().goToPly(p)}
                  resultLabel={finalResultMarker}
                />
              </div>

              {/* Bottom nav + summary/share */}
              <div className="border-t border-line p-2">
                <div
                  className="grid grid-cols-5 gap-1.5"
                  role="group"
                  aria-label={t('review.reviewNavigation')}
                >
                  <button
                    type="button"
                    onClick={() => store.getState().goToPly(0)}
                    aria-label={t('review.firstMove')}
                    className="rounded-base bg-panel2 py-2.5 text-lg text-ink transition hover:bg-hover"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={() => store.getState().step(-1)}
                    aria-label={t('review.previousMove')}
                    className="rounded-base bg-panel2 py-2.5 text-lg text-ink transition hover:bg-hover"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => store.getState().step(1)}
                    aria-label={t('review.nextMove')}
                    className="rounded-base bg-panel2 py-2.5 text-lg text-ink transition hover:bg-hover"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => store.getState().goToPly(plies.length - 1)}
                    aria-label={t('review.lastMove')}
                    className="rounded-base bg-panel2 py-2.5 text-lg text-ink transition hover:bg-hover"
                  >
                    ⏭
                  </button>
                  <button
                    type="button"
                    onClick={() => store.getState().flip()}
                    aria-label={t('review.flipBoard')}
                    className="rounded-base bg-panel2 py-2.5 text-lg text-ink transition hover:bg-hover"
                  >
                    ⇅
                  </button>
                </div>
                <div className="flex items-center justify-center gap-8 pt-2 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setPanelMode('summary')}
                    className="text-muted transition hover:text-ink"
                  >
                    {t('review.summary')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!parsed?.pgn) return;
                      const url = shareUrlForPgn(parsed.pgn, window.location.origin);
                      void copyText(url).then((ok) =>
                        toast(
                          ok ? t('review.shareLinkCopied') : t('review.copyFailed'),
                          ok ? 'info' : 'error',
                        ),
                      );
                    }}
                    className="text-muted transition hover:text-ink"
                  >
                    {t('review.share')}
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </main>

      <div aria-live="polite" className="sr-only">
        {currentPlyData?.san
          ? currentPlyData.classification
            ? t('review.liveMoveClassified', {
                move: Math.ceil(currentPlyData.ply / 2),
                san: currentPlyData.san,
                classification: classificationLabel(locale, currentPlyData.classification),
              })
            : t('review.liveMove', {
                move: Math.ceil(currentPlyData.ply / 2),
                san: currentPlyData.san,
              })
          : ''}
      </div>

      {drawerMounted && (
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onChange={updateSettings}
          onClearCache={() => {
            void clearPositionCache();
            toast(t('review.engineCacheCleared'));
          }}
        />
      )}
      <ToastViewport toasts={toasts} />
    </div>
  );
}

export default function ReviewPage() {
  const locale = useSettingsStore((s) => s.settings.locale) ?? 'en';
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-page text-ink">
          <p className="text-muted">{translate(locale, 'review.loadingReview')}</p>
        </div>
      }
    >
      <ReviewInner />
    </Suspense>
  );
}
