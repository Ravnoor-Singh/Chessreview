'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_STYLE } from '@/lib/constants';
import type { MoveClass, PlyAnalysis } from '@/lib/types';
import { formatEval } from '@/lib/format';
import { useMessages } from '@/i18n/useMessages';
import { classificationLabel } from '@/i18n/helpers';
import { t as translate, type Locale } from '@/i18n';

export interface EvalGraphProps {
  plies: PlyAnalysis[];
  currentPly: number;
  onSeek: (ply: number) => void;
  height?: number;
  /** Final result marker (e.g. "1-0") drawn at the end of the curve (Round 2). */
  resultLabel?: string;
}

/** Classifications that get a colored dot on the curve. */
const DOT_CLASSES: ReadonlySet<MoveClass> = new Set(['brilliant', 'great', 'mistake', 'blunder']);

/** Severity order for dot decimation: a worse move's dot wins its column. */
const DOT_SEVERITY: Partial<Record<MoveClass, number>> = {
  blunder: 4,
  mistake: 3,
  brilliant: 2,
  great: 1,
};

/**
 * At most one dot per pixel column: group the classified plies by their
 * rounded x position and keep the most severe in each group. On short
 * games (columns >= plies) this is the identity.
 */
export function decimateDots(
  plies: readonly PlyAnalysis[],
  xFor: (index: number) => number,
): { p: PlyAnalysis; i: number }[] {
  const byColumn = new Map<number, { p: PlyAnalysis; i: number }>();
  plies.forEach((p, i) => {
    if (p.classification === undefined || !DOT_CLASSES.has(p.classification)) return;
    const column = Math.round(xFor(i));
    const prev = byColumn.get(column);
    if (
      !prev ||
      (DOT_SEVERITY[p.classification] ?? 0) > (DOT_SEVERITY[prev.p.classification!] ?? 0)
    ) {
      byColumn.set(column, { p, i });
    }
  });
  return [...byColumn.values()].sort((a, b) => a.i - b.i);
}

const DARK = '#403e3c';
const LIGHT = '#f5f5f4';
const CURSOR_COLOR = '#e8b93c';

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function moveLabel(ply: PlyAnalysis, index: number, locale: Locale): string {
  if (index === 0 || ply.ply === 0) return translate(locale, 'engine.start');
  const moveNo = Math.ceil(ply.ply / 2);
  const mover: 'w' | 'b' = ply.color ?? (ply.ply % 2 === 1 ? 'w' : 'b');
  const san = ply.san ?? '';
  return mover === 'w' ? `${moveNo}. ${san}` : `${moveNo}… ${san}`;
}

/**
 * Win-probability graph over the whole game (chess.com review style).
 * X is the ply index, Y is White's win probability (100 at the top).
 * The area below the curve is filled light (White's region) over a dark
 * background (Black's region above the curve). Brilliant / great /
 * mistake / blunder plies are dotted in their class colors. Clicking or
 * dragging scrubs through the game; hovering shows a move tooltip.
 */
