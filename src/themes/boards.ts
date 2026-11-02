/**
 * Board theme registry (Themes & Presets program).
 *
 * A board definition is a full token set — square fills/textures,
 * coordinate colors, highlight colors, legal-move dot/ring color, arrow
 * colors and border — so no component hard-codes a per-theme value.
 * This module is the single source of truth; `src/lib/boardThemes.ts`
 * re-exports the legacy API on top of it.
 *
 * Coordinate contrast: the WCAG ratio of `coordOnLight`/`coordOnDark`
 * against the square they sit on is ≥ 4.5:1 for every board (asserted by
 * `npm run themes:check` and tests/unit/board-themes.test.ts):
 *
 *   theme   on light square        on dark square
 *   green   #436128 on #eeeed2 5.97   #101a05 on #769656 5.35
 *   brown   #6e4520 on #f0d9b5 6.03   #33200d on #b58863 4.93
 *   blue    #33586e on #dee3e6 5.88   #16262f on #8ca2ad 5.83
 *   grey    #4a4a4a on #e8e8e8 7.23   #1c1c1c on #8a8a8a 4.94
 *   purple  #4b2f73 on #e7dff2 8.31   #ffffff on #8367ab 4.67
 *   wood    #6e421a on #eccf9f 5.69   #ffffff on #9a6531 4.90
 */
import type { MessageKey } from '@/i18n';
import type { BoardCategory, ThemeFlags } from './types';

import { BOARD_ID_LIST } from './ids';

export { BOARD_ID_LIST };

export interface BoardThemeTokens {
  light: string;
  dark: string;
  /** Overlay for the from/to squares of the last move. */
  lastMove: string;
  /** Overlay for the currently selected square. */
  selected: string;
  /** Check highlight color (#rrggbb; the board adds alpha stops for its radial gradient). */
  check: string;
  /** Legal-move dot / capture ring color. */
  legalDot: string;
  /** Default (unmodified) user/suggestion arrow color. */
  arrowDefault: string;
  arrowShift: string;
  arrowAlt: string;
  arrowCtrl: string;
  /** Coordinate text color on light squares (contrast ≥ 4.5:1, see header). */
  coordOnLight: string;
  /** Coordinate text color on dark squares (contrast ≥ 4.5:1, see header). */
  coordOnDark: string;
  /** Optional CSS-only texture layered over the square color. */
  textureLight?: string;
  textureDark?: string;
  /**
   * Optional id of an SVG filter (rendered once by ThemeFilterDefs) that
   * textures each square, e.g. feTurbulence grain for wood/marble boards.
   * Purely decorative; the flat colors above remain the fallback.
   */
  filterId?: string;
}

export interface BoardThemeDef {
  id: string;
  labelKey: MessageKey;
  category: BoardCategory;
  tokens: BoardThemeTokens;
  /** CSS color of the frame rendered around the 8×8 grid. */
  border: string;
  /** How this board was made (mirrors the row in PROVENANCE.md). */
  provenance: string;
  license: string;
  flags: ThemeFlags;
}

const WOOD_GRAIN =
  'repeating-linear-gradient(93deg, rgba(90,50,10,0.10) 0 2px, transparent 2px 7px), repeating-linear-gradient(178deg, rgba(255,235,200,0.06) 0 3px, transparent 3px 11px)';
const WOOD_GRAIN_DARK =
  'repeating-linear-gradient(94deg, rgba(30,15,2,0.16) 0 2px, transparent 2px 6px), repeating-linear-gradient(179deg, rgba(255,220,170,0.05) 0 3px, transparent 3px 10px)';
const BRUSHED =
  'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 4px)';
const SHEEN =
  'linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.10) 100%)';
const FROST =
  'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25) 0 8%, transparent 40%), linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%)';
const NEON_GRID =
  'linear-gradient(rgba(0,229,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.14) 1px, transparent 1px)';
const PIXEL_DITHER =
  'conic-gradient(rgba(0,0,0,0.06) 25%, transparent 0 50%, rgba(0,0,0,0.06) 0 75%, transparent 0)';
const SPARKLE =
  'radial-gradient(circle at 22% 30%, rgba(255,255,255,0.5) 0 1.5px, transparent 2.5px), radial-gradient(circle at 68% 62%, rgba(255,255,255,0.4) 0 1px, transparent 2px), radial-gradient(circle at 84% 18%, rgba(255,255,255,0.45) 0 1px, transparent 2px), radial-gradient(circle at 40% 82%, rgba(255,255,255,0.35) 0 1.5px, transparent 2.5px)';
