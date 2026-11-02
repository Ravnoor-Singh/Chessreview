'use client';

import React from 'react';
import { useMessages } from '@/i18n/useMessages';

export interface EvalBarProps {
  /** White's winning chances, 0..100. */
  winProbWhite: number;
  /** Pre-formatted evaluation text, e.g. '+1.2' or 'M3'. */
  evalText: string;
  orientation: 'w' | 'b';
  /** Mate in N from White's perspective (positive = White mates). */
  mate?: number;
  /** Render as a horizontal bar (mobile) instead of vertical. */
  horizontal?: boolean;
  /**
   * Optional White-perspective WDL label (Prompt 6), e.g.
   * "W 38% · D 52% · L 10%", appended to the bar's title/aria text when
   * the current position's top engine line carries WDL data.
   */
  wdlText?: string;
  /** Final result marker (e.g. "1-0"), shown as a center pill on the final position (Round 2). */
  resultMarker?: string;
}

const WHITE_FILL = '#f8f8f8';
const BLACK_FILL = '#403e3c';

/**
 * Chess.com-style evaluation bar. The white fill is sized by White's win
 * probability and anchored to White's side of the board: the bottom in
 * normal orientation (vertical) / the left (horizontal), flipping with
 * board orientation. The score label sits at the end of the side that is
 * ahead (top when Black leads in normal orientation, etc.).
 */
export function EvalBar({
  winProbWhite,
  evalText,
  orientation,
  mate,
  horizontal = false,
  wdlText,
  resultMarker,
}: EvalBarProps): React.JSX.Element {
  const { t, formatDecimal1 } = useMessages();
  const pct = Math.min(100, Math.max(0, winProbWhite));
  const whiteAhead = mate !== undefined && mate !== 0 ? mate > 0 : pct >= 50;
  const baseLabel =
    mate !== undefined && mate !== 0
      ? t('engine.evalMates', {
          eval: evalText,
          side: t(mate > 0 ? 'common.white' : 'common.black'),
          n: Math.abs(mate),
        })
      : t('engine.evalChance', { eval: evalText, pct: formatDecimal1(pct) });
  const ariaLabel = wdlText
    ? `${baseLabel}. ${t('engine.wdlSuffix', { wdl: wdlText })}`
    : baseLabel;
  const marker = resultMarker ? (
    <span
      data-testid="eval-result-marker"
      className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-accent px-1 py-px font-mono text-[10px] font-bold text-[#1d2b12]"
    >
      {resultMarker}
    </span>
  ) : null;

  if (horizontal) {
    // White fill grows from White's edge: left normally, right when flipped.
    const whiteFromLeft = orientation === 'w';
    // The label hugs the leading side's end of the bar.
    const labelAtLeft = whiteFromLeft ? whiteAhead : !whiteAhead;
    const labelInWhite = labelAtLeft === whiteFromLeft;
    return (
      <div
        className="relative w-full overflow-hidden rounded-sm"
        style={{ height: 16, backgroundColor: BLACK_FILL }}
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={ariaLabel}
        title={ariaLabel}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: whiteFromLeft ? 0 : undefined,
            right: whiteFromLeft ? undefined : 0,
            width: `${pct}%`,
            backgroundColor: WHITE_FILL,
            transition: 'width 300ms ease',
          }}
        />
        <span
          className="absolute font-bold"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            left: labelAtLeft ? 6 : undefined,
            right: labelAtLeft ? undefined : 6,
            fontSize: 11,
            lineHeight: 1,
            color: labelInWhite ? '#262421' : '#f8f8f8',
            transition: 'color 300ms ease',
          }}
        >
          {evalText}
        </span>
        {marker}
      </div>
    );
  }

  // Vertical: White fill grows from White's edge — bottom normally, top
  // when the board is flipped.
  const whiteFromBottom = orientation === 'w';
  // Label sits at the end of the side that is ahead: with White to the
  // bottom, a Black lead puts the label at the top (chess.com behavior),
  // and flipping the board flips the ends too.
  const labelAtTop = whiteFromBottom ? !whiteAhead : whiteAhead;
  const labelInWhite = labelAtTop !== whiteFromBottom;
  return (
    <div
      className="relative h-full overflow-hidden rounded-sm"
      style={{ width: 26, backgroundColor: BLACK_FILL }}
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={ariaLabel}
      title={ariaLabel}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: whiteFromBottom ? 0 : undefined,
          top: whiteFromBottom ? undefined : 0,
          height: `${pct}%`,
          backgroundColor: WHITE_FILL,
          transition: 'height 300ms ease',
        }}
      />
      <span
        className="absolute font-bold"
        style={{
          left: '50%',
          top: labelAtTop ? 8 : undefined,
          bottom: labelAtTop ? undefined : 8,
          transform: labelAtTop ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)',
          writingMode: 'vertical-rl',
          fontSize: 11,
          lineHeight: 1,
          color: labelInWhite ? '#262421' : '#f8f8f8',
          transition: 'color 300ms ease',
          whiteSpace: 'nowrap',
        }}
      >
        {evalText}
      </span>
      {marker}
    </div>
  );
}

export default EvalBar;
