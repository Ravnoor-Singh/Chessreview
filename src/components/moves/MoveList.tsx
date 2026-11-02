'use client';

import { useMessages } from '@/i18n/useMessages';
import { reasonText } from '@/i18n/helpers';

import { useEffect, useRef, useState } from 'react';
import { formatEval } from '@/lib/format';
import { formatSpentTime, isTimeTrouble } from '@/lib/clocks';
import type { MoveClass, PlyAnalysis } from '@/lib/types';
import { ClassBadge } from '@/components/board/SquareBadge';
import { ClockGlyph } from '@/components/review/StatisticsPanel';

export interface MoveListProps {
  plies: PlyAnalysis[];
  currentPly: number;
  onSelect: (ply: number) => void;
  filterClass: MoveClass | null;
  showEval: boolean;
  /** Game base time (ms) from the TimeControl header, for the 10% time-trouble rule. */
  baseTimeMs?: number | null;
}

const ROW_TINT: Partial<Record<MoveClass, string>> = {
  blunder: 'rgba(202,52,49,0.12)',
  brilliant: 'rgba(27,172,166,0.12)',
};

function MoveCell({
  ply,
  currentPly,
  onSelect,
  filterClass,
  showEval,
  baseTimeMs,
  cellRef,
}: {
  ply: PlyAnalysis | undefined;
  currentPly: number;
  onSelect: (ply: number) => void;
  filterClass: MoveClass | null;
  showEval: boolean;
  baseTimeMs?: number | null;
  cellRef?: (el: HTMLButtonElement | null) => void;
}) {
  const { t, locale } = useMessages();
  if (!ply || !ply.san) return <span className="block px-2 py-1.5" aria-hidden />;
  const active = ply.ply === currentPly;
  const dimmed = filterClass !== null && ply.classification !== filterClass;
  return (
    <button
      type="button"
      ref={cellRef}
      onClick={() => onSelect(ply.ply)}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm transition-opacity ${
        active ? 'bg-hover font-bold text-ink' : 'text-ink hover:bg-hover/60'
      }`}
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <span className="min-w-0 flex-1 truncate">{ply.san}</span>
      {ply.timeSpentMs !== undefined && (
        <span
          className="shrink-0 text-[10px] tabular-nums text-muted"
          title={t('moves.timeSpent', { time: formatSpentTime(ply.timeSpentMs) })}
        >
          {formatSpentTime(ply.timeSpentMs)}
        </span>
      )}
      {isTimeTrouble(ply.clockMs, baseTimeMs) && (
        <span
          className="shrink-0 text-muted"
          role="img"
          aria-label={t('moves.timeTrouble')}
          title={t('moves.timeTroubleTitle')}
        >
          <ClockGlyph className="h-3 w-3" />
        </span>
      )}
      {showEval && (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
          {formatEval(ply.evalWhiteCp, ply.mate)}
        </span>
      )}
      {ply.classification && (
        <span
          className="shrink-0"
          title={
            ply.reason
              ? t('moves.whyLabel', { text: reasonText(locale, ply.reason) ?? ply.reason })
              : undefined
          }
        >
          <ClassBadge classification={ply.classification} size={16} reason={ply.reason} />
        </span>
      )}
    </button>
  );
}

/** Stable row height (px) used by the virtualized rendering path. */
export const MOVE_ROW_HEIGHT = 36;
/** Games with more rows than this are windowed instead of fully rendered. */
export const VIRTUALIZE_AFTER_ROWS = 80;
const OVERSCAN_ROWS = 8;

export default function MoveList({
  plies,
  currentPly,
  onSelect,
  filterClass,
  showEval,
  baseTimeMs,
}: MoveListProps) {
  const { t } = useMessages();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  // plies[0] is the start position; move i (1-based): white = plies[2i-1], black = plies[2i].
  const moveCount = Math.ceil(Math.max(0, plies.length - 1) / 2);
  const virtualized = moveCount > VIRTUALIZE_AFTER_ROWS;

  // Keep the active move visible by scrolling ONLY this list's own container.
  // (scrollIntoView also scrolls the window, which dragged the whole page
  // down when stepping through moves — the bug this replaces.)
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    if (virtualized) {
      // The active row may not be mounted: scroll by row arithmetic.
      if (currentPly < 1) return;
      const rowIdx = Math.floor((currentPly - 1) / 2);
      const rowTop = rowIdx * MOVE_ROW_HEIGHT;
      const viewTop = box.scrollTop;
      const viewBottom = viewTop + box.clientHeight;
      if (rowTop < viewTop || rowTop + MOVE_ROW_HEIGHT > viewBottom) {
        if (typeof box.scrollTo === 'function') {
          box.scrollTo({ top: Math.max(0, rowTop - box.clientHeight / 2 + MOVE_ROW_HEIGHT / 2) });
        } else {
          box.scrollTop = Math.max(0, rowTop - box.clientHeight / 2 + MOVE_ROW_HEIGHT / 2);
        }
      }
      return;
    }
    const el = activeRef.current;
    if (!el) return;
    const elTop = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const target = elTop - box.clientHeight / 2 + el.clientHeight / 2;
    if (typeof box.scrollTo === 'function') box.scrollTo({ top: Math.max(0, target) });
    else box.scrollTop = Math.max(0, target);
  }, [currentPly, virtualized]);

  useEffect(() => {
    const box = containerRef.current;
    if (!box || !virtualized) return;
    setViewportH(box.clientHeight || 480);
    setScrollTop(box.scrollTop);
  }, [virtualized, plies.length]);

  const allRows = Array.from({ length: moveCount }, (_, idx) => {
    const moveNo = idx + 1;
    return {
      moveNo,
      white: plies[2 * moveNo - 1] as PlyAnalysis | undefined,
      black: plies[2 * moveNo] as PlyAnalysis | undefined,
    };
  });

  // Windowing: render only the rows around the scroll position, with
  // spacer blocks preserving the full scroll height (stable item height).
  let startRow = 0;
  let endRow = allRows.length;
  if (virtualized) {
    startRow = Math.max(0, Math.floor(scrollTop / MOVE_ROW_HEIGHT) - OVERSCAN_ROWS);
    endRow = Math.min(
      allRows.length,
      Math.ceil((scrollTop + viewportH) / MOVE_ROW_HEIGHT) + OVERSCAN_ROWS,
    );
  }
  const rows = allRows.slice(startRow, endRow);

  return (
    // aria-rowcount/aria-rowindex expose the FULL row count to assistive
    // tech while only a window is mounted (virtualization, Round 2);
    // jsx-a11y's role table doesn't list them for listbox/listitem, hence
    // the two targeted disables below and on the row element.
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props
    <div
      ref={containerRef}
      className="h-full overflow-y-auto p-1.5"
      role="listbox"
      aria-label={t('moves.movesLabel')}
      aria-rowcount={virtualized ? moveCount : undefined}
      onScroll={
        virtualized
          ? (e) => {
              setScrollTop(e.currentTarget.scrollTop);
              setViewportH(e.currentTarget.clientHeight || 480);
            }
          : undefined
      }
    >
      {allRows.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">{t('moves.noMovesYet')}</p>
      ) : (
        <ol>
          {virtualized && startRow > 0 && (
            <li aria-hidden style={{ height: startRow * MOVE_ROW_HEIGHT }} />
          )}
          {rows.map(({ moveNo, white, black }) => {
            const tint: MoveClass | undefined =
              white?.classification === 'blunder' || white?.classification === 'brilliant'
                ? white.classification
                : black?.classification === 'blunder' || black?.classification === 'brilliant'
                  ? black.classification
                  : undefined;
            return (
              // eslint-disable-next-line jsx-a11y/role-supports-aria-props
              <li
                key={moveNo}
                className="grid grid-cols-[2.25rem_1fr_1fr] items-center rounded"
                style={{
                  ...(tint ? { backgroundColor: ROW_TINT[tint] } : undefined),
                  ...(virtualized ? { height: MOVE_ROW_HEIGHT } : undefined),
                }}
                aria-rowindex={virtualized ? moveNo : undefined}
              >
                <span className="px-1 text-center text-xs tabular-nums text-muted">{moveNo}.</span>
                <MoveCell
                  ply={white}
                  currentPly={currentPly}
                  onSelect={onSelect}
                  filterClass={filterClass}
                  showEval={showEval}
                  baseTimeMs={baseTimeMs}
                  cellRef={
                    white?.ply === currentPly
                      ? (el) => {
                          activeRef.current = el;
                        }
                      : undefined
                  }
                />
                <MoveCell
                  ply={black}
                  currentPly={currentPly}
                  onSelect={onSelect}
                  filterClass={filterClass}
                  showEval={showEval}
                  baseTimeMs={baseTimeMs}
                  cellRef={
                    black?.ply === currentPly
                      ? (el) => {
                          activeRef.current = el;
                        }
                      : undefined
                  }
                />
              </li>
            );
          })}
          {virtualized && endRow < allRows.length && (
            <li aria-hidden style={{ height: (allRows.length - endRow) * MOVE_ROW_HEIGHT }} />
          )}
        </ol>
      )}
    </div>
  );
}