export function EvalGraph({
  plies,
  currentPly,
  onSeek,
  height = 96,
  resultLabel,
}: EvalGraphProps): React.JSX.Element {
  const { t, locale } = useMessages();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) setWidth(rect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = plies.length;
  const xFor = (index: number): number => (n <= 1 ? 0 : (index / (n - 1)) * width);
  const yFor = (winProbWhite: number): number => height - (clampPct(winProbWhite) / 100) * height;
  const midY = yFor(50);

  const currentIndex = useMemo<number>(() => {
    const idx = plies.findIndex((p) => p.ply === currentPly);
    return idx >= 0 ? idx : Math.min(Math.max(currentPly, 0), Math.max(n - 1, 0));
  }, [plies, currentPly, n]);

  /** Light area path: along the curve, closed along the bottom edge. */
  const areaPath = useMemo<string>(() => {
    if (n < 2) return '';
    const segments = plies.map(
      (p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.winProbWhite).toFixed(1)}`,
    );
    return `${segments.join(' ')} L ${xFor(n - 1).toFixed(1)} ${height} L 0 ${height} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plies, n, width, height]);

  const seekFromClientX = (clientX: number): void => {
    const el = containerRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (n - 1));
    onSeek(plies[index].ply);
  };

  const hoverFromClientX = (clientX: number): void => {
    const el = containerRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * (n - 1)));
  };

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (n < 2) return;
    scrubbingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    seekFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (scrubbingRef.current) {
      seekFromClientX(e.clientX);
    } else {
      hoverFromClientX(e.clientX);
    }
  };

  const handlePointerUp = (): void => {
    scrubbingRef.current = false;
  };

  const hoverPly =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < n ? plies[hoverIndex] : null;
  const hoverClassLabel =
    hoverPly?.classification !== undefined
      ? classificationLabel(locale, hoverPly.classification)
      : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-sm"
      style={{ height, backgroundColor: DARK, touchAction: 'none' }}
      role="slider"
      aria-label={t('engine.evalGraph')}
      aria-valuemin={0}
      aria-valuemax={Math.max(n - 1, 0)}
      aria-valuenow={currentIndex}
      aria-valuetext={
        n > 0 ? moveLabel(plies[currentIndex], currentIndex, locale) : t('engine.noMoves')
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        if (!scrubbingRef.current) setHoverIndex(null);
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        aria-hidden="true"
      >
        {n >= 2 && <path d={areaPath} fill={LIGHT} stroke="none" />}
        {/* midline (equal position) */}
        <line
          x1={0}
          y1={midY}
          x2={width}
          y2={midY}
          stroke="#9a9791"
          strokeWidth={1}
          strokeDasharray="5 4"
          opacity={0.75}
        />
        {n >= 2 && (
          <>
            {/* classification dots — decimated to at most one dot per
                pixel column on long games (Round 2, Prompt 6: a 400-ply
                game previously mounted a circle per classified ply even
                though sub-pixel-spaced dots are indistinguishable); the
                most severe classification in each column wins. */}
            {decimateDots(plies, xFor).map(({ p, i }) => {
              const style = CLASS_STYLE[p.classification!];
              if (!style) return null;
              return (
                <circle
                  key={`dot-${p.ply}`}
                  cx={xFor(i)}
                  cy={yFor(p.winProbWhite)}
                  r={3.5}
                  fill={style.color}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={0.75}
                />
              );
            })}
            {/* cursor at the current ply */}
            <line
              x1={xFor(currentIndex)}
              y1={0}
              x2={xFor(currentIndex)}
              y2={height}
              stroke={CURSOR_COLOR}
              strokeWidth={2}
            />
            <circle
              cx={xFor(currentIndex)}
              cy={yFor(plies[currentIndex].winProbWhite)}
              r={4}
              fill="#ffffff"
              stroke={CURSOR_COLOR}
              strokeWidth={2}
            />
          </>
        )}
        {hoverIndex !== null && n >= 2 && (
          <line
            x1={xFor(hoverIndex)}
            y1={0}
            x2={xFor(hoverIndex)}
            y2={height}
            stroke="#ffffff"
            strokeWidth={1}
            opacity={0.45}
          />
        )}
        {resultLabel && n >= 1 && (
          <text
            data-testid="eval-graph-result"
            x={width - 6}
            y={height - 6}
            textAnchor="end"
            fontSize={11}
            fontWeight={700}
            fill="#e8b93c"
          >
            {resultLabel}
          </text>
        )}
      </svg>

      {hoverPly && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{
            left: `${(xFor(hoverIndex) / Math.max(width, 1)) * 100}%`,
            top: 4,
            transform: `translateX(${hoverIndex === 0 ? '0' : hoverIndex === n - 1 ? '-100%' : '-50%'})`,
            backgroundColor: 'rgba(24,23,21,0.94)',
          }}
        >
          <span className="font-semibold">{moveLabel(hoverPly, hoverIndex, locale)}</span>
          {'  '}
          <span>{formatEval(hoverPly.evalWhiteCp, hoverPly.mate)}</span>
          {hoverClassLabel && (
            <span
              className="ml-1.5 rounded-sm px-1 py-px text-[10px] font-bold uppercase tracking-wide"
              style={{
                backgroundColor:
                  hoverPly.classification !== undefined
                    ? (CLASS_STYLE[hoverPly.classification]?.color ?? '#666')
                    : '#666',
              }}
            >
              {hoverClassLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default EvalGraph;
