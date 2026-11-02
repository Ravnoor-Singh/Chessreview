'use client';

import { useMessages } from '@/i18n/useMessages';

import { formatWdl, wdlToWhitePercentages } from '@/lib/wdl';

export interface WdlBarProps {
  /** Per-mille WDL from the side-to-move perspective (Stockfish UCI_ShowWDL). */
  wdl?: [number, number, number] | null;
  /** Side to move in the position the WDL belongs to. */
  sideToMove: 'w' | 'b';
}

/**
 * Compact Win/Draw/Loss bar (Prompt 6). Percentages are always shown
 * from WHITE's perspective (the conversion swaps W/L when Black is to
 * move) and sum to exactly 100. Renders nothing when the line carries
 * no WDL, so panels without WDL data keep their exact layout.
 * Segment colours follow the EvalBar convention (light = White wins,
 * mid grey = draw, dark = Black wins) and read correctly in both themes.
 */
export default function WdlBar({ wdl, sideToMove }: WdlBarProps) {
  const { t } = useMessages();
  const pct = wdlToWhitePercentages(wdl, sideToMove);
  if (!pct) return null;
  const label = formatWdl(pct);
  return (
    <div className="min-w-0">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded ring-1 ring-line"
        role="img"
        aria-label={t('engine.wdlForWhite', { label })}
        title={t('engine.wdlWhitePerspective', { label })}
      >
        <div style={{ width: `${pct.w}%`, backgroundColor: '#f8f8f8' }} aria-hidden />
        <div style={{ width: `${pct.d}%`, backgroundColor: '#9a9893' }} aria-hidden />
        <div style={{ width: `${pct.l}%`, backgroundColor: '#403e3c' }} aria-hidden />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted">{label}</p>
    </div>
  );
}
