import { describe, expect, it } from 'vitest';
import {
  ANIMATION_STYLE_DEFS,
  animationTimingFunction,
  getAnimationStyleDef,
  normalizeAnimationStyleId,
} from '@/themes/animations';
import {
  BACKGROUND_DEFS,
  getBackgroundDef,
  isBackgroundId,
  normalizeBackgroundId,
} from '@/themes/backgrounds';
import {
  BOARD_ID_LIST,
  BOARD_THEME_DEFS,
  boardTokens,
  getBoardThemeDef,
  isBoardId,
} from '@/themes/boards';
import { favoriteKey, isKnownFavorite } from '@/themes/index';
import {
  getPieceSetDef,
  isPieceSetId,
  normalizePieceSetId,
  PIECE_KEYS,
  PIECE_SET_DEFS,
  PIECE_SET_ID_LIST,
  pieceSrcFor,
} from '@/themes/pieces';
import { getPresetDef, PRESET_DEFS } from '@/themes/presets';
import { getSoundThemeDef, normalizeSoundThemeId, SOUND_THEME_DEFS } from '@/themes/sounds';
import type { BackgroundCategory, BoardCategory, PieceCategory } from '@/themes/types';

// Allowed categories per kind, taken from src/themes/types.ts.
const BOARD_CATEGORIES: readonly BoardCategory[] = [
  'solid',
  'wood',
  'polished',
  'paper',
  'playful',
];
const PIECE_CATEGORIES: readonly PieceCategory[] = [
  'classic',
  'modern',
  'traditional',
  'material',
  'pixel',
  'shape',
  'fun',
  'accessibility',
];
const BACKGROUND_CATEGORIES: readonly BackgroundCategory[] = [
  'plain',
  'texture',
  'scenic',
  'custom',
];
const SOUND_ENGINES = ['wav', 'synth', 'none'] as const;

function expectCommonDefShape(def: {
  id: unknown;
  labelKey: unknown;
  provenance: unknown;
  license: unknown;
}) {
  expect(typeof def.id).toBe('string');
  expect((def.id as string).length).toBeGreaterThan(0);
  expect(typeof def.labelKey).toBe('string');
  expect(def.labelKey as string).toContain('.');
  expect(typeof def.provenance).toBe('string');
  expect((def.provenance as string).length).toBeGreaterThan(0);
  expect(typeof def.license).toBe('string');
  expect((def.license as string).length).toBeGreaterThan(0);
}

