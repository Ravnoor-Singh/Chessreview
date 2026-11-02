'use client';

import { useMessages } from '@/i18n/useMessages';

import type { PlyAnalysis } from '@/lib/types';

export interface EplChartProps {
  plies: PlyAnalysis[];
  onJump: (ply: number) => void;
}

/**
 * EPL-per-move bar chart for the summary screen (Prompt 6). One bar per
 * ply, height proportional to that move's expected-points loss, coloured
 * by the mover (light bar = White's move, dark bar = Black's move, the
 * EvalBar colour convention — legible in both themes). Every bar is a
 * real <button>, so the chart is fully keyboard accessible; clicking or
 * activating a bar jumps the review to that ply.
 */
export default function EplChart({ plies, onJump }: EplChartProps) {
  const { t } = useMessages();
  const moves = plies.filter((p) => p.ply >= 1 && p.san);
  if (moves.length === 0) return null;
  const maxEpl = Math.max(0.01, ...moves.map((p) => p.epl ?? 0));
  return (
    <figure className="px-2 pb-1" aria-label={t('summary.eplPerMove')}>
      <figcaption className="px-2 pb-1 text-[11px] font-medium text-muted">
        {t('summary.eplPerMove')}
      </figcaption>
      <div
        className="flex h-12 items-end gap-px rounded bg-panel2 px-1 pb-1 pt-1.5"
        role="group"
        aria-label={t('summary.eplBars')}
      >
        {moves.map((p) => {
          const epl = p.epl ?? 0;
          const moveNo = Math.ceil(p.ply / 2);
          const label = t('summary.eplBarLabel', {
            move: `${moveNo}${p.color === 'b' ? '…' : '.'}`,
            san: p.san ?? '',
            epl: epl.toFixed(2),
          });
          const jumpLabel = t('summary.eplBarJump', {
            move: `${moveNo}${p.color === 'b' ? '…' : '.'}`,
            san: p.san ?? '',
            epl: epl.toFixed(2),
          });
          return (
            <button
              key={p.ply}
              type="button"
              onClick={() => onJump(p.ply)}
              title={label}
              aria-label={jumpLabel}
              className="flex min-w-[3px] flex-1 items-end self-stretch rounded-sm px-0 py-0 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden
                className="block w-full rounded-sm"
                style={{
                  height: `${Math.max(epl > 0 ? 6 : 2, (epl / maxEpl) * 100)}%`,
                  backgroundColor: p.color === 'b' ? '#565350' : '#e8e8e8',
                  boxShadow: 'inset 0 0 0 1px var(--border)',
                }}
              />
            </button>
          );
        })}
      </div>
    </figure>
  );
}
