/**
 * Piece-set registry — legacy API, now backed by the theme registry.
 *
 * The single source of truth lives in `src/themes/pieces.ts` (Themes &
 * Presets program); this module keeps the historical surface
 * (`PIECE_SET_IDS`, `PIECE_SETS`, `pieceSrc`, `preloadPieceSet`, …) so
 * every piece image in the app keeps routing through one helper.
 * Assets live in `public/pieces/<set>/` with lichess-style names
 * (`wP.svg` … `bK.svg`), viewBox `0 0 45 45`.
 */
import {
  PIECE_KEYS,
  PIECE_SET_DEFS,
  PIECE_SET_ID_LIST,
  getPieceSetDef,
  isPieceSetId,
  normalizePieceSetId,
  pieceSrcFor,
  type PieceSetId,
} from '@/themes/pieces';

export { PIECE_KEYS, isPieceSetId };
export type { PieceSetId };

export const PIECE_SET_IDS = PIECE_SET_ID_LIST;

export interface PieceSetInfo {
  id: PieceSetId;
  /** Display name in the settings picker. */
  name: string;
  /** Author / license line shown in the drawer and LICENSES.md. */
  credit: string;
}

export const PIECE_SETS: readonly PieceSetInfo[] = PIECE_SET_DEFS.map((def) => ({
  id: def.id as PieceSetId,
  name: def.name,
  credit: def.credit,
}));

/** Unknown / legacy stored values fall back to the Classic (cburnett) set. */
export function normalizePieceSet(value: unknown): PieceSetId {
  return normalizePieceSetId(value) as PieceSetId;
}

export function pieceSetInfo(id: string): PieceSetInfo {
  const def = getPieceSetDef(id) ?? PIECE_SET_DEFS[0];
  return { id: def.id as PieceSetId, name: def.name, credit: def.credit };
}

/** Public URL of one piece image, e.g. pieceSrc('neo', 'bQ') → '/pieces/neo/bQ.svg'. */
export function pieceSrc(set: string, pieceKey: string): string {
  return pieceSrcFor(set, pieceKey);
}

const preloaded = new Set<string>();

/**
 * Warm the browser cache for a set's 12 images so switching sets has no
 * flicker. Only the ACTIVE set is preloaded (on board mount / set change);
 * other sets load lazily on first use. No-op during SSR.
 */
export function preloadPieceSet(set: PieceSetId | string): void {
  if (typeof window === 'undefined' || preloaded.has(set)) return;
  preloaded.add(set);
  for (const key of PIECE_KEYS) {
    const img = new window.Image();
    img.src = pieceSrcFor(set, key);
  }
}
