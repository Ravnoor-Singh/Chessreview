'use client';

import { useMessages } from '@/i18n/useMessages';

export interface LinkInputProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  /** When true, show the offline state: link import needs the network (Prompt 9). */
  offline?: boolean;
  /**
   * When true, show the graceful chess.com fallback panel (Prompt 11):
   * instructions for exporting the PGN by hand plus a one-click switch
   * to the PGN tab.
   */
  showFallback?: boolean;
  /** One-click switch to the PGN tab (the "paste the PGN instead" path). */
  onSwitchToPgn?: () => void;
}

export const OFFLINE_LINK_MESSAGE =
  "You're offline — link import needs internet; paste a PGN or use the editor instead";

const DEFAULT_HINT =
  'Accepted: a chess.com game link (chess.com/game/live/… or /game/daily/…), a Lichess game link (lichess.org/…), or just a Chess.com / Lichess username to browse recent games.';

export default function LinkInput({
  value,
  onChange,
  error,
  hint,
  offline,
  showFallback,
  onSwitchToPgn,
}: LinkInputProps) {
  const { t } = useMessages();
  const localizedHint =
    hint === undefined || hint === DEFAULT_HINT ? t('input.linkHintLong') : hint;
  return (
    <div>
      {offline && (
        <p
          role="note"
          className="mb-3 rounded bg-[#7a4b12]/25 px-3 py-2 text-sm font-medium text-[#f5c877]"
        >
          {t('input.offlineLink')}
        </p>
      )}
      <label htmlFor="link-input" className="text-sm font-semibold text-ink">
        {t('input.linkLabel')}
      </label>
      <input
        id="link-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('input.linkPlaceholder')}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby="link-hint"
        className="mt-1.5 w-full rounded-base border border-line bg-panel px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <p id="link-hint" className="mt-1.5 text-xs leading-relaxed text-muted">
        {localizedHint}
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded bg-[#ca3431]/15 px-3 py-2 text-sm text-[#f0938f]">
          {error}
        </p>
      )}
      {showFallback && (
        <div
          data-testid="chesscom-fallback-panel"
          className="mt-3 rounded-base border border-line bg-panel2 px-3 py-3"
        >
          <p className="text-sm font-semibold text-ink">{t('input.chesscomFallbackTitle')}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {t('input.chesscomFallbackBody')}
          </p>
          <button
            type="button"
            onClick={onSwitchToPgn}
            className="mt-2 rounded-base bg-accent px-3 py-2 text-sm font-semibold text-white shadow-[0_3px_0_var(--accent-shadow)] active:translate-y-0.5"
          >
            {t('input.switchToPgn')}
          </button>
        </div>
      )}
    </div>
  );
}
