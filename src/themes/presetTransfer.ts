/**
 * Preset export/import (Themes & Presets program): the JSON file
 * format for sharing a preset, validated with Zod.
 *
 * Import safety: the file must be ≤ 32 KB, must parse, must match the
 * export envelope, and unknown theme ids are replaced with defaults
 * (reported to the caller) instead of failing or crashing.
 *
 * This module is imported only by the settings page — it is the one
 * theme module that depends on Zod, keeping Zod out of the settings
 * store's first-load import graph.
 */
import { z } from 'zod';
import { sanitizeSelection } from './presets';
import type { ThemeSelection } from './types';
import { newPresetId, PRESET_NAME_MAX, type UserPreset } from './userPresets';

export const PRESET_EXPORT_KIND = 'chess-review-preset';
export const PRESET_EXPORT_VERSION = 1;
export const PRESET_IMPORT_MAX_BYTES = 32768;

const selectionSchema = z.object({
  boardTheme: z.string().min(1).max(64),
  pieceSet: z.string().min(1).max(64),
  backgroundId: z.string().min(1).max(64),
  soundThemeId: z.string().min(1).max(64),
  animationStyleId: z.string().min(1).max(64),
});

const exportEnvelopeSchema = z.object({
  kind: z.literal(PRESET_EXPORT_KIND),
  version: z.literal(PRESET_EXPORT_VERSION),
  preset: selectionSchema.extend({
    name: z.string().min(1).max(PRESET_NAME_MAX),
  }),
});

/** Serialize a preset (user or ad-hoc) to the export JSON format. */
export function exportPresetJson(preset: ThemeSelection & { name: string }): string {
  return JSON.stringify(
    {
      kind: PRESET_EXPORT_KIND,
      version: PRESET_EXPORT_VERSION,
      preset: {
        name: preset.name,
        boardTheme: preset.boardTheme,
        pieceSet: preset.pieceSet,
        backgroundId: preset.backgroundId,
        soundThemeId: preset.soundThemeId,
        animationStyleId: preset.animationStyleId,
      },
    },
    null,
    2,
  );
}

export type PresetImportResult =
  | { ok: true; preset: UserPreset; replaced: (keyof ThemeSelection)[] }
  | { ok: false; error: string };

/**
 * Parse an imported preset file. Unknown theme ids are replaced with
 * defaults and named in `replaced`; structural problems fail cleanly.
 */
export function parsePresetImport(text: string, now: number = Date.now()): PresetImportResult {
  if (text.length > PRESET_IMPORT_MAX_BYTES) {
    return { ok: false, error: `File is larger than ${PRESET_IMPORT_MAX_BYTES} bytes.` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  const parsed = exportEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'File does not match the preset format.' };
  }
  const { selection, replaced } = sanitizeSelection(parsed.data.preset);
  return {
    ok: true,
    preset: {
      ...selection,
      id: newPresetId(),
      name: parsed.data.preset.name,
      createdAt: now,
    },
    replaced,
  };
}
