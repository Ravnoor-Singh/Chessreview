'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BoardEditor from '@/components/input/BoardEditor';
import { recognizeScreenshot } from '@/vision/client';
import {
  assembleFen,
  fenToSquares,
  flipSquares,
  squareName,
  validatePosition,
  type SquareArray,
} from '@/vision/validate';
import type { PieceKey } from '@/vision/types';
import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';

export interface ImageInputProps {
  onOpenEditor: () => void;
  /** Route a confirmed FEN into analysis (the page's review flow). */
  onAnalyzeFen?: (fen: string) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; stage: string }
  | {
      kind: 'review';
      /** Squares as recognized, a8-first, White at the bottom. */
      squares: SquareArray;
      confidences: number[];
      meanConfidence: number;
      totalMs: number;
      flipped: boolean;
    }
  | { kind: 'failed'; totalMs: number }
  | { kind: 'error'; message: string };

const STAGE_LABELS: Record<string, MessageKey> = {
  'loading-pieces': 'vision.stageLoadingPieces',
  detecting: 'vision.stageDetecting',
  recognizing: 'vision.stageRecognizing',
};

const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/** Castling rights after a 180° board rotation: K↔q, Q↔k. */
function flipCastling(castling: string): string {
  if (castling === '-') return '-';
  const map: Record<string, string> = { K: 'q', Q: 'k', k: 'Q', q: 'K' };
  const out = ['K', 'Q', 'k', 'q'].filter((c) => castling.includes(map[c]));
  return out.length > 0 ? out.join('') : '-';
}

