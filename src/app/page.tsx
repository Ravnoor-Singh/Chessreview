'use client';

import dynamic from 'next/dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import InputTabs, { type InputTab } from '@/components/input/InputTabs';
import PgnInput from '@/components/input/PgnInput';
import FenInput from '@/components/input/FenInput';
import LinkInput from '@/components/input/LinkInput';
import ChesscomUsernamePrompt from '@/components/input/ChesscomUsernamePrompt';
import RecentGamesPicker from '@/components/input/RecentGamesPicker';
import ImageInput from '@/components/input/ImageInput';
import BoardEditor from '@/components/input/BoardEditor';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/ui/ThemeToggle';
// Lazy: the drawer (and framer-motion, used only by it) stays out of
// First Load JS; it mounts on first open and stays mounted after
// (Round 2, Prompt 6). The SettingsState types stay a type-only
// static import below.
const SettingsDrawer = dynamic(() => import('@/components/ui/SettingsDrawer'), { ssr: false });
import { parsePgn } from '@/parsers/pgn';
import { validateFen } from '@/parsers/fen';
import { detectInput } from '@/parsers/links';
import type { ImportedGameSummary } from '@/lib/types';
import { DEPTH_PRESETS } from '@/lib/constants';
import { SAMPLE_PGN } from '@/lib/sampleGame';
import { setPendingReview } from '@/lib/startReview';
import { deleteReview, listReviews, type ReviewSummary } from '@/engine/cache';
import { clearPositionCache } from '@/engine/cache';
import { useSettingsStore } from '@/store/settingsStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { AnalysisDepth } from '@/lib/types';
import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';
import {
  CHESSCOM_USERNAME_STORAGE_KEY,
  getChesscomArchiveMonths,
  importChesscomGame,
  importChesscomUserGames,
  importLichessGame,
  searchChesscomArchiveMonth,
} from '@/lib/importApi';

const DEPTH_MESSAGE_KEY: Record<AnalysisDepth, MessageKey> = {
  quick: 'input.depthQuick',
  standard: 'input.depthStandard',
  deep: 'input.depthDeep',
};

