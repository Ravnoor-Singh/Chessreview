'use client';

import type { BoardThemeDef } from '@/themes/boards';
import { PieceImage } from '@/components/board/Piece';
import ThemeFilterDefs, { FilteredSquare } from '@/components/board/ThemeFilterDefs';
import type { CoordinatesMode } from '@/components/ui/SettingsDrawer';

/**
 * Live theme preview (Themes & Presets, Stage A): a 4×4 corner of a
 * board rendered with the REAL theme definitions — the selected board's
 * square colors/textures, the selected piece set's actual SVGs,
 * coordinates, a last-move highlight (knight b1→c3), a legal-move dot
 * (a2) and a capture ring (a4) — so what the user sees while choosing
 * is exactly what the board will look like. Purely presentational.
 */

// (file, rank) with rank 0 = rank 1. Displayed rank 4 → rank 1, file a → d.
const PIECES: Record<string, string> = {
  '0,0': 'wR', // a1
  '1,1': 'wP', // b2
  '2,2': 'wN', // c3
  '3,1': 'wK', // d2
  '0,3': 'bP', // a4 (capture target)
  '1,3': 'bQ', // b4
  '3,3': 'bK', // d4
};
const LAST_MOVE_FROM = '1,0'; // b1
const LAST_MOVE_TO = '2,2'; // c3
const DOT_SQUARE = '0,1'; // a2
const CAPTURE_SQUARE = '0,3'; // a4

export interface MiniPreviewProps {
  board: BoardThemeDef;
  pieceSet: string;
  coordinates: CoordinatesMode;
  highlightStyle: 'solid' | 'ring';
  moveHintStyle: 'dots' | 'rings' | 'none';
  /** Square size in px (total board = size × 4 plus frame). */
  size?: number;
}

export default function MiniPreview({
  board,
  pieceSet,
  coordinates,
  highlightStyle,
  moveHintStyle,
  size = 44,
}: MiniPreviewProps): React.JSX.Element {
  const { tokens } = board;
  const cells: React.JSX.Element[] = [];
  for (let row = 0; row < 4; row += 1) {
    const rank = 3 - row;
    for (let file = 0; file < 4; file += 1) {
      const key = `${file},${rank}`;
      const isLight = (file + rank) % 2 === 1;
      const piece = PIECES[key];
      const isLastMove = key === LAST_MOVE_FROM || key === LAST_MOVE_TO;
      const isDot = key === DOT_SQUARE;
      const isCapture = key === CAPTURE_SQUARE;
      cells.push(
        <div
          key={key}
          className="relative"
          style={{
            width: size,
            height: size,
            backgroundColor: isLight ? tokens.light : tokens.dark,
            backgroundImage: isLight ? tokens.textureLight : tokens.textureDark,
          }}
        >
          {tokens.filterId ? (
            <FilteredSquare
              filterId={tokens.filterId}
              color={isLight ? tokens.light : tokens.dark}
            />
          ) : null}
          {isLastMove &&
            (highlightStyle === 'ring' ? (
              <div
                className="absolute inset-0"
                style={{ boxShadow: `inset 0 0 0 4px ${tokens.lastMove}` }}
              />
            ) : (
              <div className="absolute inset-0" style={{ backgroundColor: tokens.lastMove }} />
            ))}
          {coordinates !== 'off' && file === 0 && (
            <span
              aria-hidden="true"
              className="absolute font-semibold"
              style={{
                top: '4%',
                left: '6%',
                fontSize: 10,
                lineHeight: 1,
                color: isLight ? tokens.coordOnLight : tokens.coordOnDark,
              }}
            >
              {rank + 1}
            </span>
          )}
          {coordinates !== 'off' && rank === 0 && (
            <span
              aria-hidden="true"
              className="absolute font-semibold"
              style={{
                bottom: '4%',
                right: '6%',
                fontSize: 10,
                lineHeight: 1,
                color: isLight ? tokens.coordOnLight : tokens.coordOnDark,
              }}
            >
              {'abcd'[file]}
            </span>
          )}
          {isDot && moveHintStyle === 'dots' && (
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                width: '31%',
                height: '31%',
                left: '34.5%',
                top: '34.5%',
                backgroundColor: tokens.legalDot,
              }}
            />
          )}
          {isDot && moveHintStyle === 'rings' && (
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                width: '62%',
                height: '62%',
                left: '19%',
                top: '19%',
                border: `3px solid ${tokens.legalDot}`,
                boxSizing: 'border-box',
              }}
            />
          )}
          {isCapture && moveHintStyle !== 'none' && (
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                inset: '2.5%',
                border: `4px solid ${tokens.legalDot}`,
                boxSizing: 'border-box',
              }}
            />
          )}
          {piece && (
            <div className="absolute inset-0 p-[4%]">
              <PieceImage piece={piece} pieceSet={pieceSet} />
            </div>
          )}
        </div>,
      );
    }
  }
  return (
    <div
      aria-hidden="true"
      className="relative inline-block overflow-hidden rounded"
      style={{ border: `3px solid ${board.border}`, lineHeight: 0 }}
    >
      <ThemeFilterDefs />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(4, ${size}px)`,
          gridTemplateRows: `repeat(4, ${size}px)`,
        }}
      >
        {cells}
      </div>
    </div>
  );
}
