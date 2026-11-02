import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CoordinatesMode, SettingsState } from '@/components/ui/SettingsDrawer';
import { normalizePieceSet } from '@/lib/pieces';
import { detectBrowserLocale, isLocale } from '@/i18n';
import { isBoardId } from '@/themes/boards';
import { normalizeBackgroundId } from '@/themes/backgrounds';
import { normalizeSoundThemeId } from '@/themes/sounds';
import { normalizeAnimationStyleId } from '@/themes/animations';
import { isKnownFavorite } from '@/themes/favorites';
import { sanitizeUserPreset, type UserPreset } from '@/themes/userPresets';
import { DEFAULT_CUSTOM_BACKGROUND, sanitizeCustomBackground } from '@/themes/customBackground';

export const DEFAULT_SETTINGS: SettingsState = {
  theme: 'dark',
  boardTheme: 'green',
  pieceSet: 'cburnett',
  sounds: true,
  coordinates: 'inside',
  boardSizePx: 640,
  showArrows: true,
  animationMs: 150,
  depth: 'standard',
  multiPv: 3,
  threads: 0, // 0 = auto
  hashMb: 0, // 0 = auto
  parallelWorkers: false,
  engineBuild: 'auto',
  classification: 'balanced',
  locale: 'en',
  // Themes & Presets (Stage A): registry defaults.
  backgroundId: 'standard',
  soundThemeId: 'standard',
  animationStyleId: 'slide',
  highlightStyle: 'solid',
  moveHintStyle: 'dots',
  favorites: [],
  userPresets: [],
  randomizeThemesAfterGame: false,
  // Themes & Presets (Stage B): custom backgrounds + motion reduction.
  customBackground: DEFAULT_CUSTOM_BACKGROUND,
  lowPowerBackgrounds: false,
  // Themes & Presets (Stage C): sound volume + blindfold mode.
  soundVolume: 0.5,
  blindfoldMode: false,
};

export const BOARD_SIZE_MIN = 320;
export const BOARD_SIZE_MAX = 760;

/** Settings schema version (zustand persist). v2 = Themes & Presets fields. */
export const SETTINGS_SCHEMA_VERSION = 2;

/** Cap on stored user presets so a runaway import loop cannot bloat storage. */
const MAX_USER_PRESETS = 100;

type PersistedSettings = Partial<SettingsState> & {
  /** Pre-Prompt-7 boolean coordinates flag, migrated to `coordinates`. */
  showCoordinates?: boolean;
};

/**
 * Merge a persisted settings blob over the defaults, migrating legacy
 * fields (Prompt 7):
 * - `showCoordinates: true/false` → `coordinates: 'inside'/'off'`
 *   (only when the new field is absent, so new values win);
 * - unknown piece-set ids → 'cburnett' (Classic);
 * - `boardSizePx` clamped to 320–760.
 * Fields added in later versions get their default on upgraded installs.
 *
 * Themes & Presets (schema v2): every theme id is validated against the
 * registry — unknown/future ids fall back to the registry default
 * instead of crashing; favorites are filtered to known `<kind>:<id>`
 * keys; user presets are Zod-validated one by one (invalid entries are
 * dropped, valid ones keep working).
 */
export function migrateSettings(persisted: PersistedSettings | undefined): SettingsState {
  const raw: PersistedSettings = persisted ?? {};
  const merged: SettingsState = { ...DEFAULT_SETTINGS, ...raw };
  if (raw.coordinates === undefined && typeof raw.showCoordinates === 'boolean') {
    merged.coordinates = raw.showCoordinates ? 'inside' : 'off';
  }
  delete (merged as PersistedSettings).showCoordinates;
  // Locale (Prompt 10): a valid stored locale wins; an unknown value
  // falls back to English; with NO persisted blob at all (first run) the
  // browser language is mapped (hi*/pa*/es* -> that locale, else en).
  if (isLocale(raw.locale)) {
    merged.locale = raw.locale;
  } else if (persisted === undefined) {
    merged.locale = detectBrowserLocale();
  } else {
    merged.locale = DEFAULT_SETTINGS.locale;
  }
  merged.pieceSet = normalizePieceSet(merged.pieceSet);
  const size = Number(merged.boardSizePx);
  merged.boardSizePx = Number.isFinite(size)
    ? Math.max(BOARD_SIZE_MIN, Math.min(BOARD_SIZE_MAX, Math.round(size)))
    : DEFAULT_SETTINGS.boardSizePx;
  // Themes & Presets (schema v2) normalization.
  merged.boardTheme = isBoardId(merged.boardTheme) ? merged.boardTheme : 'green';
  merged.backgroundId = normalizeBackgroundId(merged.backgroundId);
  merged.soundThemeId = normalizeSoundThemeId(merged.soundThemeId);
  merged.animationStyleId = normalizeAnimationStyleId(merged.animationStyleId);
  merged.highlightStyle = merged.highlightStyle === 'ring' ? 'ring' : 'solid';
  merged.moveHintStyle =
    merged.moveHintStyle === 'rings' || merged.moveHintStyle === 'none'
      ? merged.moveHintStyle
      : 'dots';
  merged.favorites = Array.isArray(merged.favorites)
    ? [...new Set(merged.favorites.filter(isKnownFavorite))]
    : [];
  merged.userPresets = Array.isArray(merged.userPresets)
    ? (merged.userPresets
        .map(sanitizeUserPreset)
        .filter((p): p is UserPreset => p !== null)
        .slice(0, MAX_USER_PRESETS) as SettingsState['userPresets'])
    : [];
  merged.randomizeThemesAfterGame = merged.randomizeThemesAfterGame === true;
  merged.customBackground = sanitizeCustomBackground(merged.customBackground);
  merged.lowPowerBackgrounds = merged.lowPowerBackgrounds === true;
  const volume = Number(merged.soundVolume);
  merged.soundVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
  merged.blindfoldMode = merged.blindfoldMode === true;
  return merged;
}

interface SettingsStore {
  settings: SettingsState;
  update: (patch: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // First run (no persisted blob): default the locale from the
      // browser language; persist-merge replaces this on rehydration.
      settings: { ...DEFAULT_SETTINGS, locale: detectBrowserLocale() },
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'chess-review-settings',
      version: SETTINGS_SCHEMA_VERSION,
      migrate: (persistedState) => {
        const persisted = persistedState as { settings?: PersistedSettings } | undefined;
        return { settings: migrateSettings(persisted?.settings) };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { settings?: PersistedSettings } | undefined;
        return { ...currentState, settings: migrateSettings(persisted?.settings) };
      },
    },
  ),
);

export type { CoordinatesMode };
