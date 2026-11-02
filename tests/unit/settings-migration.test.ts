import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings } from '@/store/settingsStore';

describe('settings migration (Prompt 7)', () => {
  it('defaults are the Classic set, inside coordinates, 640px board', () => {
    expect(DEFAULT_SETTINGS.pieceSet).toBe('cburnett');
    expect(DEFAULT_SETTINGS.coordinates).toBe('inside');
    expect(DEFAULT_SETTINGS.boardSizePx).toBe(640);
    expect(DEFAULT_SETTINGS.boardTheme).toBe('green');
  });

  it('migrates legacy showCoordinates true → inside, false → off', () => {
    expect(migrateSettings({ showCoordinates: true }).coordinates).toBe('inside');
    expect(migrateSettings({ showCoordinates: false }).coordinates).toBe('off');
  });

  it('an explicit new coordinates value wins over the legacy boolean', () => {
    expect(migrateSettings({ showCoordinates: true, coordinates: 'outside' }).coordinates).toBe(
      'outside',
    );
    expect(migrateSettings({ showCoordinates: false, coordinates: 'inside' }).coordinates).toBe(
      'inside',
    );
  });

  it('drops the legacy boolean from the merged result', () => {
    const merged = migrateSettings({ showCoordinates: false }) as unknown as Record<
      string,
      unknown
    >;
    expect('showCoordinates' in merged).toBe(false);
  });

  it("keeps a stored 'cburnett' piece set working and validates unknown sets", () => {
    expect(migrateSettings({ pieceSet: 'cburnett' }).pieceSet).toBe('cburnett');
    expect(migrateSettings({ pieceSet: 'neo' }).pieceSet).toBe('neo');
    expect(migrateSettings({ pieceSet: 'gone-set' as never }).pieceSet).toBe('cburnett');
  });

  it("keeps the stored 'grey' board theme and fills new fields with defaults", () => {
    const merged = migrateSettings({ boardTheme: 'grey', sounds: false });
    expect(merged.boardTheme).toBe('grey');
    expect(merged.sounds).toBe(false);
    expect(merged.boardSizePx).toBe(640);
    expect(merged.coordinates).toBe('inside');
  });

  it('clamps boardSizePx to 320–760', () => {
    expect(migrateSettings({ boardSizePx: 100 }).boardSizePx).toBe(320);
    expect(migrateSettings({ boardSizePx: 5000 }).boardSizePx).toBe(760);
    expect(migrateSettings({ boardSizePx: 500 }).boardSizePx).toBe(500);
  });

  it('handles an empty/undefined persisted blob', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings migration (Themes & Presets, schema v2)', () => {
  it('SETTINGS_SCHEMA_VERSION is 2', async () => {
    const { SETTINGS_SCHEMA_VERSION } = await import('@/store/settingsStore');
    expect(SETTINGS_SCHEMA_VERSION).toBe(2);
  });

  it('defaults include the v2 theme fields', () => {
    expect(DEFAULT_SETTINGS.backgroundId).toBe('standard');
    expect(DEFAULT_SETTINGS.soundThemeId).toBe('standard');
    expect(DEFAULT_SETTINGS.animationStyleId).toBe('slide');
    expect(DEFAULT_SETTINGS.highlightStyle).toBe('solid');
    expect(DEFAULT_SETTINGS.moveHintStyle).toBe('dots');
    expect(DEFAULT_SETTINGS.favorites).toEqual([]);
    expect(DEFAULT_SETTINGS.userPresets).toEqual([]);
    expect(DEFAULT_SETTINGS.randomizeThemesAfterGame).toBe(false);

    const merged = migrateSettings({});
    expect(merged.backgroundId).toBe('standard');
    expect(merged.soundThemeId).toBe('standard');
    expect(merged.animationStyleId).toBe('slide');
    expect(merged.highlightStyle).toBe('solid');
    expect(merged.moveHintStyle).toBe('dots');
    expect(merged.favorites).toEqual([]);
    expect(merged.userPresets).toEqual([]);
    expect(merged.randomizeThemesAfterGame).toBe(false);
  });

  it('unknown backgroundId/soundThemeId/animationStyleId fall back to defaults; valid ones are kept', () => {
    const bad = migrateSettings({
      backgroundId: 'gone-bg',
      soundThemeId: 'gone-sound',
      animationStyleId: 'gone-anim',
    });
    expect(bad.backgroundId).toBe('standard');
    expect(bad.soundThemeId).toBe('standard');
    expect(bad.animationStyleId).toBe('slide');

    const good = migrateSettings({
      backgroundId: 'charcoal',
      soundThemeId: 'silent',
      animationStyleId: 'spring',
    });
    expect(good.backgroundId).toBe('charcoal');
    expect(good.soundThemeId).toBe('silent');
    expect(good.animationStyleId).toBe('spring');
  });

  it("invalid highlightStyle/moveHintStyle fall back to 'solid'/'dots'; valid ones are kept", () => {
    const bad = migrateSettings({
      highlightStyle: 'glow' as never,
      moveHintStyle: 'arrows' as never,
    });
    expect(bad.highlightStyle).toBe('solid');
    expect(bad.moveHintStyle).toBe('dots');

    expect(migrateSettings({ highlightStyle: 'ring' }).highlightStyle).toBe('ring');
    expect(migrateSettings({ highlightStyle: 'solid' }).highlightStyle).toBe('solid');
    expect(migrateSettings({ moveHintStyle: 'rings' }).moveHintStyle).toBe('rings');
    expect(migrateSettings({ moveHintStyle: 'none' }).moveHintStyle).toBe('none');
    expect(migrateSettings({ moveHintStyle: 'dots' }).moveHintStyle).toBe('dots');
  });

  it('favorites: known keys kept, unknown dropped, duplicates removed', () => {
    const merged = migrateSettings({
      favorites: [
        'board:wood',
        'pieces:neo',
        'background:classic',
        'board:nope',
        'not-a-favorite',
        'board:wood',
        'pieces:neo',
      ],
    });
    expect(merged.favorites).toEqual(['board:wood', 'pieces:neo', 'background:classic']);
  });

  it('favorites: a non-array value resets to []', () => {
    expect(migrateSettings({ favorites: 'board:wood' as never }).favorites).toEqual([]);
    expect(migrateSettings({ favorites: undefined }).favorites).toEqual([]);
  });

  it('userPresets: a valid preset is kept; an invalid entry is dropped while a valid sibling survives', () => {
    const validPreset = {
      id: 'preset-1',
      name: 'My Preset',
      createdAt: 123,
      boardTheme: 'wood',
      pieceSet: 'neo',
      backgroundId: 'charcoal',
      soundThemeId: 'silent',
      animationStyleId: 'spring',
    };
    const merged = migrateSettings({
      userPresets: [validPreset, { name: 5 } as never, validPreset] as never,
    });
    // Both copies of the valid preset survive; only the invalid entry drops.
    expect(merged.userPresets).toHaveLength(2);
    expect(merged.userPresets[0]).toEqual(validPreset);
    expect(merged.userPresets[1]).toEqual(validPreset);

    const onlyInvalid = migrateSettings({ userPresets: [{ name: 5 } as never] });
    expect(onlyInvalid.userPresets).toEqual([]);

    expect(migrateSettings({ userPresets: 'nope' as never }).userPresets).toEqual([]);
  });

  it("boardTheme: unknown id → 'green'; 'grey' and 'gray' are kept", () => {
    expect(migrateSettings({ boardTheme: 'gone-board' }).boardTheme).toBe('green');
    expect(migrateSettings({ boardTheme: 'grey' }).boardTheme).toBe('grey');
    expect(migrateSettings({ boardTheme: 'gray' }).boardTheme).toBe('gray');
    expect(migrateSettings({ boardTheme: 'wood' }).boardTheme).toBe('wood');
  });

  it('randomizeThemesAfterGame: only literal true survives', () => {
    expect(migrateSettings({ randomizeThemesAfterGame: true }).randomizeThemesAfterGame).toBe(true);
    expect(migrateSettings({ randomizeThemesAfterGame: false }).randomizeThemesAfterGame).toBe(
      false,
    );
    expect(
      migrateSettings({ randomizeThemesAfterGame: 'yes' as never }).randomizeThemesAfterGame,
    ).toBe(false);
  });
});

describe('schema v2 — Stage B fields (customBackground, lowPowerBackgrounds)', () => {
  it('migrateSettings(undefined) includes the sanitized custom-background defaults and lowPowerBackgrounds false', () => {
    const merged = migrateSettings(undefined);
    expect(merged.customBackground).toEqual({
      color: '#3a3f4a',
      gradientFrom: '#3a3f4a',
      gradientTo: '#17181c',
      gradientAngle: 135,
      scrim: 0.35,
    });
    expect(merged.lowPowerBackgrounds).toBe(false);
  });

  it('keeps a valid customBackground color and clamps an out-of-range scrim', () => {
    const merged = migrateSettings({
      customBackground: { color: '#112233', scrim: 5 } as never,
    });
    expect(merged.customBackground.color).toBe('#112233');
    expect(merged.customBackground.scrim).toBe(0.8);
    expect(merged.customBackground.gradientFrom).toBe('#3a3f4a');
    expect(merged.customBackground.gradientTo).toBe('#17181c');
    expect(merged.customBackground.gradientAngle).toBe(135);
  });

  it("a 'junk' customBackground resets to the defaults", () => {
    const merged = migrateSettings({ customBackground: 'junk' as never });
    expect(merged.customBackground).toEqual({
      color: '#3a3f4a',
      gradientFrom: '#3a3f4a',
      gradientTo: '#17181c',
      gradientAngle: 135,
      scrim: 0.35,
    });
  });

  it('lowPowerBackgrounds: only literal true survives', () => {
    expect(migrateSettings({ lowPowerBackgrounds: true }).lowPowerBackgrounds).toBe(true);
    expect(migrateSettings({ lowPowerBackgrounds: false }).lowPowerBackgrounds).toBe(false);
    expect(migrateSettings({ lowPowerBackgrounds: 1 as never }).lowPowerBackgrounds).toBe(false);
    expect(migrateSettings({ lowPowerBackgrounds: 'yes' as never }).lowPowerBackgrounds).toBe(
      false,
    );
    expect(migrateSettings({}).lowPowerBackgrounds).toBe(false);
  });

  it('a full DEFAULT_SETTINGS round trip is unchanged', () => {
    expect(migrateSettings(structuredClone(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });
});
