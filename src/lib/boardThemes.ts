/**
 * Board theme tokens — legacy API, now backed by the theme registry.
 *
 * The single source of truth lives in `src/themes/boards.ts` (Themes &
 * Presets program); this module re-exports the historical surface
 * (`BOARD_THEMES`, `BOARD_THEME_IDS`, `boardThemeTokens`, contrast
 * helpers) so existing components and tests keep working unchanged.
 * The token objects are the registry's own objects (referential
 * identity is part of the contract — see tests/unit/board-themes.test.ts).
 *
 * 'grey' is the historical spelling stored by existing users; 'gray' is
 * accepted as an alias everywhere and resolves to the same tokens.
 */
import {
  BOARD_ID_LIST,
  BOARD_THEME_DEFS,
  getBoardThemeDef,
  type BoardThemeTokens,
} from '@/themes/boards';

export type { BoardThemeTokens };
export type BoardThemeId = (typeof BOARD_ID_LIST)[number] | 'gray';

/** Canonical ids (one per picker entry; 'gray' is an alias of 'grey'). */
export const BOARD_THEME_IDS = BOARD_ID_LIST;

type CanonicalBoardId = (typeof BOARD_ID_LIST)[number];

export const BOARD_THEMES: Record<CanonicalBoardId, BoardThemeTokens> = Object.fromEntries(
  BOARD_THEME_DEFS.map((def) => [def.id, def.tokens]),
) as Record<CanonicalBoardId, BoardThemeTokens>;

const NAME_EXCEPTIONS: Record<string, string> = { contrast: 'High Contrast' };

/** English display names derived from the ids (title-cased, with exceptions). */
export const BOARD_THEME_NAMES: Record<CanonicalBoardId, string> = Object.fromEntries(
  BOARD_THEME_DEFS.map((def) => [
    def.id,
    NAME_EXCEPTIONS[def.id] ??
      def.id
        .split('-')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' '),
  ]),
) as Record<CanonicalBoardId, string>;

/** Resolve any accepted spelling to its tokens; unknown ids fall back to green. */
export function boardThemeTokens(id: BoardThemeId | string | undefined): BoardThemeTokens {
  return getBoardThemeDef(id)?.tokens ?? BOARD_THEMES.green;
}

/** WCAG relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #rrggbb colors (≥ 1). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
