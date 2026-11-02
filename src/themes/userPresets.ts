/**
 * User presets (Themes & Presets program): pure helpers for the
 * presets users create themselves — CRUD over a plain array, plus a
 * dependency-free structural validator used by settings migration.
 * User presets are persisted inside the settings store; everything
 * here is storage-agnostic and unit-tested.
 *
 * JSON export/import lives in `src/themes/presetTransfer.ts` — it is
 * the only theme module that pulls Zod, so the settings store's import
 * graph (every page's first load) stays Zod-free.
 */
import { sanitizeSelection } from './presets';
import type { ThemeSelection } from './types';

export interface UserPreset extends ThemeSelection {
  /** Unique id (crypto.randomUUID at creation). */
  id: string;
  /** User-chosen display name (1–60 chars). */
  name: string;
  createdAt: number;
}

export const PRESET_NAME_MAX = 60;

export function newPresetId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `preset-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

export function createUserPreset(
  name: string,
  selection: ThemeSelection,
  now: number = Date.now(),
): UserPreset {
  return {
    ...sanitizeSelection(selection).selection,
    id: newPresetId(),
    name: name.trim().slice(0, PRESET_NAME_MAX) || 'Preset',
    createdAt: now,
  };
}

export function addUserPreset(list: readonly UserPreset[], preset: UserPreset): UserPreset[] {
  return [...list, preset];
}

export function renameUserPreset(
  list: readonly UserPreset[],
  id: string,
  name: string,
): UserPreset[] {
  const clean = name.trim().slice(0, PRESET_NAME_MAX);
  if (!clean) return [...list];
  return list.map((p) => (p.id === id ? { ...p, name: clean } : p));
}

export function duplicateUserPreset(
  list: readonly UserPreset[],
  id: string,
  now: number = Date.now(),
): UserPreset[] {
  const source = list.find((p) => p.id === id);
  if (!source) return [...list];
  return [
    ...list,
    {
      ...source,
      id: newPresetId(),
      name: `${source.name} (2)`.slice(0, PRESET_NAME_MAX),
      createdAt: now,
    },
  ];
}

export function removeUserPreset(list: readonly UserPreset[], id: string): UserPreset[] {
  return list.filter((p) => p.id !== id);
}

const SELECTION_FIELDS = [
  'boardTheme',
  'pieceSet',
  'backgroundId',
  'soundThemeId',
  'animationStyleId',
] as const;

/**
 * Validate one persisted user preset (settings migration); null when
 * structurally invalid. Unknown theme ids inside an otherwise valid
 * preset are sanitized to registry defaults rather than dropping the
 * user's preset.
 */
export function sanitizeUserPreset(value: unknown): UserPreset | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 80) return null;
  if (typeof v.name !== 'string' || v.name.trim().length === 0 || v.name.length > PRESET_NAME_MAX) {
    return null;
  }
  if (typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt) || v.createdAt < 0) {
    return null;
  }
  for (const field of SELECTION_FIELDS) {
    const fieldValue = v[field];
    if (typeof fieldValue !== 'string' || fieldValue.length === 0 || fieldValue.length > 64) {
      return null;
    }
  }
  const { selection } = sanitizeSelection(v as Partial<ThemeSelection>);
  return { ...selection, id: v.id, name: v.name, createdAt: v.createdAt };
}
