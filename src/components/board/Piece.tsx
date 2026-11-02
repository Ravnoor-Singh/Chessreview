'use client';

import React from 'react';
import { pieceSrc } from '@/lib/pieces';
import { useSettingsStore } from '@/store/settingsStore';

/** Full piece-type names → set letter, for defensive normalization. */
const TYPE_LETTERS: Record<string, string> = {
  p: 'P',
  pawn: 'P',
  n: 'N',
  knight: 'N',
  b: 'B',
  bishop: 'B',
  r: 'R',
  rook: 'R',
  q: 'Q',
  queen: 'Q',
  k: 'K',
  king: 'K',
};

/**
 * Map a chess.js style (color, type) pair to a set key,
 * e.g. ('w', 'p') → 'wP', ('b', 'q') → 'bQ'.
 * `type` is normally a single lowercase letter ('p' | 'n' | 'b' | 'r' | 'q' | 'k');
 * full names ('pawn', 'knight', …) and uppercase letters are also accepted.
 */
export function pieceLetterToSetKey(color: 'w' | 'b', type: string): string {
  const normalized = type.trim().toLowerCase();
  const letter = TYPE_LETTERS[normalized] ?? normalized.charAt(0).toUpperCase();
  return `${color}${letter}`;
}

export interface PieceImageProps {
  /** Set key, e.g. 'wP', 'bQ'. */
  piece: string;
  /** Rendered width/height in px. Defaults to filling the parent square. */
  size?: number;
  /**
   * Piece set to render from. Defaults to the user's active set from the
   * settings store, so every piece in the app switches together; the
   * settings picker's swatches pass an explicit set to preview it.
   */
  pieceSet?: string;
}

/**
 * A single chess piece rendered from the active SVG piece set in
 * `public/pieces/<set>/` (see `src/lib/pieces.ts`). Purely presentational:
 * never draggable on its own (the board implements drag with pointer
 * events) and hidden from assistive tech (the square underneath carries
 * the accessible label).
 */
export function PieceImage({ piece, size, pieceSet }: PieceImageProps): React.JSX.Element {
  const activeSet = useSettingsStore((s) => s.settings.pieceSet);
  const set = pieceSet ?? activeSet;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pieceSrc(set, piece)}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      style={{
        width: size !== undefined ? size : '100%',
        height: size !== undefined ? size : '100%',
        display: 'block',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  );
}

export default PieceImage;
