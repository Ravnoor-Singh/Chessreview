/**
 * Sound-theme registry (Themes & Presets program).
 *
 * A sound theme decides HOW move sounds are produced:
 * - 'wav': the project's original recorded/generated WAV set in
 *   public/sounds/ (the long-standing default behaviour);
 * - 'synth': synthesized at runtime with the Web Audio API (Stage C
 *   engine — no audio files at all);
 * - 'none': silent.
 */
import type { MessageKey } from '@/i18n';
import type { ThemeFlags } from './types';

import { SOUND_THEME_ID_LIST } from './ids';

export { SOUND_THEME_ID_LIST };

export type SoundEngine = 'wav' | 'synth' | 'none';

/** Sound events every theme must cover. */
export type SoundEventName =
  'move' | 'capture' | 'check' | 'castle' | 'promote' | 'end' | 'illegal' | 'start' | 'lowtime';

export interface SoundThemeDef {
  id: string;
  labelKey: MessageKey;
  engine: SoundEngine;
  /** For 'synth' themes: the recipe id the Web Audio engine renders. */
  synthRecipe?: string;
  provenance: string;
  license: string;
  flags: ThemeFlags;
}

const ORIGINAL = 'Original artwork for this project — CC0 1.0';

export const SOUND_THEME_DEFS: readonly SoundThemeDef[] = [
  {
    id: 'standard',
    labelKey: 'themes.sounds.standard',
    engine: 'wav',
    provenance:
      'The project’s original WAV sound set in public/sounds/ (generated for this project in the original build).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'soft',
    labelKey: 'themes.sounds.soft',
    engine: 'synth',
    synthRecipe: 'soft',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (felt-like low sine thocks with filtered noise) — no audio files, all parameters written for this project.',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'marble',
    labelKey: 'themes.sounds.marble',
    engine: 'synth',
    synthRecipe: 'marble',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (hard short clicks: high-passed noise ticks over a triangle thump).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'glass',
    labelKey: 'themes.sounds.glass',
    engine: 'synth',
    synthRecipe: 'glass',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (high sine pings with long decays).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'metal',
    labelKey: 'themes.sounds.metal',
    engine: 'synth',
    synthRecipe: 'metal',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (detuned square/triangle clangs with band-passed noise).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'arcade',
    labelKey: 'themes.sounds.arcade',
    engine: 'synth',
    synthRecipe: 'arcade',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (8-bit square-wave arpeggios).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'playful',
    labelKey: 'themes.sounds.playful',
    engine: 'synth',
    synthRecipe: 'playful',
    provenance:
      'Synthesized live with the Web Audio API by src/themes/soundEngine.ts (bouncy sine glissandi and pops).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'silent',
    labelKey: 'themes.sounds.silent',
    engine: 'none',
    provenance: 'No sound is produced.',
    license: ORIGINAL,
    flags: {},
  },
];

const BY_ID = new Map(SOUND_THEME_DEFS.map((d) => [d.id, d]));

export function isSoundThemeId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

export function normalizeSoundThemeId(value: unknown): string {
  return typeof value === 'string' && BY_ID.has(value) ? value : 'standard';
}

export function getSoundThemeDef(id: string | undefined): SoundThemeDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}
