'use client';

import { useMessages } from '@/i18n/useMessages';

export interface ChesscomUsernamePromptProps {
  /** Current username value (pre-filled from the last successful import). */
  username: string;
  onUsernameChange: (v: string) => void;
  /** Start the archive search with the entered username. */
  onSearch: () => void;
  /** True while the month-by-month archive search is running. */
  searching?: boolean;
  /** Progress line, e.g. "Searching 2026-10…" (already localized). */
  progress?: string;
  /** Cancel the running search. */
  onCancel?: () => void;
}

/**
 * Inline (NOT modal) username prompt for chess.com link imports
 * (Round 2, Prompt 2). A game link alone cannot be resolved through the
 * official public API — the API is organized by player — so the link tab
 * asks, right under the link field, for one player's username and then
 * searches that player's monthly archives for the game.
 */
export default function ChesscomUsernamePrompt({
  username,
  onUsernameChange,
  onSearch,
  searching,
  progress,
  onCancel,
}: ChesscomUsernamePromptProps) {
  const { t } = useMessages();
  return (
    <form
      data-testid="chesscom-username-prompt"
      className="mt-3 rounded-base border border-line bg-panel2 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!searching && username.trim()) onSearch();
      }}
    >
      <p className="text-sm font-semibold text-ink">{t('input.chesscomUsernameTitle')}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{t('input.chesscomUsernameBody')}</p>
      <label htmlFor="chesscom-username" className="mt-3 block text-sm font-semibold text-ink">
        {t('input.chesscomUsernameLabel')}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id="chesscom-username"
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t('input.chesscomUsernamePlaceholder')}
          spellCheck={false}
          autoComplete="off"
          disabled={searching}
          className="min-w-0 flex-1 rounded-base border border-line bg-panel px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={searching || !username.trim()}
          className="rounded-base bg-accent px-3 py-2 text-sm font-semibold text-white shadow-[0_3px_0_var(--accent-shadow)] active:translate-y-0.5 disabled:opacity-60"
        >
          {t('input.searchArchives')}
        </button>
        {searching && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-base border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink hover:bg-hover"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
      {searching && progress && (
        <p role="status" className="mt-2 text-sm text-muted">
          {progress}
        </p>
      )}
    </form>
  );
}
