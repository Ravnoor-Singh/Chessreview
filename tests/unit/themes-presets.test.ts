import { describe, expect, it } from 'vitest';
import { getAnimationStyleDef } from '@/themes/animations';
import { getBackgroundDef } from '@/themes/backgrounds';
import { getBoardThemeDef } from '@/themes/boards';
import { getPieceSetDef } from '@/themes/pieces';
import { randomSelection, sanitizeSelection, selectionToSettingsPatch } from '@/themes/presets';
import { getSoundThemeDef } from '@/themes/sounds';
import { DEFAULT_THEME_SELECTION, type ThemeSelection } from '@/themes/types';
import {
  addUserPreset,
  createUserPreset,
  duplicateUserPreset,
  removeUserPreset,
  renameUserPreset,
  sanitizeUserPreset,
  type UserPreset,
} from '@/themes/userPresets';
import {
  exportPresetJson,
  parsePresetImport,
  PRESET_EXPORT_KIND,
  PRESET_EXPORT_VERSION,
  PRESET_IMPORT_MAX_BYTES,
} from '@/themes/presetTransfer';

/** Deterministic PRNG (mulberry32) for reproducible random-selection tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VALID_SELECTION: ThemeSelection = {
  boardTheme: 'wood',
  pieceSet: 'neo',
  backgroundId: 'charcoal',
  soundThemeId: 'silent',
  animationStyleId: 'spring',
};

const SELECTION_FIELDS = [
  'animationStyleId',
  'backgroundId',
  'boardTheme',
  'pieceSet',
  'soundThemeId',
] as const;

describe('selectionToSettingsPatch', () => {
  it('returns exactly the five selection fields', () => {
    const patch = selectionToSettingsPatch(VALID_SELECTION);
    expect(Object.keys(patch).sort()).toEqual([...SELECTION_FIELDS].sort());
    expect(patch).toEqual(VALID_SELECTION);
  });

  it('returns the default selection verbatim for the default input', () => {
    const patch = selectionToSettingsPatch(DEFAULT_THEME_SELECTION);
    expect(patch).toEqual({
      boardTheme: 'green',
      pieceSet: 'cburnett',
      backgroundId: 'standard',
      soundThemeId: 'standard',
      animationStyleId: 'slide',
    });
  });

  it('does not leak unrelated fields from an over-wide input', () => {
    const wide = { ...VALID_SELECTION, theme: 'dark', extra: 1 } as unknown as ThemeSelection;
    const patch = selectionToSettingsPatch(wide);
    expect(Object.keys(patch).sort()).toEqual([...SELECTION_FIELDS].sort());
    expect(patch).toEqual(VALID_SELECTION);
  });
});

describe('sanitizeSelection', () => {
  it('passes a valid selection through with replaced=[]', () => {
    const { selection, replaced } = sanitizeSelection(VALID_SELECTION);
    expect(selection).toEqual(VALID_SELECTION);
    expect(replaced).toEqual([]);
  });

  it('passes the default selection through with replaced=[]', () => {
    const { selection, replaced } = sanitizeSelection({ ...DEFAULT_THEME_SELECTION });
    expect(selection).toEqual(DEFAULT_THEME_SELECTION);
    expect(replaced).toEqual([]);
  });

  it('replaces unknown ids with defaults and names them in replaced', () => {
    const { selection, replaced } = sanitizeSelection({
      boardTheme: 'gone-board',
      pieceSet: 'gone-pieces',
      backgroundId: 'gone-bg',
      soundThemeId: 'gone-sound',
      animationStyleId: 'gone-anim',
    });
    expect(selection).toEqual(DEFAULT_THEME_SELECTION);
    expect([...replaced].sort()).toEqual([...SELECTION_FIELDS].sort());
  });

  it('replaces only the unknown fields and keeps the valid ones', () => {
    const { selection, replaced } = sanitizeSelection({
      ...VALID_SELECTION,
      boardTheme: 'nope',
    });
    expect(selection.boardTheme).toBe(DEFAULT_THEME_SELECTION.boardTheme);
    expect(selection.pieceSet).toBe(VALID_SELECTION.pieceSet);
    expect(selection.backgroundId).toBe(VALID_SELECTION.backgroundId);
    expect(selection.soundThemeId).toBe(VALID_SELECTION.soundThemeId);
    expect(selection.animationStyleId).toBe(VALID_SELECTION.animationStyleId);
    expect(replaced).toEqual(['boardTheme']);
  });

  it('empty object → all defaults, replaced=[] (absent fields are not "replaced")', () => {
    const { selection, replaced } = sanitizeSelection({});
    expect(selection).toEqual(DEFAULT_THEME_SELECTION);
    expect(replaced).toEqual([]);
  });

  it('partial object: present valid fields kept, absent fields default without being replaced', () => {
    const { selection, replaced } = sanitizeSelection({ boardTheme: 'wood' });
    expect(selection).toEqual({ ...DEFAULT_THEME_SELECTION, boardTheme: 'wood' });
    expect(replaced).toEqual([]);
  });
});

describe('randomSelection', () => {
  it('returns only known ids across 200 seeded draws, animation always slide/spring', () => {
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < 200; i++) {
      const sel = randomSelection(rng);
      expect(getBoardThemeDef(sel.boardTheme), `draw ${i} boardTheme`).toBeDefined();
      expect(getPieceSetDef(sel.pieceSet), `draw ${i} pieceSet`).toBeDefined();
      expect(getBackgroundDef(sel.backgroundId), `draw ${i} backgroundId`).toBeDefined();
      expect(getSoundThemeDef(sel.soundThemeId), `draw ${i} soundThemeId`).toBeDefined();
      expect(getAnimationStyleDef(sel.animationStyleId), `draw ${i} animation`).toBeDefined();
      // Random picks stay calm by design: arcade/off are never chosen, and
      // (with the current registry carrying no lowReadability flags) the
      // excludeLowReadability default cannot filter anything out — so the
      // observable contract is known ids + calm animations only.
      expect(['slide', 'spring']).toContain(sel.animationStyleId);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = randomSelection(mulberry32(42));
    const b = randomSelection(mulberry32(42));
    expect(a).toEqual(b);
  });

  it('honours excludeLowReadability explicitly without breaking validity', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const sel = randomSelection(rng, { excludeLowReadability: true });
      expect(getBoardThemeDef(sel.boardTheme)).toBeDefined();
      expect(getPieceSetDef(sel.pieceSet)).toBeDefined();
      expect(getBackgroundDef(sel.backgroundId)).toBeDefined();
      const sel2 = randomSelection(rng, { excludeLowReadability: false });
      expect(getBoardThemeDef(sel2.boardTheme)).toBeDefined();
      expect(getPieceSetDef(sel2.pieceSet)).toBeDefined();
    }
  });
});

describe('user preset CRUD', () => {
  it('createUserPreset trims the name, generates an id, and uses the injected now', () => {
    const preset = createUserPreset('  My Theme  ', VALID_SELECTION, 1_700_000_000_000);
    expect(preset.name).toBe('My Theme');
    expect(typeof preset.id).toBe('string');
    expect(preset.id.length).toBeGreaterThan(0);
    expect(preset.createdAt).toBe(1_700_000_000_000);
    expect({
      boardTheme: preset.boardTheme,
      pieceSet: preset.pieceSet,
      backgroundId: preset.backgroundId,
      soundThemeId: preset.soundThemeId,
      animationStyleId: preset.animationStyleId,
    }).toEqual(VALID_SELECTION);
  });

  it('createUserPreset caps the name at 60 chars', () => {
    const preset = createUserPreset('x'.repeat(80), VALID_SELECTION, 1);
    expect(preset.name).toHaveLength(60);
    expect(preset.name).toBe('x'.repeat(60));
  });

  it('createUserPreset sanitizes unknown selection ids to defaults', () => {
    const preset = createUserPreset('Bad ids', { ...VALID_SELECTION, boardTheme: 'gone' }, 5);
    expect(preset.boardTheme).toBe(DEFAULT_THEME_SELECTION.boardTheme);
  });

  it('addUserPreset appends without mutating the original list', () => {
    const a = createUserPreset('A', VALID_SELECTION, 1);
    const b = createUserPreset('B', DEFAULT_THEME_SELECTION, 2);
    const list: UserPreset[] = [a];
    const next = addUserPreset(list, b);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(a);
    expect(next[1]).toBe(b);
    expect(list).toHaveLength(1);
    expect(addUserPreset([], a)).toEqual([a]);
  });

  it('renameUserPreset renames (trimmed) and leaves other presets untouched', () => {
    const a = createUserPreset('A', VALID_SELECTION, 1);
    const b = createUserPreset('B', VALID_SELECTION, 2);
    const renamed = renameUserPreset([a, b], a.id, '  Renamed  ');
    expect(renamed.find((p) => p.id === a.id)?.name).toBe('Renamed');
    expect(renamed.find((p) => p.id === b.id)?.name).toBe('B');
    // Original object is not mutated.
    expect(a.name).toBe('A');
  });

  it('renameUserPreset with a blank name is a no-op', () => {
    const a = createUserPreset('A', VALID_SELECTION, 1);
    for (const blank of ['', '   ']) {
      const result = renameUserPreset([a], a.id, blank);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('A');
    }
  });

  it("duplicateUserPreset adds a copy with a new id, name + ' (2)', and leaves the original untouched", () => {
    const a = createUserPreset('Original', VALID_SELECTION, 1);
    const list: UserPreset[] = [a];
    const next = duplicateUserPreset(list, a.id, 999);
    expect(next).toHaveLength(2);
    const copy = next[1];
    expect(copy.id).not.toBe(a.id);
    expect(copy.id.length).toBeGreaterThan(0);
    expect(copy.name).toBe('Original (2)');
    expect(copy.createdAt).toBe(999);
    expect({
      boardTheme: copy.boardTheme,
      pieceSet: copy.pieceSet,
      backgroundId: copy.backgroundId,
      soundThemeId: copy.soundThemeId,
      animationStyleId: copy.animationStyleId,
    }).toEqual(VALID_SELECTION);
    // Original list + object untouched.
    expect(list).toHaveLength(1);
    expect(a.name).toBe('Original');
    expect(a.createdAt).toBe(1);
  });

  it('duplicateUserPreset with an unknown id returns an unchanged copy', () => {
    const a = createUserPreset('A', VALID_SELECTION, 1);
    const next = duplicateUserPreset([a], 'no-such-id', 3);
    expect(next).toHaveLength(1);
    expect(next[0]).toBe(a);
  });

  it('removeUserPreset removes by id and ignores unknown ids', () => {
    const a = createUserPreset('A', VALID_SELECTION, 1);
    const b = createUserPreset('B', VALID_SELECTION, 2);
    expect(removeUserPreset([a, b], a.id)).toEqual([b]);
    expect(removeUserPreset([a, b], b.id)).toEqual([a]);
    expect(removeUserPreset([a, b], 'nope')).toEqual([a, b]);
    expect(removeUserPreset([], a.id)).toEqual([]);
  });
});

describe('preset export / import', () => {
  it('round-trips: export → import gives ok:true, same name + selection, replaced=[]', () => {
    const preset = createUserPreset('Round Trip', VALID_SELECTION, 111);
    const json = exportPresetJson(preset);
    const parsed = JSON.parse(json) as { kind: string; version: number };
    expect(parsed.kind).toBe(PRESET_EXPORT_KIND);
    expect(parsed.version).toBe(PRESET_EXPORT_VERSION);

    const result = parsePresetImport(json, 222);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.replaced).toEqual([]);
    expect(result.preset.name).toBe('Round Trip');
    expect(result.preset.createdAt).toBe(222);
    expect(result.preset.id.length).toBeGreaterThan(0);
    expect({
      boardTheme: result.preset.boardTheme,
      pieceSet: result.preset.pieceSet,
      backgroundId: result.preset.backgroundId,
      soundThemeId: result.preset.soundThemeId,
      animationStyleId: result.preset.animationStyleId,
    }).toEqual(VALID_SELECTION);
  });

  it('import failure: non-JSON text → ok:false', () => {
    const result = parsePresetImport('this is not json {{{');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('import failure: JSON with the wrong kind → ok:false', () => {
    const text = JSON.stringify({
      kind: 'something-else',
      version: PRESET_EXPORT_VERSION,
      preset: { name: 'X', ...VALID_SELECTION },
    });
    expect(parsePresetImport(text).ok).toBe(false);
    // Also: valid JSON that is not the envelope at all.
    expect(parsePresetImport(JSON.stringify({ hello: 'world' })).ok).toBe(false);
    expect(parsePresetImport(JSON.stringify(null)).ok).toBe(false);
  });

  it('import failure: text longer than PRESET_IMPORT_MAX_BYTES → ok:false', () => {
    const tooLong = 'x'.repeat(PRESET_IMPORT_MAX_BYTES + 1);
    expect(tooLong.length).toBeGreaterThan(PRESET_IMPORT_MAX_BYTES);
    expect(parsePresetImport(tooLong).ok).toBe(false);
  });

  it('import with an unknown board id → ok:true, replaced contains boardTheme, boardTheme = default', () => {
    const text = JSON.stringify({
      kind: PRESET_EXPORT_KIND,
      version: PRESET_EXPORT_VERSION,
      preset: { name: 'Imported', ...VALID_SELECTION, boardTheme: 'gone-board' },
    });
    const result = parsePresetImport(text, 42);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.replaced).toContain('boardTheme');
    expect(result.preset.boardTheme).toBe(DEFAULT_THEME_SELECTION.boardTheme);
    expect(result.preset.name).toBe('Imported');
    // Other fields survive untouched.
    expect(result.preset.pieceSet).toBe(VALID_SELECTION.pieceSet);
  });
});

describe('sanitizeUserPreset', () => {
  const valid: UserPreset = {
    id: 'preset-1',
    name: 'Kept',
    createdAt: 123,
    ...VALID_SELECTION,
  };

  it('passes a valid object through', () => {
    const result = sanitizeUserPreset(valid);
    expect(result).not.toBeNull();
    expect(result).toEqual(valid);
  });

  it('sanitizes unknown ids inside a structurally valid preset to defaults', () => {
    const result = sanitizeUserPreset({ ...valid, boardTheme: 'gone', pieceSet: 'gone-too' });
    expect(result).not.toBeNull();
    expect(result?.boardTheme).toBe(DEFAULT_THEME_SELECTION.boardTheme);
    expect(result?.pieceSet).toBe(DEFAULT_THEME_SELECTION.pieceSet);
    expect(result?.id).toBe(valid.id);
    expect(result?.name).toBe(valid.name);
    expect(result?.createdAt).toBe(valid.createdAt);
  });

  it('returns null for garbage', () => {
    expect(sanitizeUserPreset(null)).toBeNull();
    expect(sanitizeUserPreset(undefined)).toBeNull();
    expect(sanitizeUserPreset(42)).toBeNull();
    expect(sanitizeUserPreset('preset')).toBeNull();
    expect(sanitizeUserPreset({})).toBeNull();
    expect(sanitizeUserPreset({ name: 5 })).toBeNull();
  });

  it('returns null when the name is missing or invalid', () => {
    const withoutName: Record<string, unknown> = { ...valid };
    delete withoutName.name;
    expect(sanitizeUserPreset(withoutName)).toBeNull();
    expect(sanitizeUserPreset({ ...valid, name: '' })).toBeNull();
    expect(sanitizeUserPreset({ ...valid, name: 5 })).toBeNull();
    expect(sanitizeUserPreset({ ...valid, createdAt: -1 })).toBeNull();
  });
});
