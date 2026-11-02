'use client';

import React from 'react';

export interface ArrowDef {
  /** Source square, e.g. 'e2'. */
  from: string;
  /** Target square, e.g. 'e4'. */
  to: string;
  color: string;
  /** 0..1, defaults to 0.85. */
  opacity?: number;
  /** Shaft width in SVG units (viewBox is 800×800, one square = 100). Defaults to 22. */
  width?: number;
}

export interface CircleDef {
  square: string;
  color: string;
}

export interface ArrowsProps {
  arrows: ArrowDef[];
  orientation: 'w' | 'b';
  circles?: CircleDef[];
}

const SQ = 100; // one square in viewBox units

/** Parse 'e4' → { file: 0..7 (a=0), rank: 0..7 (rank 1 = 0) } or null. */
export function parseSquare(square: string): { file: number; rank: number } | null {
  if (square.length !== 2) return null;
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = square.charCodeAt(1) - '1'.charCodeAt(0);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

/** Center of a square in viewBox coordinates, honoring board orientation. */
export function squareCenter(
  square: string,
  orientation: 'w' | 'b',
): { x: number; y: number } | null {
  const parsed = parseSquare(square);
  if (!parsed) return null;
  const displayFile = orientation === 'w' ? parsed.file : 7 - parsed.file;
  const displayRow = orientation === 'w' ? 7 - parsed.rank : parsed.rank;
  return { x: (displayFile + 0.5) * SQ, y: (displayRow + 0.5) * SQ };
}

interface ArrowGeometry {
  x1: number;
  y1: number;
  baseX: number;
  baseY: number;
  tipX: number;
  tipY: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

/**
 * Geometry for one arrow: the shaft runs from the center of `from` and stops
 * at the base of the arrowhead; the head's tip is pulled back from the
 * center of `to` so the whole head sits inside the target square. Knight
 * moves are drawn as a straight line, chess.com style.
 */
function arrowGeometry(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
): ArrowGeometry | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return null;
  const ux = dx / dist;
  const uy = dy / dist;
  const px = -uy;
  const py = ux;

  const headLength = Math.min(width * 2.1, SQ * 0.52);
  const headHalfWidth = width * 1.12;
  // Keep the tip inside the target square: for a one-square move the tip is
  // at most 30% of the way into the square; for longer moves it lands just
  // short of the target center.
  const tipInset = Math.min(20, dist * 0.22);
  const tipX = to.x - ux * tipInset;
  const tipY = to.y - uy * tipInset;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;
  return {
    x1: from.x,
    y1: from.y,
    baseX,
    baseY,
    tipX,
    tipY,
    leftX: baseX + px * headHalfWidth,
    leftY: baseY + py * headHalfWidth,
    rightX: baseX - px * headHalfWidth,
    rightY: baseY - py * headHalfWidth,
  };
}

/**
 * SVG overlay (800×800 viewBox, rendered at board size) that draws arrows
 * with a filled arrowhead in each arrow's own color, plus optional ring
 * highlights. Pointer-transparent: the board owns all pointer handling.
 */
export function Arrows({ arrows, orientation, circles }: ArrowsProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 800 800"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {(circles ?? []).map((circle, i) => {
        const c = squareCenter(circle.square, orientation);
        if (!c) return null;
        return (
          <circle
            key={`circle-${circle.square}-${circle.color}-${i}`}
            cx={c.x}
            cy={c.y}
            r={SQ * 0.44}
            fill="none"
            stroke={circle.color}
            strokeWidth={8}
            opacity={0.9}
          />
        );
      })}
      {arrows.map((arrow, i) => {
        const from = squareCenter(arrow.from, orientation);
        const to = squareCenter(arrow.to, orientation);
        if (!from || !to) return null;
        const width = arrow.width ?? 22;
        const geo = arrowGeometry(from, to, width);
        if (!geo) return null;
        const opacity = arrow.opacity ?? 0.85;
        return (
          <g key={`arrow-${arrow.from}-${arrow.to}-${arrow.color}-${i}`} opacity={opacity}>
            <line
              x1={geo.x1}
              y1={geo.y1}
              x2={geo.baseX}
              y2={geo.baseY}
              stroke={arrow.color}
              strokeWidth={width}
              strokeLinecap="butt"
            />
            <polygon
              points={`${geo.tipX},${geo.tipY} ${geo.leftX},${geo.leftY} ${geo.rightX},${geo.rightY}`}
              fill={arrow.color}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default Arrows;
