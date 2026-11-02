'use client';

import React from 'react';
import { CLASS_STYLE } from '@/lib/constants';
import { useMessages } from '@/i18n/useMessages';
import { classificationLabel, reasonText } from '@/i18n/helpers';
import type { ClassificationReason, MoveClass } from '@/lib/types';

export interface ClassBadgeProps {
  classification: MoveClass;
  /** Badge diameter in px. */
  size: number;
  /** Classification reason (Prompt 4): rendered as the "Why this label?" tooltip. */
  reason?: ClassificationReason;
}

/** 5-point star centered on (20, 20), outer r≈11, inner r≈4.6 (viewBox 40). */
const STAR_POINTS =
  '20,9 22.6,16.7 30.7,16.9 24.3,21.8 26.4,29.7 20,25.2 13.6,29.7 15.7,21.8 9.3,16.9 17.4,16.7';

/**
 * Simplified thumbs-up, drawn with two white shapes on the badge circle:
 * a cuff rectangle and a hand/thumb blob.
 */
function ThumbGlyph(): React.JSX.Element {
  return (
    <g fill="#ffffff">
      {/* cuff */}
      <rect x={9.5} y={21} width={7} height={9.5} rx={1.6} />
      {/* hand + thumb */}
      <path d="M16.5 30.5 V18.2 C16.5 16.1 17.4 14.4 18.9 12.2 C20.4 10 21.6 8.4 22.1 6.9 C22.5 5.8 23.4 5.2 24.4 5.4 C25.6 5.6 26.3 6.7 26 8.1 L25.2 12.6 H31.2 C33.1 12.6 34.4 14.3 34 16.1 L32.6 27.2 C32.3 29.1 30.7 30.5 28.8 30.5 Z" />
    </g>
  );
}

/** Open-book glyph: two page shapes joined at a center spine. */
function BookGlyph({ spineColor }: { spineColor: string }): React.JSX.Element {
  return (
    <g>
      <path
        d="M20 12.4 C17.2 10.3 13.8 9.6 9.8 10.2 V28.4 C13.8 27.8 17.2 28.5 20 30.6 C22.8 28.5 26.2 27.8 30.2 28.4 V10.2 C26.2 9.6 22.8 10.3 20 12.4 Z"
        fill="#ffffff"
      />
      <line x1={20} y1={12.4} x2={20} y2={30.6} stroke={spineColor} strokeWidth={1.6} />
    </g>
  );
}

/** "Only move" glyph: four corner brackets around a center dot. */
function ForcedGlyph(): React.JSX.Element {
  const stroke = {
    stroke: '#ffffff',
    strokeWidth: 2.6,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g>
      <path d="M13.5 9.5 H9.5 V13.5" {...stroke} />
      <path d="M26.5 9.5 H30.5 V13.5" {...stroke} />
      <path d="M13.5 30.5 H9.5 V26.5" {...stroke} />
      <path d="M26.5 30.5 H30.5 V26.5" {...stroke} />
      <circle cx={20} cy={20} r={2} fill="#ffffff" />
    </g>
  );
}

function Glyph({
  classification,
  color,
}: {
  classification: MoveClass;
  color: string;
}): React.JSX.Element {
  switch (classification) {
    case 'best':
      return <polygon points={STAR_POINTS} fill="#ffffff" />;
    case 'excellent':
      return <ThumbGlyph />;
    case 'book':
      return <BookGlyph spineColor={color} />;
    case 'forced':
      return <ForcedGlyph />;
    default:
      break;
  }
  // Text glyphs for the remaining classes. Deliberately NOT the emoji
  // glyphs stored in CLASS_STYLE (👍 / 📖): plain typographic symbols
  // rendered as SVG <text> are crisp at badge sizes and theme-safe.
  const textByClass: Partial<Record<MoveClass, string>> = {
    brilliant: '!!',
    great: '!',
    good: '✓',
    inaccuracy: '?!',
    mistake: '?',
    blunder: '??',
    miss: '✕',
  };
  const text = textByClass[classification] ?? CLASS_STYLE[classification]?.symbol ?? '';
  const fontSize = text.length > 1 ? 15.5 : 20;
  return (
    <text
      x={20}
      y={20.5}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#ffffff"
      fontSize={fontSize}
      fontWeight={800}
      fontFamily="Inter, Noto Sans, system-ui, sans-serif"
    >
      {text}
    </text>
  );
}

/**
 * Circular move-classification badge (chess.com style): a filled circle in
 * the class color with a white glyph — a drawn path for best (star),
 * excellent (thumbs-up), book and forced, a typographic glyph otherwise.
 */
export function ClassBadge({ classification, size, reason }: ClassBadgeProps): React.JSX.Element {
  const { t, locale } = useMessages();
  const style = CLASS_STYLE[classification] ?? {
    color: '#8b8987',
    label: classification,
    symbol: '',
  };
  const label = classificationLabel(locale, classification);
  const why = reasonText(locale, reason);
  const title = why ? t('moves.whyLabel', { text: why }) : label;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={label}
      style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
    >
      <title>{title}</title>
      <circle
        cx={20}
        cy={20}
        r={18.5}
        fill={style.color}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={1.6}
      />
      <Glyph classification={classification} color={style.color} />
    </svg>
  );
}

export default ClassBadge;
