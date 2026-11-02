/**
 * Animation-style registry (Themes & Presets program).
 *
 * An animation style is the CSS timing function used for piece movement
 * (combined with the user's animation-speed setting, which sets the
 * duration; the 'off' style forces duration 0). All styles are pure
 * CSS — no assets.
 */
import type { MessageKey } from '@/i18n';
import type { ThemeFlags } from './types';

import { ANIMATION_STYLE_ID_LIST } from './ids';

export { ANIMATION_STYLE_ID_LIST };

export interface AnimationStyleDef {
  id: string;
  labelKey: MessageKey;
  /** CSS transition timing function for piece transforms. */
  timingFunction: string;
  provenance: string;
  license: string;
  flags: ThemeFlags;
}

const ORIGINAL = 'Original artwork for this project — CC0 1.0';
const CSS_ONLY = 'Original CSS timing function chosen for this project.';

export const ANIMATION_STYLE_DEFS: readonly AnimationStyleDef[] = [
  {
    id: 'slide',
    labelKey: 'themes.animations.slide',
    timingFunction: 'ease-out',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'spring',
    labelKey: 'themes.animations.spring',
    timingFunction: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'arcade',
    labelKey: 'themes.animations.arcade',
    timingFunction: 'steps(6, end)',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: { requiresReducedMotionOff: true },
  },
  {
    id: 'off',
    labelKey: 'themes.animations.off',
    timingFunction: 'linear',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
];

const BY_ID = new Map(ANIMATION_STYLE_DEFS.map((d) => [d.id, d]));

export function isAnimationStyleId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

export function normalizeAnimationStyleId(value: unknown): string {
  return typeof value === 'string' && BY_ID.has(value) ? value : 'slide';
}

export function getAnimationStyleDef(id: string | undefined): AnimationStyleDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** CSS timing function for a style id (unknown ids fall back to Slide). */
export function animationTimingFunction(id: string | undefined): string {
  return (getAnimationStyleDef(id) ?? ANIMATION_STYLE_DEFS[0]).timingFunction;
}