function expectUniqueIds(defs: readonly { id: string }[]) {
  const ids = defs.map((d) => d.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('theme registry — legacy ids preserved', () => {
  it('BOARD_ID_LIST head is the exact legacy order', () => {
    // Stage A: the list WAS exactly the legacy boards. Stage B grew it
    // to 30+; the legacy boards stay first, in order, in both the id
    // list and the defs array.
    const legacy = ['green', 'brown', 'blue', 'grey', 'purple', 'wood'];
    expect([...BOARD_ID_LIST].slice(0, 6)).toEqual(legacy);
    expect(BOARD_THEME_DEFS.map((d) => d.id).slice(0, 6)).toEqual(legacy);
    expect(BOARD_ID_LIST.length).toBeGreaterThanOrEqual(30);
    expect([...BOARD_ID_LIST]).toEqual(BOARD_THEME_DEFS.map((d) => d.id));
  });

  it('PIECE_SET_ID_LIST head is the exact legacy order', () => {
    const legacy = ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast'];
    expect([...PIECE_SET_ID_LIST].slice(0, 5)).toEqual(legacy);
    expect(PIECE_SET_DEFS.map((d) => d.id).slice(0, 5)).toEqual(legacy);
    // Stage C: 30+ generated sets on top of the legacy five.
    expect(PIECE_SET_ID_LIST.length).toBe(36);
    expect([...PIECE_SET_ID_LIST]).toEqual(PIECE_SET_DEFS.map((d) => d.id));
  });
});

describe('theme registry — every def is well-formed', () => {
  it('board defs: common shape + category from the allowed set', () => {
    expect(BOARD_THEME_DEFS.length).toBeGreaterThan(0);
    for (const def of BOARD_THEME_DEFS) {
      expectCommonDefShape(def);
      expect(BOARD_CATEGORIES).toContain(def.category);
    }
  });

  it('piece set defs: common shape + category from the allowed set', () => {
    expect(PIECE_SET_DEFS.length).toBeGreaterThan(0);
    for (const def of PIECE_SET_DEFS) {
      expectCommonDefShape(def);
      expect(PIECE_CATEGORIES).toContain(def.category);
    }
  });

  it('background defs: common shape + category from the allowed set', () => {
    expect(BACKGROUND_DEFS.length).toBeGreaterThan(0);
    for (const def of BACKGROUND_DEFS) {
      expectCommonDefShape(def);
      expect(BACKGROUND_CATEGORIES).toContain(def.category);
    }
  });

  it('sound theme defs: common shape + engine from the allowed set (sounds carry engine, not category)', () => {
    expect(SOUND_THEME_DEFS.length).toBeGreaterThan(0);
    for (const def of SOUND_THEME_DEFS) {
      expectCommonDefShape(def);
      expect(SOUND_ENGINES).toContain(def.engine);
    }
  });

  it('animation style defs: common shape + non-empty timing function (animations carry timing, not category)', () => {
    expect(ANIMATION_STYLE_DEFS.length).toBeGreaterThan(0);
    for (const def of ANIMATION_STYLE_DEFS) {
      expectCommonDefShape(def);
      expect(typeof def.timingFunction).toBe('string');
      expect(def.timingFunction.length).toBeGreaterThan(0);
    }
  });

  it('preset defs: common shape', () => {
    expect(PRESET_DEFS.length).toBeGreaterThan(0);
    for (const def of PRESET_DEFS) {
      expectCommonDefShape(def);
    }
  });
});

describe('theme registry — ids are unique per kind', () => {
  it('no duplicate ids in any registry', () => {
    expectUniqueIds(BOARD_THEME_DEFS);
    expectUniqueIds(PIECE_SET_DEFS);
    expectUniqueIds(BACKGROUND_DEFS);
    expectUniqueIds(SOUND_THEME_DEFS);
    expectUniqueIds(ANIMATION_STYLE_DEFS);
    expectUniqueIds(PRESET_DEFS);
  });
});

describe('theme registry — board lookup', () => {
  it("getBoardThemeDef('gray') returns the grey def", () => {
    const grey = getBoardThemeDef('grey');
    expect(grey).toBeDefined();
    expect(grey?.id).toBe('grey');
    expect(getBoardThemeDef('gray')).toBe(grey);
    expect(isBoardId('gray')).toBe(true);
    expect(isBoardId('grey')).toBe(true);
  });

  it("getBoardThemeDef('nope') is undefined and isBoardId rejects it", () => {
    expect(getBoardThemeDef('nope')).toBeUndefined();
    expect(getBoardThemeDef(undefined)).toBeUndefined();
    expect(isBoardId('nope')).toBe(false);
    expect(isBoardId(42)).toBe(false);
    expect(isBoardId(undefined)).toBe(false);
  });

  it("boardTokens('nope') falls back to the green def's tokens (same object)", () => {
    const green = getBoardThemeDef('green');
    expect(green).toBeDefined();
    expect(boardTokens('nope')).toBe(green?.tokens);
    expect(boardTokens('nope')).toBe(BOARD_THEME_DEFS[0].tokens);
    expect(boardTokens(undefined)).toBe(green?.tokens);
    expect(boardTokens('wood')).toBe(getBoardThemeDef('wood')?.tokens);
  });
});

describe('theme registry — normalize* functions', () => {
  const garbage: unknown[] = [undefined, 42, 'gone'];

  it('normalizeBackgroundId: garbage → standard, valid ids pass through', () => {
    for (const value of garbage) {
      expect(normalizeBackgroundId(value)).toBe('standard');
    }
    expect(normalizeBackgroundId('standard')).toBe('standard');
    expect(normalizeBackgroundId('charcoal')).toBe('charcoal');
    expect(normalizeBackgroundId('classic')).toBe('classic');
    expect(isBackgroundId('charcoal')).toBe(true);
    expect(isBackgroundId('gone')).toBe(false);
    expect(getBackgroundDef('charcoal')?.id).toBe('charcoal');
    expect(getBackgroundDef('nope')).toBeUndefined();
  });

  it('normalizeSoundThemeId: garbage → standard, valid ids pass through', () => {
    for (const value of garbage) {
      expect(normalizeSoundThemeId(value)).toBe('standard');
    }
    expect(normalizeSoundThemeId('standard')).toBe('standard');
    expect(normalizeSoundThemeId('silent')).toBe('silent');
    expect(getSoundThemeDef('silent')?.id).toBe('silent');
    expect(getSoundThemeDef('nope')).toBeUndefined();
  });

  it('normalizeAnimationStyleId: garbage → slide, valid ids pass through', () => {
    for (const value of garbage) {
      expect(normalizeAnimationStyleId(value)).toBe('slide');
    }
    expect(normalizeAnimationStyleId('slide')).toBe('slide');
    expect(normalizeAnimationStyleId('spring')).toBe('spring');
    expect(normalizeAnimationStyleId('off')).toBe('off');
  });

  it('normalizePieceSetId: garbage → cburnett, valid ids pass through', () => {
    for (const value of garbage) {
      expect(normalizePieceSetId(value)).toBe('cburnett');
    }
    expect(normalizePieceSetId('cburnett')).toBe('cburnett');
    expect(normalizePieceSetId('neo')).toBe('neo');
    expect(normalizePieceSetId('high-contrast')).toBe('high-contrast');
    expect(isPieceSetId('neo')).toBe(true);
    expect(isPieceSetId('gone')).toBe(false);
    expect(isPieceSetId(42)).toBe(false);
    expect(getPieceSetDef('neo')?.id).toBe('neo');
    expect(getPieceSetDef('nope')).toBeUndefined();
  });
});

describe('theme registry — animation timing', () => {
  it("animationTimingFunction('off') returns the off def's timing", () => {
    const off = getAnimationStyleDef('off');
    expect(off).toBeDefined();
    expect(animationTimingFunction('off')).toBe(off?.timingFunction);
  });

  it("animationTimingFunction(unknown) falls back to the slide def's timing", () => {
    const slide = getAnimationStyleDef('slide');
    expect(slide).toBeDefined();
    expect(animationTimingFunction('nope')).toBe(slide?.timingFunction);
    expect(animationTimingFunction(undefined)).toBe(slide?.timingFunction);
    expect(animationTimingFunction('slide')).toBe(slide?.timingFunction);
  });
});

describe('theme registry — presets reference existing assets', () => {
  it('every PRESET_DEFS entry references existing board/piece/background/sound/animation ids', () => {
    for (const preset of PRESET_DEFS) {
      expect(getBoardThemeDef(preset.boardTheme), `${preset.id}.boardTheme`).toBeDefined();
      expect(getPieceSetDef(preset.pieceSet), `${preset.id}.pieceSet`).toBeDefined();
      expect(getBackgroundDef(preset.backgroundId), `${preset.id}.backgroundId`).toBeDefined();
      expect(getSoundThemeDef(preset.soundThemeId), `${preset.id}.soundThemeId`).toBeDefined();
      expect(
        getAnimationStyleDef(preset.animationStyleId),
        `${preset.id}.animationStyleId`,
      ).toBeDefined();
      expect(getPresetDef(preset.id)).toBe(preset);
    }
    expect(getPresetDef('nope')).toBeUndefined();
    expect(getPresetDef(undefined)).toBeUndefined();
  });
});

describe('theme registry — pieces helpers', () => {
  it("pieceSrcFor('neo', 'bQ') builds the public SVG URL", () => {
    expect(pieceSrcFor('neo', 'bQ')).toBe('/pieces/neo/bQ.svg');
    expect(pieceSrcFor('cburnett', 'wP')).toBe('/pieces/cburnett/wP.svg');
  });

  it('PIECE_KEYS has exactly 12 entries', () => {
    expect(PIECE_KEYS).toHaveLength(12);
    expect([...PIECE_KEYS]).toEqual([
      'wP',
      'wN',
      'wB',
      'wR',
      'wQ',
      'wK',
      'bP',
      'bN',
      'bB',
      'bR',
      'bQ',
      'bK',
    ]);
  });
});

describe('theme registry — favorites', () => {
  it('favoriteKey joins kind and id with a colon', () => {
    expect(favoriteKey('board', 'wood')).toBe('board:wood');
    expect(favoriteKey('background', 'classic')).toBe('background:classic');
    expect(favoriteKey('pieces', 'neo')).toBe('pieces:neo');
  });

  it('isKnownFavorite accepts known kind:id keys', () => {
    expect(isKnownFavorite('board:wood')).toBe(true);
    expect(isKnownFavorite('board:green')).toBe(true);
    // NOTE (implementation truth, Stage A): BACKGROUND_ID_LIST has no
    // 'wood' id — its ids are standard/charcoal/midnight/forest/classic/
    // paper/light — so a known background favorite is e.g. 'classic'.
    // The brief's example 'background:wood' therefore does NOT hold
    // against the current registry (see the dedicated assertion below).
    expect(isKnownFavorite('background:classic')).toBe(true);
    expect(isKnownFavorite('background:standard')).toBe(true);
    expect(isKnownFavorite('pieces:neo')).toBe(true);
    expect(isKnownFavorite('sound:standard')).toBe(true);
    expect(isKnownFavorite('animation:slide')).toBe(true);
    expect(isKnownFavorite('preset:classic-green')).toBe(true);
    expect(isKnownFavorite(favoriteKey('board', 'wood'))).toBe(true);
  });

  it('isKnownFavorite rejects unknown ids, bare ids, and non-strings', () => {
    expect(isKnownFavorite('board:nope')).toBe(false);
    expect(isKnownFavorite('wood')).toBe(false);
    expect(isKnownFavorite(42)).toBe(false);
    expect(isKnownFavorite(undefined)).toBe(false);
    expect(isKnownFavorite(null)).toBe(false);
    expect(isKnownFavorite('')).toBe(false);
    expect(isKnownFavorite(':wood')).toBe(false);
    expect(isKnownFavorite('unknownkind:wood')).toBe(false);
    // Registry truth, updated per stage: Stage B added a 'wood'
    // background, so this favorite is now valid…
    expect(isKnownFavorite('background:wood')).toBe(true);
    // …while a genuinely unknown background id is still rejected.
    expect(isKnownFavorite('background:nope')).toBe(false);
  });
});