export default function ImageInput({ onOpenEditor, onAnalyzeFen }: ImageInputProps) {
  const { t, locale, formatPercentFraction } = useMessages();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const latestFenRef = useRef<string>(EMPTY_FEN);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [editorFen, setEditorFen] = useState<string>(EMPTY_FEN);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const analyze = (fen: string) => {
    if (onAnalyzeFen) onAnalyzeFen(fen);
    else onOpenEditor();
  };

  const handleFile = (file: File) => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
    setPhase({ kind: 'working', stage: 'loading-pieces' });
    void (async () => {
      try {
        const { outcome, totalMs } = await recognizeScreenshot(file, (stage) => {
          setPhase({ kind: 'working', stage });
        });
        if (outcome.status === 'not-found') {
          setPhase({ kind: 'failed', totalMs });
          latestFenRef.current = EMPTY_FEN;
          setEditorFen(EMPTY_FEN);
          setEditorKey((k) => k + 1);
          return;
        }
        const squares = outcome.result.squares.map((s) => s.piece) as (PieceKey | null)[];
        const fen = assembleFen(squares, 'w');
        latestFenRef.current = fen;
        setEditorFen(fen);
        setEditorKey((k) => k + 1);
        setPhase({
          kind: 'review',
          squares,
          confidences: outcome.result.squares.map((s) => s.confidence),
          meanConfidence: outcome.result.meanConfidence,
          totalMs,
          flipped: false,
        });
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : t('vision.recognitionFailedUnexpected'),
        });
      }
    })();
  };

  const reset = () => {
    setPhase({ kind: 'idle' });
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFileName(null);
  };

  // In review, the displayed position is the recognized one, possibly
  // flipped 180° by the swap button. Highlights follow the same mapping.
  const review = phase.kind === 'review' ? phase : null;
  const displayedSquares = useMemo<SquareArray>(() => {
    if (!review) return [];
    return review.flipped ? flipSquares(review.squares) : review.squares;
  }, [review]);
  const highlights = useMemo<Record<string, 'low' | 'uncertain'>>(() => {
    if (!review) return {};
    const out: Record<string, 'low' | 'uncertain'> = {};
    for (let i = 0; i < 64; i++) {
      const conf = review.flipped ? review.confidences[63 - i] : review.confidences[i];
      if (conf < 0.6) out[squareName(i)] = 'low';
      else if (conf < 0.8) out[squareName(i)] = 'uncertain';
    }
    return out;
  }, [review]);
  const validation = useMemo(
    () => (review ? validatePosition(displayedSquares, 'w', locale) : null),
    [review, displayedSquares, locale],
  );

  const swapOrientation = () => {
    if (!review) return;
    // Flip the editor's CURRENT position (including any fixes the user
    // already made), not just the raw recognition.
    const current = latestFenRef.current || editorFen;
    const parts = current.trim().split(/\s+/);
    const turn = parts[1] === 'b' ? 'b' : 'w';
    const castling = flipCastling(parts[2] ?? '-');
    const fen = assembleFen(flipSquares(fenToSquares(current)), turn, castling);
    latestFenRef.current = fen;
    setEditorFen(fen);
    setEditorKey((k) => k + 1);
    setPhase({ ...review, flipped: !review.flipped });
  };

  const showEditor = phase.kind === 'review' || phase.kind === 'failed';

  return (
    <div className="rounded-base border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-ink">{t('vision.importTitle')}</h3>
        <span className="rounded-full border border-line bg-panel2 px-2 py-0.5 text-[11px] font-semibold text-muted">
          {t('vision.betaLabel')}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t('vision.importIntro')} <strong className="text-ink">{t('vision.neverLeave')}</strong>
        {t('vision.importIntroTail')}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
        >
          {t('vision.chooseScreenshot')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        {(phase.kind === 'review' || phase.kind === 'failed' || phase.kind === 'error') && (
          <button
            type="button"
            onClick={reset}
            className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
          >
            {t('vision.startOver')}
          </button>
        )}
      </div>

      {phase.kind === 'working' && (
        <p role="status" className="mt-3 text-sm text-muted">
          {STAGE_LABELS[phase.stage] ? t(STAGE_LABELS[phase.stage]) : t('vision.working')}
        </p>
      )}

      {phase.kind === 'error' && (
        <p role="alert" className="mt-3 text-sm text-[#f0938f]">
          {t('vision.recognitionFailedPrefix')} {phase.message}{' '}
          {t('vision.recognitionFailedSuffix')}
        </p>
      )}

      {phase.kind === 'failed' && (
        <div
          role="alert"
          className="mt-3 rounded border border-[#e58f2a]/40 bg-[#e58f2a]/10 p-3 text-sm text-ink"
        >
          <strong>{t('vision.noBoardTitle')}</strong> {t('vision.noBoardBody')}{' '}
          {t('vision.recognitionTook', { seconds: (phase.totalMs / 1000).toFixed(1) })}
        </div>
      )}

      {review && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink">
            {t('vision.confidenceLabel')}{' '}
            <strong>{formatPercentFraction(review.meanConfidence)}</strong>{' '}
            <span className="text-muted">
              {t('vision.confidenceMeta', {
                seconds: (review.totalMs / 1000).toFixed(1),
                side: t(review.flipped ? 'common.black' : 'common.white'),
              })}
            </span>
          </p>
          {review.meanConfidence < 0.9 && (
            <p
              role="alert"
              className="rounded border border-[#e58f2a]/40 bg-[#e58f2a]/10 p-2.5 text-sm text-ink"
            >
              {t('vision.lowConfidence')}
            </p>
          )}
          {validation && validation.errors.length > 0 && (
            <div
              role="alert"
              className="rounded border border-[#ca3431]/40 bg-[#ca3431]/10 p-2.5 text-sm text-ink"
            >
              <strong>{t('vision.positionProblems')}</strong>
              <ul className="mt-1 list-inside list-disc">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {validation &&
            validation.warnings.map((w) => (
              <p key={w} className="text-sm text-[#e5c02a]">
                ⚠ {w}
              </p>
            ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={swapOrientation}
              className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
            >
              {t('vision.swapOrientation')}
            </button>
            <span className="text-xs text-muted">{t('vision.swapHint')}</span>
          </div>
        </div>
      )}

      {previewUrl && (
        <figure className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={
              fileName ? t('vision.uploadedAlt', { name: fileName }) : t('vision.uploadedAltPlain')
            }
            className="max-h-72 w-auto max-w-full rounded border border-line object-contain"
          />
          {fileName && <figcaption className="mt-1 text-[11px] text-muted">{fileName}</figcaption>}
        </figure>
      )}

      {showEditor ? (
        <div className="mt-4">
          <BoardEditor
            key={editorKey}
            initialFen={editorFen}
            highlightSquares={review ? highlights : undefined}
            confirmLabel={t('vision.analyzePosition')}
            onFenChange={(fen) => {
              latestFenRef.current = fen;
            }}
            onDone={analyze}
            onCancel={reset}
          />
        </div>
      ) : (
        phase.kind === 'idle' && (
          <button
            type="button"
            onClick={onOpenEditor}
            className="mt-4 rounded bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_var(--accent-shadow)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none"
          >
            {t('vision.openEditorManual')}
          </button>
        )
      )}
    </div>
  );
}
