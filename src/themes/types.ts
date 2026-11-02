/**
 * Theme registry core types (Themes & Presets program).
 *
 * Every visual/audio choice in the app — board, piece set, page
 * background, sound theme, animation style, preset — is a typed,
 * data-driven definition in `src/themes/`. Definitions carry everything
 * the settings UI and the validators need: a localized label key, a
 * category, provenance/license, asset size and accessibility flags.
 *
 * LEGAL: all artwork referenced here is original to this project (or
 * carries the recorded license in its definition and in
 * `src/themes/PROVENANCE.md`). Nothing is copied, traced or recolored
 * from chess.com or any other proprietary source.
 */
/** Accessibility / behaviour flags shared by all theme kinds. */
export interface ThemeFlags {
  /** Pieces/background may be harder to read (shown as a badge). */
  lowReadability?: boolean;
  /** Contains motion; disabled under prefers-reduced-motion / low power. */
  animated?: boolean;
  /** Only sensible when the user has NOT requested reduced motion. */
  requiresReducedMotionOff?: boolean;
}

export type BoardCategory = 'solid' | 'wood' | 'polished' | 'paper' | 'playful';

export type PieceCategory =
  'classic' | 'modern' | 'traditional' | 'material' | 'pixel' | 'shape' | 'fun' | 'accessibility';

export type BackgroundCategory = 'plain' | 'texture' | 'scenic' | 'custom';

/** The five theme choices a preset bundles (field names match SettingsState). */
export interface ThemeSelection {
  boardTheme: string;
  pieceSet: string;
  backgroundId: string;
  soundThemeId: string;
  animationStyleId: string;
}

export const DEFAULT_THEME_SELECTION: ThemeSelection = {
  boardTheme: 'green',
  pieceSet: 'cburnett',
  backgroundId: 'standard',
  soundThemeId: 'standard',
  animationStyleId: 'slide',
};
