'use client';

import { useMessages } from '@/i18n/useMessages';

import { useMemo, useState } from 'react';
import { computeGameStatistics, type PlayerStatistics } from '@/analysis/statistics';
import { formatPlayerClock, parseTimeControl } from '@/lib/clocks';
import type { GameReview } from '@/lib/types';

export interface StatisticsPanelProps {
  review: GameReview;
  /** Jump to a ply (the page switches to the walkthrough). */
  onJump: (ply: number) => void;
}

/** Small inline clock glyph (SVG, no emoji-font dependence). */
export function ClockGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 5v3.2l2.1 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhaseCell({ stats }: { stats: PlayerStatistics }) {
  if (!stats.phaseTimes) return <span className="text-muted">—</span>;
  const { openingMs, middlegameMs, endgameMs } = stats.phaseTimes;
  return (
    <span className="tabular-nums">
      {formatPlayerClock(openingMs)} / {formatPlayerClock(middlegameMs)} /{' '}
      {formatPlayerClock(endgameMs)}
    </span>
  );
}

/**
 * Collapsible "Statistics" section for the summary screen (Prompt 6):
 * ACPL, longest best-or-better streak, biggest single-move eval swing
 * (a button that jumps to that ply), time spent by phase (opening /
 * middlegame / endgame — only when the game carries clocks) and the
 * time-trouble move count. All values come from the pure
 * computeGameStatistics module.
 */
export default function StatisticsPanel({ review, onJump }: StatisticsPanelProps) {
  const { t } = useMessages();
  const [open, setOpen] = useState(false);
  const stats = useMemo(
    () =>
      computeGameStatistics(review, {
        baseTimeMs: parseTimeControl(review.headers.TimeControl)?.baseMs ?? null,
      }),
    [review],
  );
  const players: { name: string; s: PlayerStatistics }[] = [
    { name: review.headers.White ?? t('common.white'), s: stats.white },
    { name: review.headers.Black ?? t('common.black'), s: stats.black },
  ];

  return (
    <section className="px-4 py-2" aria-label={t('summary.gameStatistics')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="statistics-panel-body"
        className="flex w-full items-center justify-between rounded px-1 py-1.5 text-left text-[15px] font-semibold text-ink hover:bg-hover/50"
      >
        <span>{t('summary.statistics')}</span>
        <span aria-hidden className="text-muted">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div id="statistics-panel-body" className="px-1 pb-2">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-2 gap-y-2 text-[13px]">
            <span />
            {players.map((p) => (
              <span key={p.s.color} className="truncate text-center font-semibold">
                {p.name}
              </span>
            ))}

            <span className="text-muted">{t('summary.acpl')}</span>
            {players.map((p) => (
              <span key={p.s.color} className="text-center tabular-nums">
                {p.s.acpl}
              </span>
            ))}

            <span className="text-muted">{t('summary.bestStreak')}</span>
            {players.map((p) => (
              <span key={p.s.color} className="text-center tabular-nums">
                {p.s.longestBestStreak}
              </span>
            ))}

            <span className="text-muted">{t('summary.biggestSwing')}</span>
            {players.map((p) =>
              p.s.biggestSwing ? (
                <span key={p.s.color} className="text-center">
                  <button
                    type="button"
                    onClick={() => onJump(p.s.biggestSwing!.ply)}
                    className="rounded px-1 font-semibold text-accent hover:underline"
                    aria-label={t('summary.jumpToSwing', {
                      name: p.name,
                      move: p.s.biggestSwing.moveNumber,
                      san: p.s.biggestSwing.san,
                    })}
                  >
                    {p.s.biggestSwing.moveNumber}
                    {p.s.color === 'b' ? '…' : '.'} {p.s.biggestSwing.san} (−
                    {p.s.biggestSwing.epl.toFixed(2)})
                  </button>
                </span>
              ) : (
                <span key={p.s.color} className="text-center text-muted">
                  —
                </span>
              ),
            )}

            {stats.hasClocks && (
              <>
                <span className="text-muted">
                  {t('summary.timeByPhase')}
                  <span className="block text-[11px]">{t('summary.timeByPhaseSub')}</span>
                </span>
                {players.map((p) => (
                  <span key={p.s.color} className="text-center">
                    <PhaseCell stats={p.s} />
                  </span>
                ))}

                <span className="text-muted">
                  <span className="inline-flex items-center gap-1">
                    <ClockGlyph className="h-3 w-3" /> {t('summary.timeTroubleMoves')}
                  </span>
                </span>
                {players.map((p) => (
                  <span key={p.s.color} className="text-center tabular-nums">
                    {p.s.timeTroubleCount}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
