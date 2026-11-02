'use client';

import React from 'react';
import { PieceImage, pieceLetterToSetKey } from './Piece';
import { useMessages } from '@/i18n/useMessages';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface PromotionPickerProps {
  /** Color of the pawn being promoted. */
  color: 'w' | 'b';
  /** Display file (0 = leftmost column as rendered) of the promotion square. */
  file: number;
  orientation: 'w' | 'b';
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const ORDER: PromotionPiece[] = ['q', 'r', 'b', 'n'];

const PIECE_NAME_KEY: Record<PromotionPiece, import('@/i18n').MessageKey> = {
  q: 'pieces.queen',
  r: 'pieces.rook',
  b: 'pieces.bishop',
  n: 'pieces.knight',
};

/**
 * Promotion chooser: a column of four piece buttons starting at the
 * promotion square and extending toward the center of the board, over a
 * semi-transparent backdrop. Clicking the backdrop cancels.
 *
 * Position math: the promotion square is on rank 8 for White, rank 1 for
 * Black. Its display row depends on orientation; when that row is at the
 * bottom of the board the column grows upward instead, with the queen
 * always adjacent to the promotion square.
 */
export function PromotionPicker({
  color,
  file,
  orientation,
  onPick,
  onCancel,
}: PromotionPickerProps): React.JSX.Element {
  const { t } = useMessages();
  // Display row (0 = top) of the promotion square itself.
  const promoRow = color === 'w' ? (orientation === 'w' ? 0 : 7) : orientation === 'w' ? 7 : 0;
  // The column fills rows promoRow … promoRow±3, growing toward the center.
  const growsDown = promoRow === 0;
  const topRow = growsDown ? 0 : 4;

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 60 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('engine.choosePromotion')}
    >
      <button
        type="button"
        aria-label={t('engine.cancelPromotion')}
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', border: 'none', padding: 0 }}
      />
      <div
        className="absolute flex flex-col overflow-hidden rounded-sm shadow-2xl"
        style={{
          left: `${file * 12.5}%`,
          top: `${topRow * 12.5}%`,
          width: '12.5%',
          height: '50%',
        }}
      >
        {ORDER.map((_orderPiece, i) => {
          // Queen sits on the promotion square; when the column grows up the
          // visual order is reversed so the queen stays at the bottom end.
          const visualIndex = growsDown ? i : ORDER.length - 1 - i;
          const p = ORDER[visualIndex];
          return (
            <button
              key={p}
              type="button"
              aria-label={t('engine.promoteTo', { piece: t(PIECE_NAME_KEY[p]) })}
              onClick={() => onPick(p)}
              className="flex items-center justify-center transition-colors"
              style={{
                height: '25%',
                width: '100%',
                backgroundColor: i % 2 === 0 ? 'rgba(248,248,248,0.97)' : 'rgba(232,232,232,0.97)',
                border: 'none',
                padding: '6%',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#c9e4a8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  i % 2 === 0 ? 'rgba(248,248,248,0.97)' : 'rgba(232,232,232,0.97)';
              }}
            >
              <PieceImage piece={pieceLetterToSetKey(color, p)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PromotionPicker;
