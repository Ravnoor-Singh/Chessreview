'use client';

import { useMessages } from '@/i18n/useMessages';

export interface FenInputProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  onOpenEditor: () => void;
}

export default function FenInput({ value, onChange, error, onOpenEditor }: FenInputProps) {
  const { t } = useMessages();
  const valid = value.trim().length > 0 && !error;
  return (
    <div>
      <label htmlFor="fen-input" className="text-sm font-semibold text-ink">
        {t('input.fenLabel')}
      </label>
      <input
        id="fen-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby="fen-feedback"
        className="mt-1.5 w-full rounded-base border border-line bg-panel px-3 py-2.5 font-mono text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div id="fen-feedback" className="mt-1.5 min-h-[1.25rem] text-xs" aria-live="polite">
        {error ? (
          <span role="alert" className="text-[#f0938f]">
            {error}
          </span>
        ) : valid ? (
          <span className="text-accent">{t('input.fenValid')}</span>
        ) : (
          <span className="text-muted">{t('input.fenHint')}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenEditor}
        className="mt-2 rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
      >
        {t('input.openBoardEditor')}
      </button>
    </div>
  );
}