export default function HomePage() {
  const { t, locale } = useMessages();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  const [tab, setTab] = useState<InputTab>('pgn');
  const [pgnText, setPgnText] = useState('');
  const [fenText, setFenText] = useState('');
  const [linkText, setLinkText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [linkFallback, setLinkFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  // Chess.com link import (Round 2, Prompt 2): a pasted game link first
  // asks INLINE for one player's username, then walks that player's
  // monthly archives month by month (progress + cancel below).
  const [pendingLink, setPendingLink] = useState<{ id: string; gameType: 'live' | 'daily' } | null>(
    null,
  );
  const [ccUsername, setCcUsername] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<string | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [picker, setPicker] = useState<ImportedGameSummary[] | null>(null);
  const [multiPgn, setMultiPgn] = useState<{ label: string; pgn: string }[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFen, setEditorFen] = useState(() => new Chess().fen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const openSettings = useCallback(() => {
    setDrawerMounted(true);
    setSettingsOpen(true);
  }, []);
  const [recent, setRecent] = useState<ReviewSummary[]>([]);
  const online = useOnlineStatus();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const refreshRecent = useCallback(() => {
    void listReviews().then(setRecent);
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const goReview = useCallback(
    (pending: { pgn?: string; fen?: string; reviewId?: string }) => {
      setPendingReview(pending);
      router.push('/review');
    },
    [router],
  );

  const startPgn = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError(t('input.pastePgnOrSample'));
        return;
      }
      // Smart-detect: a URL or FEN pasted into the PGN box still works.
      const detected = detectInput(trimmed);
      if (detected.type === 'fen') {
        goReview({ fen: detected.fen });
        return;
      }
      if (detected.type !== 'pgn' && detected.type !== 'unknown') {
        setLinkText(trimmed);
        setTab('link');
        void handleLink(trimmed);
        return;
      }
      try {
        const games = parsePgn(trimmed, locale);
        if (games.length === 0) {
          setError(t('input.noCompleteGame'));
          return;
        }
        if (games.length > 1) {
          setMultiPgn(
            games.map((g, i) => ({
              label: g.headers.Event
                ? t('input.gameLabel', {
                    white: g.headers.White ?? t('common.white'),
                    black: g.headers.Black ?? t('common.black'),
                    result: g.headers.Result ?? '*',
                    date: g.headers.Date ?? '',
                    event: '· ' + g.headers.Event,
                    n: i + 1,
                  })
                : t('input.gameLabelNoEvent', {
                    white: g.headers.White ?? t('common.white'),
                    black: g.headers.Black ?? t('common.black'),
                    result: g.headers.Result ?? '*',
                    date: g.headers.Date ?? '',
                    n: i + 1,
                  }),
              pgn: g.pgn,
            })),
          );
          return;
        }
        // Forward the user's original text, not games[0].pgn: for a
        // truncated PGN the parser's pgn is the re-serialized valid
        // prefix, and forwarding it would silently drop the parseError
        // (and the review page's "analyze up to move N" recovery offer).
        goReview({ pgn: trimmed });
      } catch (e) {
        setError(e instanceof Error ? e.message : t('input.couldNotParsePgn'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goReview, locale, t],
  );

  const handleLink = useCallback(
    async (raw: string) => {
      const detected = detectInput(raw.trim());
      setBusy(true);
      setError(undefined);
      setLinkFallback(false);
      try {
        if (detected.type === 'chesscom-game') {
          // Default flow (Round 2, Prompt 2): official public API only.
          // The API is organized by player, so ask inline for a username
          // (pre-filled from the last successful import, stored locally)
          // instead of calling the flag-gated callback endpoint.
          setPendingLink({ id: detected.id, gameType: detected.gameType });
          setCcUsername((prev) => {
            if (prev) return prev;
            try {
              return window.localStorage.getItem(CHESSCOM_USERNAME_STORAGE_KEY) ?? '';
            } catch {
              return '';
            }
          });
          return;
        }
        if (detected.type === 'chesscom-user' || detected.type === 'username') {
          const username = detected.username;
          const games = await importChesscomUserGames(username, locale);
          if (games.length === 0) {
            throw new Error(t('input.noRecentGamesFor', { username }));
          }
          setPicker(games);
          return;
        }
        if (detected.type === 'lichess') {
          // importLichessGame falls back to a direct lichess.org call on
          // retryable proxy failures (Prompt 11).
          const data = await importLichessGame(detected.gameId, locale);
          goReview({ pgn: data.pgn });
          return;
        }
        if (detected.type === 'pgn') {
          startPgn(raw);
          return;
        }
        if (detected.type === 'fen') {
          goReview({ fen: detected.fen });
          return;
        }
        setError(t('input.unrecognizedInput'));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('input.importFailed'));
      } finally {
        setBusy(false);
      }
    },
    [goReview, startPgn, locale, t],
  );

  const cancelArchiveSearch = useCallback(() => {
    searchAbortRef.current?.abort();
  }, []);

  /**
   * Fallback order (Round 2, Prompt 2):
   * (a) official archives search, month by month with progress + cancel;
   * (b) the callback endpoint ONLY as the server allows it — it is
   *     flag-gated (CHESSCOM_CALLBACK_ENABLED, default off → 503
   *     NOT_CONFIGURED), in which case we fall through to (c);
   * (c) the "How to get the PGN" help panel with a one-click switch to
   *     the PGN tab. Every failure message names the step that failed
   *     and what to do next.
   */
  const runArchiveSearch = useCallback(async () => {
    const link = pendingLink;
    const username = ccUsername.trim();
    if (!link || !username || searching) return;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setBusy(true);
    setError(undefined);
    setLinkFallback(false);
    try {
      let months: { year: number; month: number }[];
      try {
        months = await getChesscomArchiveMonths(username, locale, fetch, controller.signal);
      } catch (e) {
        if (controller.signal.aborted) throw e;
        setError(t('input.archiveSearchFailed', { message: e instanceof Error ? e.message : '' }));
        setLinkFallback(true);
        return;
      }
      if (months.length === 0) {
        setError(t('input.archiveSearchEmpty', { username }));
        setLinkFallback(true);
        return;
      }
      for (const m of months) {
        if (controller.signal.aborted) break;
        const label = `${m.year}-${String(m.month).padStart(2, '0')}`;
        setSearchProgress(t('input.searchingMonth', { month: label }));
        let result: { found: boolean; pgn?: string };
        try {
          result = await searchChesscomArchiveMonth(
            username,
            link.id,
            link.gameType,
            m.year,
            m.month,
            locale,
            fetch,
            controller.signal,
          );
        } catch (e) {
          if (controller.signal.aborted) throw e;
          setError(
            t('input.archiveSearchFailed', { message: e instanceof Error ? e.message : '' }),
          );
          setLinkFallback(true);
          return;
        }
        if (result.found && result.pgn) {
          // Remember the username (this device only) after a SUCCESSFUL
          // import so the next link import is one click.
          try {
            window.localStorage.setItem(CHESSCOM_USERNAME_STORAGE_KEY, username);
          } catch {
            // storage unavailable (private mode) — pre-fill just won't persist
          }
          setPendingLink(null);
          goReview({ pgn: result.pgn });
          return;
        }
      }
      if (controller.signal.aborted) {
        setError(t('input.searchCancelled'));
        return;
      }
      // (b) callback path — only succeeds when the server flag enables it.
      try {
        const data = await importChesscomGame(link.id, link.gameType, locale);
        try {
          window.localStorage.setItem(CHESSCOM_USERNAME_STORAGE_KEY, username);
        } catch {
          // see above
        }
        setPendingLink(null);
        goReview({ pgn: data.pgn });
        return;
      } catch {
        // Flag off (NOT_CONFIGURED) or callback failed: fall through to
        // the archive-search result message + (c) the PGN help panel.
      }
      setError(t('input.archiveSearchNotFound', { username }));
      setLinkFallback(true);
    } catch {
      // Aborted fetch (cancel button).
      if (controller.signal.aborted) setError(t('input.searchCancelled'));
    } finally {
      setSearching(false);
      setBusy(false);
      setSearchProgress(undefined);
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    }
  }, [pendingLink, ccUsername, searching, locale, t, goReview]);

  const startFen = useCallback(() => {
    const v = validateFen(fenText.trim(), locale);
    if (!v.valid) {
      setError(v.error);
      return;
    }
    goReview({ fen: v.fen });
  }, [fenText, goReview, locale]);

  const onReviewClick = () => {
    setError(undefined);
    setPicker(null);
    setMultiPgn(null);
    if (tab === 'pgn') startPgn(pgnText);
    else if (tab === 'fen') startFen();
    else if (tab === 'link' && pendingLink) void runArchiveSearch();
    else if (tab === 'link') void handleLink(linkText);
    else if (tab === 'image') setError(t('input.setupInEditor'));
  };

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-base bg-accent text-xl font-black text-white shadow-[0_3px_0_var(--accent-shadow)]">
            ♞
          </span>
          <span className="min-w-0 text-lg font-bold tracking-tight">{t('common.appName')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle
            theme={settings.theme}
            onToggle={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          />
          <Button variant="secondary" size="sm" onClick={openSettings}>
            {t('common.settings')}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-balance text-center text-3xl font-extrabold sm:text-4xl">
          {t('input.heroTitlePrefix')}{' '}
          <span className="text-accent">{t('input.heroTitleAccent')}</span>
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-pretty text-center text-sm text-muted">
          {t('input.heroSubtitle')}
        </p>

        <section
          className="mt-8 rounded-base bg-panel p-4 shadow-lg sm:p-5"
          aria-label={t('input.gameInputLabel')}
        >
          <InputTabs
            tab={tab}
            onChange={(t) => {
              setTab(t);
              setError(undefined);
              setLinkFallback(false);
            }}
          />
          <div className="mt-4">
            {tab === 'pgn' && (
              <PgnInput
                value={pgnText}
                onChange={setPgnText}
                onFile={(text) => {
                  setPgnText(text);
                  setError(undefined);
                }}
                onSample={() => {
                  setPgnText(SAMPLE_PGN);
                  setError(undefined);
                }}
                error={error}
              />
            )}
            {tab === 'fen' && (
              <FenInput
                value={fenText}
                onChange={setFenText}
                error={error}
                onOpenEditor={() => {
                  setEditorFen(fenText.trim() || new Chess().fen());
                  setEditorOpen(true);
                }}
              />
            )}
            {tab === 'link' && (
              <>
                <LinkInput
                  value={linkText}
                  onChange={(v) => {
                    setLinkText(v);
                    setPendingLink(null);
                    setLinkFallback(false);
                  }}
                  error={error}
                  offline={!online}
                  hint={t('input.linkHintShort')}
                  showFallback={linkFallback}
                  onSwitchToPgn={() => {
                    setLinkFallback(false);
                    setError(undefined);
                    setPendingLink(null);
                    setTab('pgn');
                  }}
                />
                {pendingLink && (
                  <ChesscomUsernamePrompt
                    username={ccUsername}
                    onUsernameChange={setCcUsername}
                    onSearch={() => void runArchiveSearch()}
                    searching={searching}
                    progress={searchProgress}
                    onCancel={cancelArchiveSearch}
                  />
                )}
              </>
            )}
            {tab === 'image' && (
              <ImageInput
                onOpenEditor={() => {
                  setEditorFen(new Chess().fen());
                  setEditorOpen(true);
                }}
                onAnalyzeFen={(fen) => goReview({ fen })}
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted" htmlFor="depth-select">
              {t('input.analysisDepth')}
            </label>
            <select
              id="depth-select"
              className="min-w-0 max-w-full rounded-base border border-line bg-panel2 px-3 py-2 text-sm text-ink"
              value={settings.depth}
              onChange={(e) => updateSettings({ depth: e.target.value as AnalysisDepth })}
            >
              {(Object.keys(DEPTH_PRESETS) as AnalysisDepth[]).map((k) => (
                <option key={k} value={k}>
                  {t(DEPTH_MESSAGE_KEY[k])}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <Button size="lg" loading={busy} onClick={onReviewClick}>
              {t('input.review')}
            </Button>
          </div>

          {multiPgn && (
            <div className="mt-4 rounded-base border border-line bg-panel2 p-3">
              <p className="mb-2 text-sm font-semibold">
                {t('input.multiGames', { count: multiPgn.length })}
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {multiPgn.map((g, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
                      onClick={() => goReview({ pgn: g.pgn })}
                    >
                      {g.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {picker && <RecentGamesPicker games={picker} onPick={(g) => goReview({ pgn: g.pgn })} />}
        </section>

        {recent.length > 0 && (
          <section
            id="recent"
            className="mt-6 scroll-mt-4 rounded-base bg-panel p-4"
            aria-label={t('input.recentReviewsLabel')}
          >
            <h2 className="mb-2 text-sm font-semibold text-muted">{t('input.recentReviews')}</h2>
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-sm hover:underline"
                    onClick={() => goReview({ reviewId: r.id })}
                  >
                    {r.white} vs {r.black}
                    <span className="ml-2.5 font-medium">{r.result}</span>
                    <span className="ml-2.5 text-muted">{r.date}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('input.deleteReview', { white: r.white, black: r.black })}
                    className="rounded px-2 py-1 text-sm text-muted hover:bg-hover hover:text-ink"
                    onClick={() => {
                      void deleteReview(r.id).then(refreshRecent);
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 text-center text-xs leading-relaxed text-muted">
          <p>{t('input.footerCredits')}</p>
        </footer>
      </main>

      {editorOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-base bg-panel p-4"
            style={{ maxWidth: Math.max(512, settings.boardSizePx) }}
          >
            <BoardEditor
              initialFen={editorFen}
              onDone={(fen) => {
                setEditorOpen(false);
                goReview({ fen });
              }}
              onCancel={() => setEditorOpen(false)}
            />
          </div>
        </div>
      )}

      {drawerMounted && (
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onChange={updateSettings}
          onClearCache={() => {
            void clearPositionCache();
          }}
        />
      )}
    </div>
  );
}