const THIN_LINES =
  'linear-gradient(rgba(40,44,52,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(40,44,52,0.16) 1px, transparent 1px)';
const BLUEPRINT_GRID =
  'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)';

const ORIGINAL = 'Original artwork for this project — CC0 1.0';
const CSS_TEX = 'Flat colors plus original CSS-gradient textures written for this project.';
const FILTER_TEX =
  'Flat colors plus an original inline-SVG feTurbulence texture filter written for this project.';

/** Standard highlight/arrow values shared by most boards. */
const STD = {
  lastMove: 'rgba(255,235,59,0.42)',
  selected: 'rgba(255,235,59,0.5)',
  check: '#ff0000',
  arrowShift: '#c62828',
  arrowAlt: '#1565c0',
  arrowCtrl: '#e6a817',
} as const;

/** Canonical board ids, in picker order ('gray' is an alias of 'grey'). */

export type BoardId = (typeof BOARD_ID_LIST)[number];

export const BOARD_THEME_DEFS: readonly BoardThemeDef[] = [
  {
    id: 'green',
    labelKey: 'themes.boards.green',
    category: 'solid',
    border: '#3d5a26',
    provenance: 'Hand-picked flat colors (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#eeeed2',
      dark: '#769656',
      lastMove: 'rgba(255,255,0,0.4)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(20,20,20,0.22)',
      arrowDefault: '#15781b',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#436128',
      coordOnDark: '#101a05',
    },
  },
  {
    id: 'brown',
    labelKey: 'themes.boards.brown',
    category: 'solid',
    border: '#6e4520',
    provenance: 'Hand-picked flat colors (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f0d9b5',
      dark: '#b58863',
      lastMove: 'rgba(255,213,79,0.45)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(46,26,8,0.25)',
      arrowDefault: '#7a4a12',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#6e4520',
      coordOnDark: '#33200d',
    },
  },
  {
    id: 'blue',
    labelKey: 'themes.boards.blue',
    category: 'solid',
    border: '#33586e',
    provenance: 'Hand-picked flat colors (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#dee3e6',
      dark: '#8ca2ad',
      lastMove: 'rgba(255,235,59,0.42)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(16,38,52,0.24)',
      arrowDefault: '#1d6f8e',
      arrowShift: '#c62828',
      arrowAlt: '#6a1b9a',
      arrowCtrl: '#e6a817',
      coordOnLight: '#33586e',
      coordOnDark: '#16262f',
    },
  },
  {
    id: 'grey',
    labelKey: 'themes.boards.grey',
    category: 'solid',
    border: '#4a4a4a',
    provenance: 'Hand-picked flat colors (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#e8e8e8',
      dark: '#8a8a8a',
      lastMove: 'rgba(255,235,59,0.42)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(20,20,20,0.22)',
      arrowDefault: '#4c7a3f',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#4a4a4a',
      coordOnDark: '#1c1c1c',
    },
  },
  {
    id: 'purple',
    labelKey: 'themes.boards.purple',
    category: 'solid',
    border: '#4b2f73',
    provenance: 'Hand-picked flat colors (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#e7dff2',
      dark: '#8367ab',
      lastMove: 'rgba(255,213,79,0.45)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(30,14,54,0.26)',
      arrowDefault: '#5e35b1',
      arrowShift: '#c62828',
      arrowAlt: '#15781b',
      arrowCtrl: '#e6a817',
      coordOnLight: '#4b2f73',
      coordOnDark: '#ffffff',
    },
  },
  {
    id: 'wood',
    labelKey: 'themes.boards.wood',
    category: 'wood',
    border: '#5d3a12',
    provenance:
      'Flat colors plus an original CSS repeating-linear-gradient grain (project original, pre-registry theme).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#eccf9f',
      dark: '#9a6531',
      lastMove: 'rgba(255,225,120,0.42)',
      selected: 'rgba(255,235,59,0.5)',
      check: '#ff0000',
      legalDot: 'rgba(43,24,4,0.26)',
      arrowDefault: '#5d7a1e',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#6e421a',
      coordOnDark: '#ffffff',
      textureLight: WOOD_GRAIN,
      textureDark: WOOD_GRAIN,
    },
  },
  {
    id: 'dark-green',
    labelKey: 'themes.boards.dark-green',
    category: 'solid',
    border: '#4a6741',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#eaeed2',
      dark: '#5d7d4a',
      ...STD,
      legalDot: 'rgba(20,30,10,0.30)',
      arrowDefault: '#3d6b1f',
      coordOnLight: '#3c5427',
      coordOnDark: '#ffffff',
    },
  },
  {
    id: 'red',
    labelKey: 'themes.boards.red',
    category: 'solid',
    border: '#8e3a31',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f2d5cf',
      dark: '#a8433a',
      ...STD,
      legalDot: 'rgba(40,10,5,0.28)',
      arrowDefault: '#33691e',
      coordOnLight: '#7c2d22',
      coordOnDark: '#ffd9d2',
    },
  },
  {
    id: 'sand',
    labelKey: 'themes.boards.sand',
    category: 'solid',
    border: '#a0854c',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f2e6c9',
      dark: '#b89b5e',
      ...STD,
      legalDot: 'rgba(50,40,10,0.28)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#66521f',
      coordOnDark: '#2e2308',
    },
  },
  {
    id: 'sky',
    labelKey: 'themes.boards.sky',
    category: 'solid',
    border: '#6390b8',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#e6f0f7',
      dark: '#6f9cc4',
      ...STD,
      legalDot: 'rgba(10,30,50,0.28)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#2f5a7d',
      coordOnDark: '#16303f',
    },
  },
  {
    id: 'pink',
    labelKey: 'themes.boards.pink',
    category: 'solid',
    border: '#c26693',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f9e2ec',
      dark: '#d77ba6',
      ...STD,
      legalDot: 'rgba(60,10,35,0.26)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#86355c',
      coordOnDark: '#47182f',
    },
  },
  {
    id: 'orange',
    labelKey: 'themes.boards.orange',
    category: 'solid',
    border: '#c67c2e',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#fbe7cd',
      dark: '#d5852f',
      ...STD,
      legalDot: 'rgba(50,25,0,0.28)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#7d4a0e',
      coordOnDark: '#2a1703',
    },
  },
  {
    id: 'teal',
    labelKey: 'themes.boards.teal',
    category: 'solid',
    border: '#417a74',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#dcefeb',
      dark: '#4f9089',
      ...STD,
      legalDot: 'rgba(5,35,30,0.28)',
      arrowDefault: '#33691e',
      coordOnLight: '#1f4f49',
      coordOnDark: '#04120e',
    },
  },
  {
    id: 'contrast',
    labelKey: 'themes.boards.contrast',
    category: 'solid',
    border: '#000000',
    provenance: 'Hand-picked flat colors (original for this project).',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#ffffff',
      dark: '#000000',
      ...STD,
      legalDot: 'rgba(128,128,128,0.6)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#000000',
      coordOnDark: '#ffffff',
    },
  },
  {
    id: 'dark-wood',
    labelKey: 'themes.boards.dark-wood',
    category: 'wood',
    border: '#54341a',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#c9a06a',
      dark: '#6f4520',
      ...STD,
      legalDot: 'rgba(30,15,0,0.30)',
      arrowDefault: '#2e5d1e',
      coordOnLight: '#42250c',
      coordOnDark: '#ffe9c4',
      textureLight: WOOD_GRAIN_DARK,
      textureDark: WOOD_GRAIN_DARK,
    },
  },
  {
    id: 'burled-wood',
    labelKey: 'themes.boards.burled-wood',
    category: 'wood',
    border: '#65401f',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#d9b078',
      dark: '#7d4e24',
      ...STD,
      legalDot: 'rgba(30,15,0,0.30)',
      arrowDefault: '#2e5d1e',
      coordOnLight: '#40260c',
      coordOnDark: '#ffe9c4',
      filterId: 'tx-burl',
    },
  },
  {
    id: 'walnut',
    labelKey: 'themes.boards.walnut',
    category: 'wood',
    border: '#75502c',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#d6b48f',
      dark: '#8a5a30',
      ...STD,
      legalDot: 'rgba(35,18,0,0.28)',
      arrowDefault: '#2e5d1e',
      coordOnLight: '#54340f',
      coordOnDark: '#fff3dd',
      filterId: 'tx-wood',
    },
  },
  {
    id: 'stone',
    labelKey: 'themes.boards.stone',
    category: 'wood',
    border: '#76736a',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#d8d5cc',
      dark: '#8b887e',
      ...STD,
      legalDot: 'rgba(20,20,15,0.28)',
      arrowDefault: '#33691e',
      coordOnLight: '#4c4a44',
      coordOnDark: '#1a1a17',
      filterId: 'tx-grain',
    },
  },
  {
    id: 'sandstone',
    labelKey: 'themes.boards.sandstone',
    category: 'wood',
    border: '#96763d',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#ead9ae',
      dark: '#ab8749',
      ...STD,
      legalDot: 'rgba(45,32,5,0.28)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#63501d',
      coordOnDark: '#241a04',
      filterId: 'tx-grain',
    },
  },
  {
    id: 'marble',
    labelKey: 'themes.boards.marble',
    category: 'polished',
    border: '#7d838f',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f4f4f6',
      dark: '#9399a6',
      ...STD,
      legalDot: 'rgba(20,22,30,0.26)',
      arrowDefault: '#33691e',
      coordOnLight: '#4a4f57',
      coordOnDark: '#23252b',
      filterId: 'tx-marble',
    },
  },
  {
    id: 'marble-dark',
    labelKey: 'themes.boards.marble-dark',
    category: 'polished',
    border: '#454a54',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#b9bcc4',
      dark: '#555a66',
      ...STD,
      legalDot: 'rgba(10,10,15,0.30)',
      arrowDefault: '#7cb342',
      coordOnLight: '#33363d',
      coordOnDark: '#f5f6f8',
      filterId: 'tx-marble',
    },
  },
  {
    id: 'metal',
    labelKey: 'themes.boards.metal',
    category: 'polished',
    border: '#68727e',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#d9dde2',
      dark: '#7e8894',
      ...STD,
      legalDot: 'rgba(10,15,20,0.28)',
      arrowDefault: '#33691e',
      coordOnLight: '#3d454f',
      coordOnDark: '#10151b',
      textureLight: BRUSHED,
      textureDark: BRUSHED,
    },
  },
  {
    id: 'glass',
    labelKey: 'themes.boards.glass',
    category: 'polished',
    border: '#5b8ab0',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#dceef5',
      dark: '#6f9ec7',
      ...STD,
      legalDot: 'rgba(10,35,50,0.26)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#2c5871',
      coordOnDark: '#12242e',
      textureLight: SHEEN,
      textureDark: SHEEN,
    },
  },
  {
    id: 'icy-sea',
    labelKey: 'themes.boards.icy-sea',
    category: 'polished',
    border: '#629dab',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#e3f2f4',
      dark: '#5499b0',
      ...STD,
      legalDot: 'rgba(10,40,50,0.26)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#26586a',
      coordOnDark: '#0a2129',
      textureLight: FROST,
      textureDark: FROST,
    },
  },
  {
    id: 'translucent',
    labelKey: 'themes.boards.translucent',
    category: 'polished',
    border: 'rgba(70,70,80,0.6)',
    provenance:
      'Original semi-transparent square tokens — the page background shows through the board.',
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: 'rgba(238,238,238,0.72)',
      dark: 'rgba(90,90,100,0.72)',
      ...STD,
      legalDot: 'rgba(20,20,25,0.30)',
      arrowDefault: '#2e5d1e',
      coordOnLight: '#3a3c44',
      coordOnDark: '#ffffff',
    },
  },
  {
    id: 'newspaper',
    labelKey: 'themes.boards.newspaper',
    category: 'paper',
    border: '#877d66',
    provenance: FILTER_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#ece7da',
      dark: '#9d927b',
      lastMove: 'rgba(255,214,64,0.45)',
      selected: 'rgba(255,214,64,0.55)',
      check: '#c62828',
      legalDot: 'rgba(30,25,15,0.28)',
      arrowDefault: '#33691e',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#57503e',
      coordOnDark: '#29241a',
      filterId: 'tx-grain',
    },
  },
  {
    id: 'parchment',
    labelKey: 'themes.boards.parchment',
    category: 'paper',
    border: '#9c7c40',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f1e3bc',
      dark: '#b28d4e',
      ...STD,
      legalDot: 'rgba(45,30,5,0.28)',
      arrowDefault: '#33691e',
      coordOnLight: '#6a4d16',
      coordOnDark: '#2e2008',
      textureLight:
        'radial-gradient(circle at 25% 30%, rgba(150,110,40,0.10) 0 12%, transparent 45%), radial-gradient(circle at 75% 70%, rgba(150,110,40,0.08) 0 10%, transparent 40%)',
      textureDark:
        'radial-gradient(circle at 25% 30%, rgba(60,35,0,0.12) 0 12%, transparent 45%), radial-gradient(circle at 75% 70%, rgba(60,35,0,0.10) 0 10%, transparent 40%)',
    },
  },
  {
    id: 'blueprint',
    labelKey: 'themes.boards.blueprint',
    category: 'paper',
    border: '#245173',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#7ea6cf',
      dark: '#2e5f8a',
      lastMove: 'rgba(255,213,79,0.45)',
      selected: 'rgba(255,213,79,0.55)',
      check: '#ff5252',
      legalDot: 'rgba(255,255,255,0.55)',
      arrowDefault: '#aeea00',
      arrowShift: '#ff8a65',
      arrowAlt: '#82b1ff',
      arrowCtrl: '#ffd740',
      coordOnLight: '#12334e',
      coordOnDark: '#ffffff',
      textureLight: BLUEPRINT_GRID,
      textureDark: BLUEPRINT_GRID,
    },
  },
  {
    id: 'neon',
    labelKey: 'themes.boards.neon',
    category: 'playful',
    border: '#00e5ff',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#23233a',
      dark: '#0c0c16',
      lastMove: 'rgba(0,255,190,0.35)',
      selected: 'rgba(255,0,200,0.35)',
      check: '#ff3860',
      legalDot: 'rgba(140,240,255,0.8)',
      arrowDefault: '#00e5ff',
      arrowShift: '#ff4081',
      arrowAlt: '#76ff03',
      arrowCtrl: '#ffd740',
      coordOnLight: '#8ef6ff',
      coordOnDark: '#8ef6ff',
      textureLight: NEON_GRID,
      textureDark: NEON_GRID,
    },
  },
  {
    id: 'bubblegum',
    labelKey: 'themes.boards.bubblegum',
    category: 'playful',
    border: '#d15c97',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#ffe3f1',
      dark: '#e56fab',
      ...STD,
      legalDot: 'rgba(90,15,50,0.26)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#8a2a5e',
      coordOnDark: '#4a1030',
      textureLight: SPARKLE,
      textureDark: SPARKLE,
    },
  },
  {
    id: 'glitter',
    labelKey: 'themes.boards.glitter',
    category: 'playful',
    border: '#9c66ad',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f6e7f4',
      dark: '#b07cc0',
      ...STD,
      legalDot: 'rgba(50,15,60,0.26)',
      arrowDefault: '#1b5e20',
      coordOnLight: '#653a75',
      coordOnDark: '#31153d',
      textureLight: SPARKLE,
      textureDark: SPARKLE,
    },
  },
  {
    id: '8-bit',
    labelKey: 'themes.boards.8-bit',
    category: 'playful',
    border: '#47854b',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f8f0d8',
      dark: '#58a05c',
      lastMove: 'rgba(255,235,59,0.5)',
      selected: 'rgba(255,235,59,0.6)',
      check: '#e53935',
      legalDot: 'rgba(15,45,18,0.35)',
      arrowDefault: '#1b5e20',
      arrowShift: '#c62828',
      arrowAlt: '#1565c0',
      arrowCtrl: '#e6a817',
      coordOnLight: '#2f5d33',
      coordOnDark: '#122b16',
      textureLight: PIXEL_DITHER,
      textureDark: PIXEL_DITHER,
    },
  },
  {
    id: 'checkers',
    labelKey: 'themes.boards.checkers',
    category: 'playful',
    border: '#1d1d21',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f5f5f5',
      dark: '#2b2b30',
      ...STD,
      legalDot: 'rgba(128,128,128,0.55)',
      arrowDefault: '#33691e',
      coordOnLight: '#333338',
      coordOnDark: '#ffffff',
      textureLight: PIXEL_DITHER,
      textureDark: PIXEL_DITHER,
    },
  },
  {
    id: 'overlay',
    labelKey: 'themes.boards.overlay',
    category: 'playful',
    border: '#7c848e',
    provenance: CSS_TEX,
    license: ORIGINAL,
    flags: {},
    tokens: {
      light: '#f2f2f2',
      dark: '#939ba4',
      ...STD,
      legalDot: 'rgba(25,28,33,0.30)',
      arrowDefault: '#33691e',
      coordOnLight: '#4a5058',
      coordOnDark: '#23272d',
      textureLight: THIN_LINES,
      textureDark: THIN_LINES,
    },
  },
];

const BY_ID = new Map(BOARD_THEME_DEFS.map((d) => [d.id, d]));

export function isBoardId(value: unknown): value is string {
  return typeof value === 'string' && (BY_ID.has(value) || value === 'gray');
}

/** Look up a board definition ('gray' resolves to 'grey'); undefined when unknown. */
export function getBoardThemeDef(id: string | undefined): BoardThemeDef | undefined {
  if (!id) return undefined;
  return BY_ID.get(id === 'gray' ? 'grey' : id);
}

/** Tokens for any accepted id; unknown ids fall back to the default board. */
export function boardTokens(id: string | undefined): BoardThemeTokens {
  return (getBoardThemeDef(id) ?? BOARD_THEME_DEFS[0]).tokens;
}
