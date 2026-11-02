'use client';

import { useMessages } from '@/i18n/useMessages';
import { classificationLabel } from '@/i18n/helpers';

import { CLASS_STYLE } from '@/lib/constants';
import type { ClassCounts, GameReview, MoveClass } from '@/lib/types';
import { ClassBadge } from '@/components/board/SquareBadge';

export interface SummaryTableProps {
  counts: GameReview['counts'];
  whiteName: string;
  blackName: string;
  activeClass: MoveClass | null;
  onSelectClass: (c: MoveClass | null) => void;
  onStepClass: (dir: 1 | -1) => void;
}

const ORDER: MoveClass[] = [
  'brilliant',
  'great',
  'book',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
];

export default function SummaryTable({
  counts,
  whiteName,
  blackName,
  activeClass,
  onSelectClass,
  onStepClass,
}: SummaryTableProps) {
  const { t, locale, formatNumber } = useMessages();
  const forcedTotal = counts.white.forced + counts.black.forced;
  const rows: MoveClass[] = forcedTotal > 0 ? [...ORDER, 'forced'] : ORDER;

  return (
    <section className="px-4 py-2" aria-label={t('summary.classificationSummary')}>
      {activeClass !== null && (
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] text-muted">
            {t('summary.filtering', { label: classificationLabel(locale, activeClass) })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStepClass(-1)}
              className="flex h-7 w-7 items-center justify-center rounded bg-panel2 text-base text-ink hover:bg-hover"
              aria-label={t('summary.previousClassMove', {
                label: classificationLabel(locale, activeClass),
              })}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onStepClass(1)}
              className="flex h-7 w-7 items-center justify-center rounded bg-panel2 text-base text-ink hover:bg-hover"
              aria-label={t('summary.nextClassMove', {
                label: classificationLabel(locale, activeClass),
              })}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* A labeled group of toggle buttons, not a data table: role="table"
          here was an axe aria-required-children violation (buttons are not
          valid table children) — Round 2, Prompt 5. */}
      <div
        role="group"
        aria-label={t('summary.moveCountsTable', { white: whiteName, black: blackName })}
      >
        {rows.map((cls) => {
          const style = CLASS_STYLE[cls];
          const active = activeClass === cls;
          const w: ClassCounts[MoveClass] = counts.white[cls];
          const b: ClassCounts[MoveClass] = counts.black[cls];
          return (
            <button
              key={cls}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectClass(active ? null : cls)}
              className={`grid w-full grid-cols-[1fr_3rem_2rem_3rem] items-center border-b border-line/50 px-1 py-[7px] text-left transition-colors last:border-b-0 ${
                active ? 'bg-hover' : 'hover:bg-hover/50'
              }`}
            >
              <span className="text-[15px] font-medium text-ink">
                {classificationLabel(locale, cls)}
              </span>
              <span
                className="text-center text-[15px] font-bold tabular-nums"
                style={{ color: w > 0 ? style.color : 'var(--text-muted)' }}
              >
                {formatNumber(w)}
              </span>
              <span className="flex justify-center">
                <ClassBadge classification={cls} size={22} />
              </span>
              <span
                className="text-center text-[15px] font-bold tabular-nums"
                style={{ color: b > 0 ? style.color : 'var(--text-muted)' }}
              >
                {formatNumber(b)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
