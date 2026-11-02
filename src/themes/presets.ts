/**
 * Preset registry + engine (Themes & Presets program).
 *
 * A preset bundles one choice of each theme kind (board, piece set,
 * background, sound theme, animation style). Applying a preset produces
 * a partial settings object; it never touches unrelated settings.
 * Curated presets are defined here; user presets live in the settings
 * store and are handled by `src/themes/userPresets.ts`.
 */
import type { MessageKey } from '@/i18n';
import { getAnimationStyleDef } from './animations';
import { BACKGROUND_DEFS, getBackgroundDef } from './backgrounds';
import { BOARD_THEME_DEFS, getBoardThemeDef } from './boards';
import { getPieceSetDef, PIECE_SET_DEFS } from './pieces';
import { getSoundThemeDef, SOUND_THEME_DEFS } from './sounds';
import { DEFAULT_THEME_SELECTION, type ThemeSelection } from './types';

import { PRESET_ID_LIST } from './ids';

export { PRESET_ID_LIST };

export interface PresetDef extends ThemeSelection {
  id: string;
  labelKey: MessageKey;
  provenance: string;
  license: string;
}

const MADE = 'Curated combination of original project themes.';
const LICENSE = 'CC0 1.0 (project original)';

export const PRESET_DEFS: readonly PresetDef[] = [
  {
    id: 'classic-green',
    labelKey: 'themes.presets.classic-green',
    boardTheme: 'green',
    pieceSet: 'cburnett',
    backgroundId: 'standard',
    soundThemeId: 'standard',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'warm-wood',
    labelKey: 'themes.presets.warm-wood',
    boardTheme: 'wood',
    pieceSet: 'staunton-wood',
    backgroundId: 'classic',
    soundThemeId: 'standard',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'high-contrast',
    labelKey: 'themes.presets.high-contrast',
    boardTheme: 'grey',
    pieceSet: 'high-contrast',
    backgroundId: 'charcoal',
    soundThemeId: 'standard',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  /* ---- Stage C curated presets ---- */
  {
    id: 'dark-tournament',
    labelKey: 'themes.presets.dark-tournament',
    boardTheme: 'dark-green',
    pieceSet: 'staunton',
    backgroundId: 'charcoal',
    soundThemeId: 'soft',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'burled-study',
    labelKey: 'themes.presets.burled-study',
    boardTheme: 'burled-wood',
    pieceSet: 'wood',
    backgroundId: 'classic',
    soundThemeId: 'soft',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'walnut-library',
    labelKey: 'themes.presets.walnut-library',
    boardTheme: 'walnut',
    pieceSet: 'figurine',
    backgroundId: 'wood',
    soundThemeId: 'marble',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'marble-hall',
    labelKey: 'themes.presets.marble-hall',
    boardTheme: 'marble',
    pieceSet: 'marble',
    backgroundId: 'marble',
    soundThemeId: 'marble',
    animationStyleId: 'spring',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'glass-night',
    labelKey: 'themes.presets.glass-night',
    boardTheme: 'glass',
    pieceSet: 'glass',
    backgroundId: 'midnight',
    soundThemeId: 'glass',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'icy-sea',
    labelKey: 'themes.presets.icy-sea',
    boardTheme: 'icy-sea',
    pieceSet: 'icy',
    backgroundId: 'icy-sea',
    soundThemeId: 'glass',
    animationStyleId: 'spring',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'neon-arcade',
    labelKey: 'themes.presets.neon-arcade',
    boardTheme: 'neon',
    pieceSet: 'neon',
    backgroundId: 'neon-grid',
    soundThemeId: 'arcade',
    animationStyleId: 'arcade',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: '8bit-arcade',
    labelKey: 'themes.presets.8bit-arcade',
    boardTheme: '8-bit',
    pieceSet: '8bit',
    backgroundId: '8-bit',
    soundThemeId: 'arcade',
    animationStyleId: 'arcade',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'bubblegum',
    labelKey: 'themes.presets.bubblegum',
    boardTheme: 'bubblegum',
    pieceSet: 'bubblegum',
    backgroundId: 'bubblegum',
    soundThemeId: 'playful',
    animationStyleId: 'spring',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'newspaper-print',
    labelKey: 'themes.presets.newspaper-print',
    boardTheme: 'newspaper',
    pieceSet: 'newspaper',
    backgroundId: 'newspaper',
    soundThemeId: 'soft',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'parchment',
    labelKey: 'themes.presets.parchment',
    boardTheme: 'parchment',
    pieceSet: 'medieval',
    backgroundId: 'paper',
    soundThemeId: 'soft',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'space-voyage',
    labelKey: 'themes.presets.space-voyage',
    boardTheme: 'blue',
    pieceSet: 'space',
    backgroundId: 'space',
    soundThemeId: 'metal',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'cosmos',
    labelKey: 'themes.presets.cosmos',
    boardTheme: 'purple',
    pieceSet: 'modern-soft',
    backgroundId: 'cosmos',
    soundThemeId: 'glass',
    animationStyleId: 'spring',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'ocean-breeze',
    labelKey: 'themes.presets.ocean-breeze',
    boardTheme: 'sky',
    pieceSet: 'icy',
    backgroundId: 'ocean',
    soundThemeId: 'soft',
    animationStyleId: 'spring',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'midnight-blue',
    labelKey: 'themes.presets.midnight-blue',
    boardTheme: 'blue',
    pieceSet: 'minimal',
    backgroundId: 'midnight',
    soundThemeId: 'soft',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'gothic-castle',
    labelKey: 'themes.presets.gothic-castle',
    boardTheme: 'stone',
    pieceSet: 'gothic',
    backgroundId: 'gothic',
    soundThemeId: 'marble',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'colorblind-safe',
    labelKey: 'themes.presets.colorblind-safe',
    boardTheme: 'contrast',
    pieceSet: 'colorblind-safe',
    backgroundId: 'light',
    soundThemeId: 'standard',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'minimal-light',
    labelKey: 'themes.presets.minimal-light',
    boardTheme: 'sand',
    pieceSet: 'minimal',
    backgroundId: 'light',
    soundThemeId: 'silent',
    animationStyleId: 'slide',
    provenance: MADE,
    license: LICENSE,
  },
  {
    id: 'focus',
    labelKey: 'themes.presets.focus',
    boardTheme: 'grey',
    pieceSet: 'symbols',
    backgroundId: 'charcoal',
    soundThemeId: 'silent',
    animationStyleId: 'off',
    provenance: MADE,
    license: LICENSE,
  },
];

const BY_ID = new Map(PRESET_DEFS.map((d) => [d.id, d]));

export function getPresetDef(id: string | undefined): PresetDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The settings patch that applies a ThemeSelection (preset or ad-hoc). */
export function selectionToSettingsPatch(sel: ThemeSelection): ThemeSelection {
  return {
    boardTheme: sel.boardTheme,
    pieceSet: sel.pieceSet,
    backgroundId: sel.backgroundId,
    soundThemeId: sel.soundThemeId,
    animationStyleId: sel.animationStyleId,
  };
}

/**
 * Replace any unknown id in a selection with the registry default, so a
 * stored/imported preset can never crash the app. Returns the cleaned
 * selection plus the list of fields that had to be replaced.
 */
export function sanitizeSelection(sel: Partial<ThemeSelection>): {
  selection: ThemeSelection;
  replaced: (keyof ThemeSelection)[];
} {
  const replaced: (keyof ThemeSelection)[] = [];
  const pick = (
    value: string | undefined,
    known: (id: string | undefined) => unknown,
    fallback: string,
    field: keyof ThemeSelection,
  ): string => {
    if (value !== undefined && known(value)) return value;
    if (value !== undefined) replaced.push(field);
    return fallback;
  };
  return {
    selection: {
      boardTheme: pick(
        sel.boardTheme,
        getBoardThemeDef,
        DEFAULT_THEME_SELECTION.boardTheme,
        'boardTheme',
      ),
      pieceSet: pick(sel.pieceSet, getPieceSetDef, DEFAULT_THEME_SELECTION.pieceSet, 'pieceSet'),
      backgroundId: pick(
        sel.backgroundId,
        getBackgroundDef,
        DEFAULT_THEME_SELECTION.backgroundId,
        'backgroundId',
      ),
      soundThemeId: pick(
        sel.soundThemeId,
        getSoundThemeDef,
        DEFAULT_THEME_SELECTION.soundThemeId,
        'soundThemeId',
      ),
      animationStyleId: pick(
        sel.animationStyleId,
        getAnimationStyleDef,
        DEFAULT_THEME_SELECTION.animationStyleId,
        'animationStyleId',
      ),
    },
    replaced,
  };
}

function pickRandom<T extends { id: string; flags: { lowReadability?: boolean } }>(
  defs: readonly T[],
  rng: () => number,
  excludeLowReadability: boolean,
): string {
  const pool = defs.filter((d) => !excludeLowReadability || !d.flags.lowReadability);
  const list = pool.length > 0 ? pool : defs;
  return list[Math.floor(rng() * list.length)].id;
}

/**
 * "Surprise me": a random combination across all five kinds. Animated
 * backgrounds and low-readability assets are excluded unless the caller
 * opts in, so a random pick never hurts readability by surprise.
 */
export function randomSelection(
  rng: () => number = Math.random,
  opts?: { excludeLowReadability?: boolean },
): ThemeSelection {
  const exclude = opts?.excludeLowReadability ?? true;
  return {
    boardTheme: pickRandom(BOARD_THEME_DEFS, rng, exclude),
    pieceSet: pickRandom(PIECE_SET_DEFS, rng, exclude),
    backgroundId: pickRandom(BACKGROUND_DEFS, rng, exclude),
    soundThemeId: pickRandom(SOUND_THEME_DEFS, rng, false),
    animationStyleId: pickRandom(
      // Arcade requires reduced-motion off; random picks stay calm.
      [
        { id: 'slide', flags: {} },
        { id: 'spring', flags: {} },
      ],
      rng,
      false,
    ),
  };
}
