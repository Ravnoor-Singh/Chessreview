/**
 * Page-background registry (Themes & Presets program).
 *
 * A background is pure CSS (colors/gradients) applied behind the board
 * and panels by `BackgroundLayer`. Every definition carries a fixed
 * readability scrim: a translucent overlay the layer paints above the
 * background (and below the content) so text keeps ≥ 4.5:1 contrast
 * against the effective color — verified by `npm run themes:check`
 * against the ink color of the UI theme the background is made for
 * (`forTheme`).
 *
 * The `standard` background is special: it applies no override at all,
 * so the app keeps exactly its built-in page background.
 */
import type { MessageKey } from '@/i18n';
import type { BackgroundCategory, ThemeFlags } from './types';

import { BACKGROUND_ID_LIST } from './ids';

export { BACKGROUND_ID_LIST };

export interface BackgroundDef {
  id: string;
  labelKey: MessageKey;
  category: BackgroundCategory;
  /** CSS background-color under the image/gradient (also the contrast-check base). */
  backgroundColor: string;
  /** CSS background-image value (gradient/pattern), if any. */
  backgroundImage?: string;
  /** 'cover' scenic/gradient layers, or a tile size like '48px 48px' for patterns. */
  backgroundSize?: string;
  /** Readability overlay painted above the background. */
  scrim: { color: string; opacity: number };
  /** Which UI theme's ink this background is contrast-checked against. */
  forTheme: 'dark' | 'light' | 'any';
  /** How this background was made (mirrors the row in PROVENANCE.md). */
  provenance: string;
  license: string;
  flags: ThemeFlags;
}

const ORIGINAL = 'Original artwork for this project — CC0 1.0';
const CSS_ONLY = 'Original CSS colors/gradients written for this project.';

const STAR_FIELD =
  'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.95) 0 1px, transparent 1.8px), radial-gradient(circle at 64% 8%, rgba(255,255,255,0.8) 0 1px, transparent 1.8px), radial-gradient(circle at 82% 38%, rgba(190,220,255,0.9) 0 1.2px, transparent 2px), radial-gradient(circle at 38% 58%, rgba(255,255,255,0.7) 0 1px, transparent 1.8px), radial-gradient(circle at 8% 76%, rgba(255,240,210,0.85) 0 1px, transparent 1.8px), radial-gradient(circle at 52% 84%, rgba(255,255,255,0.9) 0 1.1px, transparent 1.9px), radial-gradient(circle at 90% 88%, rgba(255,255,255,0.75) 0 1px, transparent 1.8px), radial-gradient(circle at 28% 40%, rgba(255,255,255,0.6) 0 0.8px, transparent 1.6px)';
const CONFETTI_DOTS =
  'radial-gradient(circle at 12% 18%, rgba(224,64,64,0.5) 0 3px, transparent 4px), radial-gradient(circle at 34% 62%, rgba(64,96,224,0.45) 0 3px, transparent 4px), radial-gradient(circle at 58% 24%, rgba(240,180,32,0.5) 0 3px, transparent 4px), radial-gradient(circle at 76% 70%, rgba(48,168,96,0.45) 0 3px, transparent 4px), radial-gradient(circle at 90% 12%, rgba(160,64,200,0.4) 0 3px, transparent 4px), radial-gradient(circle at 6% 88%, rgba(240,140,32,0.45) 0 3px, transparent 4px)';

