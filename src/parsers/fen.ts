// FEN validation helpers backed by chess.js.

import { Chess, validateFen as chessValidateFen } from 'chess.js';
import { t, type Locale } from '@/i18n';

export type FenValidation = { valid: true; fen: string } | { valid: false; error: string };

/**
 * Validate a FEN string. On success returns the normalised FEN as produced
 * by chess.js (canonical spacing / en-passant handling).
 */
export function validateFen(fen: string, locale: Locale = 'en'): FenValidation {
  const trimmed = fen.trim();
  if (!trimmed) return { valid: false, error: t(locale, 'input.fenEmpty') };
  const result = chessValidateFen(trimmed);
  if (!result.ok) {
    return { valid: false, error: result.error ?? t(locale, 'input.invalidFen') };
  }
  try {
    const chess = new Chess(trimmed);
    return { valid: true, fen: chess.fen() };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : t(locale, 'input.invalidFen'),
    };
  }
}

/** FEN of a completely empty board, White to move. */
export function emptyFen(): string {
  return '8/8/8/8/8/8/8/8 w - - 0 1';
}

/** Side to move in a FEN ('w' by default when the field is missing/bad). */
export function fenTurn(fen: string): 'w' | 'b' {
  const field = fen.trim().split(/\s+/)[1];
  if (field === 'b' || field === 'w') return field;
  try {
    return new Chess(fen).turn();
  } catch {
    return 'w';
  }
}
