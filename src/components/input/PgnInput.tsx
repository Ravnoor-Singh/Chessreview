'use client';

import { useRef, useState } from 'react';
import { useMessages } from '@/i18n/useMessages';

export interface PgnInputProps {
  value: string;
  onChange: (v: string) => void;
  onFile: (text: string, name: string) => void;
  onSample: () => void;
  error?: string;
}

export default function PgnInput({ value, onChange, onFile, onSample, error }: PgnInputProps) {
  const { t } = useMessages();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setFileError(null);
      onFile(typeof reader.result === 'string' ? reader.result : '', file.name);
    };
    reader.onerror = () => setFileError(t('input.couldNotReadFile', { name: file.name }));
    reader.readAsText(file);
  };

  const shownError = error ?? fileError ?? undefined;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        className={`rounded-base transition-shadow ${dragging ? 'ring-2 ring-accent' : ''}`}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('input.pgnPlaceholder')}
          spellCheck={false}
          aria-label={t('input.pgnTextLabel')}
          aria-invalid={shownError ? true : undefined}
          className="min-h-[160px] w-full resize-y rounded-base border border-line bg-panel p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{t('input.pgnDragHint')}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
        >
          {t('input.uploadPgn')}
        </button>
        <button
          type="button"
          onClick={onSample}
          className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
        >
          {t('input.loadSample')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,.txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {shownError && (
        <p role="alert" className="mt-3 rounded bg-[#ca3431]/15 px-3 py-2 text-sm text-[#f0938f]">
          {shownError}
        </p>
      )}
    </div>
  );
}