export const BACKGROUND_DEFS: readonly BackgroundDef[] = [
  {
    id: 'standard',
    labelKey: 'themes.backgrounds.standard',
    category: 'plain',
    backgroundColor: '#262522',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'any',
    provenance: 'The app’s built-in page background (no override applied).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'charcoal',
    labelKey: 'themes.backgrounds.charcoal',
    category: 'plain',
    backgroundColor: '#1b1b1e',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'midnight',
    labelKey: 'themes.backgrounds.midnight',
    category: 'plain',
    backgroundColor: '#0d1526',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'forest',
    labelKey: 'themes.backgrounds.forest',
    category: 'plain',
    backgroundColor: '#14251a',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'classic',
    labelKey: 'themes.backgrounds.classic',
    category: 'texture',
    backgroundColor: '#201e1a',
    backgroundImage: 'linear-gradient(160deg, #2e2b26 0%, #201e1a 55%, #171512 100%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'paper',
    labelKey: 'themes.backgrounds.paper',
    category: 'plain',
    backgroundColor: '#f3ead8',
    scrim: { color: '#ffffff', opacity: 0 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'light',
    labelKey: 'themes.backgrounds.light',
    category: 'plain',
    backgroundColor: '#f4f4f2',
    scrim: { color: '#ffffff', opacity: 0 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'wood',
    labelKey: 'themes.backgrounds.wood',
    category: 'texture',
    backgroundColor: '#3a2413',
    backgroundImage:
      'repeating-linear-gradient(93deg, rgba(20,10,2,0.18) 0 2px, transparent 2px 9px), repeating-linear-gradient(178deg, rgba(255,225,180,0.05) 0 3px, transparent 3px 13px)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.1 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'marble',
    labelKey: 'themes.backgrounds.marble',
    category: 'texture',
    backgroundColor: '#23242a',
    backgroundImage:
      'radial-gradient(ellipse 60% 40% at 22% 18%, rgba(255,255,255,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 82% 78%, rgba(255,255,255,0.05) 0%, transparent 60%), linear-gradient(150deg, rgba(255,255,255,0.04), transparent 45%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.1 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'stone',
    labelKey: 'themes.backgrounds.stone',
    category: 'texture',
    backgroundColor: '#2a2a28',
    backgroundImage:
      'radial-gradient(circle at 28% 30%, rgba(255,255,255,0.04) 0 12%, transparent 45%), radial-gradient(circle at 74% 66%, rgba(0,0,0,0.16) 0 14%, transparent 50%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.05 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'metal',
    labelKey: 'themes.backgrounds.metal',
    category: 'texture',
    backgroundColor: '#24282e',
    backgroundImage:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 3px), linear-gradient(165deg, rgba(255,255,255,0.05), transparent 55%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.05 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'newspaper',
    labelKey: 'themes.backgrounds.newspaper',
    category: 'texture',
    backgroundColor: '#e9e2cf',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(40,32,16,0.05) 0 1px, transparent 1px 7px), repeating-linear-gradient(90deg, rgba(40,32,16,0.03) 0 1px, transparent 1px 64px)',
    backgroundSize: 'cover',
    scrim: { color: '#ffffff', opacity: 0.15 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'felt',
    labelKey: 'themes.backgrounds.felt',
    category: 'texture',
    backgroundColor: '#1d4630',
    backgroundImage:
      'radial-gradient(ellipse 90% 70% at 50% 38%, #256b45 0%, #1d4630 55%, #12291c 100%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.1 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'space',
    labelKey: 'themes.backgrounds.space',
    category: 'scenic',
    backgroundColor: '#050810',
    backgroundImage: STAR_FIELD,
    backgroundSize: '260px 260px',
    scrim: { color: '#000000', opacity: 0.55 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: { animated: true },
  },
  {
    id: 'cosmos',
    labelKey: 'themes.backgrounds.cosmos',
    category: 'scenic',
    backgroundColor: '#12081f',
    backgroundImage:
      'radial-gradient(ellipse 55% 42% at 24% 30%, rgba(150,60,190,0.38) 0%, transparent 65%), radial-gradient(ellipse 48% 38% at 78% 66%, rgba(230,80,160,0.30) 0%, transparent 65%), radial-gradient(ellipse 36% 30% at 62% 16%, rgba(70,110,255,0.30) 0%, transparent 60%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.3 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: { animated: true },
  },
  {
    id: 'ocean',
    labelKey: 'themes.backgrounds.ocean',
    category: 'scenic',
    backgroundColor: '#0b3742',
    backgroundImage:
      'radial-gradient(circle at 50% 120%, rgba(120,220,235,0.12) 0 34%, transparent 62%), repeating-radial-gradient(circle at 50% -18%, rgba(255,255,255,0.05) 0 34px, transparent 34px 72px), linear-gradient(180deg, #0d4152 0%, #0b3742 52%, #06222b 100%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.12 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'icy-sea',
    labelKey: 'themes.backgrounds.icy-sea',
    category: 'scenic',
    backgroundColor: '#dceef2',
    backgroundImage:
      'radial-gradient(circle at 82% 12%, rgba(255,255,255,0.5) 0 10%, transparent 42%), linear-gradient(165deg, #e8f4f8 0%, #dceef2 55%, #c4dde8 100%)',
    backgroundSize: 'cover',
    scrim: { color: '#ffffff', opacity: 0.2 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'nature',
    labelKey: 'themes.backgrounds.nature',
    category: 'scenic',
    backgroundColor: '#17351f',
    backgroundImage:
      'radial-gradient(ellipse 60% 45% at 16% 8%, rgba(140,220,120,0.20) 0%, transparent 60%), radial-gradient(ellipse 52% 40% at 88% 88%, rgba(30,110,60,0.35) 0%, transparent 62%), linear-gradient(160deg, #1d4527 0%, #17351f 58%, #0f2415 100%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.12 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'gothic',
    labelKey: 'themes.backgrounds.gothic',
    category: 'scenic',
    backgroundColor: '#17171c',
    backgroundImage:
      'radial-gradient(circle at 50% 115%, transparent 0 30px, rgba(255,255,255,0.045) 30px 31.5px, transparent 31.5px), radial-gradient(circle at 50% 115%, transparent 0 52px, rgba(255,255,255,0.03) 52px 53.5px, transparent 53.5px)',
    backgroundSize: '104px 104px',
    scrim: { color: '#000000', opacity: 0.1 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'graffiti',
    labelKey: 'themes.backgrounds.graffiti',
    category: 'scenic',
    backgroundColor: '#1c1c22',
    backgroundImage:
      'radial-gradient(circle at 16% 24%, rgba(255,80,120,0.20) 0 12%, transparent 42%), radial-gradient(circle at 84% 18%, rgba(60,200,255,0.18) 0 10%, transparent 40%), radial-gradient(circle at 68% 82%, rgba(255,210,60,0.16) 0 12%, transparent 44%), radial-gradient(circle at 28% 84%, rgba(150,90,255,0.16) 0 10%, transparent 40%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.22 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'neon-grid',
    labelKey: 'themes.backgrounds.neon-grid',
    category: 'scenic',
    backgroundColor: '#07070f',
    backgroundImage:
      'radial-gradient(ellipse 70% 40% at 50% 108%, rgba(255,0,128,0.13) 0%, transparent 60%), linear-gradient(rgba(0,229,255,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.13) 1px, transparent 1px)',
    backgroundSize: 'cover, 44px 44px, 44px 44px',
    scrim: { color: '#000000', opacity: 0.15 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: '8-bit',
    labelKey: 'themes.backgrounds.8-bit',
    category: 'scenic',
    backgroundColor: '#20222c',
    backgroundImage:
      'conic-gradient(rgba(255,255,255,0.05) 25%, transparent 0 50%, rgba(255,255,255,0.05) 0 75%, transparent 0)',
    backgroundSize: '16px 16px',
    scrim: { color: '#000000', opacity: 0.08 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'bubblegum',
    labelKey: 'themes.backgrounds.bubblegum',
    category: 'scenic',
    backgroundColor: '#f7d9e8',
    backgroundImage:
      'radial-gradient(circle at 18% 22%, rgba(255,120,180,0.20) 0 12%, transparent 44%), radial-gradient(circle at 84% 76%, rgba(160,120,255,0.16) 0 12%, transparent 44%), radial-gradient(circle at 66% 12%, rgba(120,220,255,0.16) 0 10%, transparent 40%)',
    backgroundSize: 'cover',
    scrim: { color: '#ffffff', opacity: 0.12 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'confetti',
    labelKey: 'themes.backgrounds.confetti',
    category: 'scenic',
    backgroundColor: '#f4f1e6',
    backgroundImage: CONFETTI_DOTS,
    backgroundSize: '180px 180px',
    scrim: { color: '#ffffff', opacity: 0.12 },
    forTheme: 'light',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'glass',
    labelKey: 'themes.backgrounds.glass',
    category: 'scenic',
    backgroundColor: '#10151d',
    backgroundImage:
      'radial-gradient(circle at 20% 24%, rgba(90,140,255,0.35) 0 16%, transparent 48%), radial-gradient(circle at 82% 20%, rgba(140,90,255,0.30) 0 14%, transparent 46%), radial-gradient(circle at 58% 86%, rgba(60,220,200,0.22) 0 14%, transparent 46%)',
    backgroundSize: 'cover',
    scrim: { color: '#000000', opacity: 0.18 },
    forTheme: 'dark',
    provenance: CSS_ONLY,
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'custom-color',
    labelKey: 'themes.backgrounds.custom-color',
    category: 'custom',
    backgroundColor: '#262522',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'any',
    provenance:
      'User-chosen solid color (rendered from the customBackground setting, not from this placeholder).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'custom-gradient',
    labelKey: 'themes.backgrounds.custom-gradient',
    category: 'custom',
    backgroundColor: '#262522',
    backgroundImage: 'linear-gradient(135deg, #3a3f4a, #262522)',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'any',
    provenance:
      'User-built two-color gradient (rendered from the customBackground setting, not from this placeholder).',
    license: ORIGINAL,
    flags: {},
  },
  {
    id: 'custom-image',
    labelKey: 'themes.backgrounds.custom-image',
    category: 'custom',
    backgroundColor: '#262522',
    scrim: { color: '#000000', opacity: 0 },
    forTheme: 'any',
    provenance:
      'User-uploaded image stored locally in IndexedDB on the device; never uploaded anywhere.',
    license: ORIGINAL,
    flags: {},
  },
];

const BY_ID = new Map(BACKGROUND_DEFS.map((d) => [d.id, d]));

export function isBackgroundId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

export function normalizeBackgroundId(value: unknown): string {
  return typeof value === 'string' && BY_ID.has(value) ? value : 'standard';
}

export function getBackgroundDef(id: string | undefined): BackgroundDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}
