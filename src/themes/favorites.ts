/**
 * Favorite-theme keys (Themes & Presets program).
 *
 * Favorites are stored as `<kind>:<id>` strings because ids repeat
 * across kinds on purpose ('wood' the board and 'wood' the background
 * are different assets). This module imports only the id lists, so the
 * settings store can validate favorites without pulling the whole
 * registry barrel into its import graph.
 */
import { ANIMATION_STYLE_ID_LIST } from './ids';
import { BACKGROUND_ID_LIST } from './ids';
import { BOARD_ID_LIST } from './ids';
import { PIECE_SET_ID_LIST } from './ids';
import { PRESET_ID_LIST } from './ids';
import { SOUND_THEME_ID_LIST } from './ids';

export type ThemeKind = 'board' | 'pieces' | 'background' | 'sound' | 'animation' | 'preset';

const IDS_BY_KIND: Record<ThemeKind, readonly string[]> = {
  board: BOARD_ID_LIST,
  pieces: PIECE_SET_ID_LIST,
  background: BACKGROUND_ID_LIST,
  sound: SOUND_THEME_ID_LIST,
  animation: ANIMATION_STYLE_ID_LIST,
  preset: PRESET_ID_LIST,
};

export function favoriteKey(kind: ThemeKind, id: string): string {
  return `${kind}:${id}`;
}

export function isKnownFavorite(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const sep = value.indexOf(':');
  if (sep < 1) return false;
  const kind = value.slice(0, sep) as ThemeKind;
  const id = value.slice(sep + 1);
  const list = IDS_BY_KIND[kind];
  return Array.isArray(list) && list.includes(id);
}
