// Internationalization core (Prompt 10).
//
// - `en` is the source of truth: `Messages = typeof en`, and hi/es/pa are
//   annotated `: Messages`, so a missing/extra key fails compilation.
// - `t(locale, key, params)` resolves a dot-path key, interpolates
//   {placeholders}, and selects plural forms ({ one, other } entries)
//   through Intl.PluralRules using the numeric `count` param (falling
//   back to `extras`, then any numeric param) when the entry is plural.
// - Pseudo-localization: with ?pseudo=1 in the URL (persisted to
//   sessionStorage for the session), t() returns an accented, lengthened
//   transform of the ENGLISH string wrapped in ⟦~ … ~⟧, whatever the
//   active locale — untranslated hardcoded text stays readable English
//   and layout overflow becomes visible. See README "Internationalization".

import { en } from './en';

export type Messages = typeof en;

export type Locale = 'en' | 'hi' | 'es' | 'pa';
export const LOCALES: readonly Locale[] = ['en', 'hi', 'es', 'pa'];
/** Native display names for the settings picker (never translated). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  es: 'Español',
  pa: 'ਪੰਜਾਬੀ',
};

/* --------------------- lazy dictionary loading ------------------------
 * Round 2, Prompt 6: only English is bundled statically. The hi/es/pa
 * catalogues (~37 KB gzip combined) load on demand through
 * ensureDictionary() the first time a non-English locale is active, and
 * t() falls back to English until the dictionary arrives (LocaleSync
 * triggers the load at startup; useMessages subscribes and re-renders
 * when it lands). The full static set lives in ./dictionaries for tests
 * and tooling. */

const registry: Partial<Record<Locale, Messages>> = { en };
const pending = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();

/** The loaded dictionary for `locale`, or English until it has loaded. */
export function getDictionary(locale: Locale): Messages {
  return registry[locale] ?? en;
}

/** True once `locale`'s real dictionary (not the English fallback) is in. */
export function isDictionaryLoaded(locale: Locale): boolean {
  return registry[locale] !== undefined;
}

/** Subscribe to dictionary-load completions; returns an unsubscribe. */
export function onDictionaryLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Load `locale`'s dictionary (idempotent; no-op for English). */
export function ensureDictionary(locale: Locale): Promise<void> {
  if (locale === 'en' || registry[locale]) return Promise.resolve();
  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;
  const load = (async () => {
    try {
      const dict: Messages =
        locale === 'hi'
          ? (await import('./hi')).hi
          : locale === 'es'
            ? (await import('./es')).es
            : (await import('./pa')).pa;
      registry[locale] = dict;
      for (const fn of listeners) fn();
    } catch {
      // A failed chunk load leaves the English fallback in place; the
      // next ensureDictionary call retries (pending is cleared below).
    } finally {
      pending.delete(locale);
    }
  })();
  pending.set(locale, load);
  return load;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Map a BCP-47 tag (e.g. navigator.language) to a supported locale. */
export function detectLocale(tag: string | null | undefined): Locale {
  if (!tag) return 'en';
  const primary = tag.toLowerCase().split('-')[0];
  if (primary === 'hi') return 'hi';
  if (primary === 'pa') return 'pa';
  if (primary === 'es') return 'es';
  return 'en';
}

/** First-run default: the browser language mapped through detectLocale. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  return detectLocale(navigator.language);
}

type PluralEntry = { one: string; other: string };
type Leaf = string | PluralEntry;

/** Recursively build the union of dot-path keys whose value is a leaf. */
type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends Leaf
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${DotPaths<T[K]>}`
      : never;
}[keyof T & string];

export type MessageKey = DotPaths<Messages>;
export type MessageParams = Record<string, string | number>;

function lookup(dict: Messages, key: string): Leaf | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (
    node !== null &&
    typeof node === 'object' &&
    typeof (node as PluralEntry).one === 'string' &&
    typeof (node as PluralEntry).other === 'string'
  ) {
    return node as PluralEntry;
  }
  return undefined;
}

function placeholdersOf(template: string): string[] {
  const out: string[] = [];
  const re = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) out.push(m[1]);
  return out;
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

function selectPlural(locale: Locale, entry: PluralEntry, params?: MessageParams): string {
  const count =
    typeof params?.count === 'number'
      ? params.count
      : typeof params?.extras === 'number'
        ? params.extras
        : undefined;
  if (count === undefined) return entry.other;
  const category = new Intl.PluralRules(locale).select(count);
  return category === 'one' ? entry.one : entry.other;
}

/* ------------------------- pseudo-localization ------------------------ */

export const PSEUDO_SESSION_KEY = 'chess-review:pseudo';

const ACCENTS: Record<string, string> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  y: 'ý',
  A: 'Á',
  E: 'É',
  I: 'Í',
  O: 'Ó',
  U: 'Ú',
  Y: 'Ý',
  c: 'ç',
  n: 'ñ',
  s: 'š',
  z: 'ž',
  C: 'Ç',
  N: 'Ñ',
  S: 'Š',
  Z: 'Ž',
};

/** Accent every mappable letter and lengthen by ~30% (repeated head). */
export function pseudoTransform(text: string): string {
  const accented = text
    .split('')
    .map((ch) => ACCENTS[ch] ?? ch)
    .join('');
  const extra = accented.slice(0, Math.max(1, Math.ceil(accented.length * 0.3)));
  return `⟦~${accented} ${extra}~⟧`;
}

/** True when pseudo mode is on for this session (URL flag persisted). */
export function isPseudoEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('pseudo') === '1') {
      window.sessionStorage.setItem(PSEUDO_SESSION_KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(PSEUDO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Test/dev helper: force pseudo mode on or off for this session. */
export function setPseudoEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) window.sessionStorage.setItem(PSEUDO_SESSION_KEY, '1');
    else window.sessionStorage.removeItem(PSEUDO_SESSION_KEY);
  } catch {
    // sessionStorage unavailable (private mode) — pseudo just won't persist.
  }
}

/* --------------------------------- t() -------------------------------- */

/**
 * Translate `key` for `locale` with {placeholder} interpolation and
 * Intl.PluralRules-based plural selection. In pseudo mode the ENGLISH
 * string is transformed instead (see header). Unknown keys fall back to
 * the key itself so a gap is visible rather than blank.
 */
export function t(locale: Locale, key: MessageKey, params?: MessageParams): string {
  if (isPseudoEnabled()) {
    const leaf = lookup(en, key);
    if (leaf === undefined) return key;
    const template = typeof leaf === 'string' ? leaf : selectPlural('en', leaf, params);
    return pseudoTransform(interpolate(template, params));
  }
  const leaf = lookup(getDictionary(locale), key) ?? lookup(en, key);
  if (leaf === undefined) return key;
  const template = typeof leaf === 'string' ? leaf : selectPlural(locale, leaf, params);
  return interpolate(template, params);
}

/** Raw leaf lookup (used by scripts/i18n-check and tests). */
export function getLeaf(dict: Messages, key: string): Leaf | undefined {
  return lookup(dict, key);
}

/** All leaf dot-path keys of a dictionary, sorted. */
export function allKeys(dict: Messages): string[] {
  const out: string[] = [];
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node === 'string') {
      out.push(prefix);
      return;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      const isPlural =
        entries.length === 2 &&
        typeof (node as PluralEntry).one === 'string' &&
        typeof (node as PluralEntry).other === 'string';
      if (isPlural && prefix) {
        out.push(prefix);
        return;
      }
      for (const [k, v] of entries) walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(dict, '');
  return out.sort();
}

/** Sorted placeholder names of a leaf (union over plural forms). */
export function leafPlaceholders(leaf: Leaf): string[] {
  const templates = typeof leaf === 'string' ? [leaf] : [leaf.one, leaf.other];
  const set = new Set<string>();
  for (const tpl of templates) for (const p of placeholdersOf(tpl)) set.add(p);
  return [...set].sort();
}

/* --------------------------- Intl formatting -------------------------- */

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Accuracy-style value: exactly one fraction digit, locale separators. */
export function formatDecimal1(locale: Locale, value: number): string {
  return formatNumber(locale, value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** 0..1 fraction as a locale percent, e.g. 0.94 → "94%" (en). */
export function formatPercentFraction(locale: Locale, fraction: number): string {
  return formatNumber(locale, fraction, { style: 'percent', maximumFractionDigits: 0 });
}

export function formatDate(
  locale: Locale,
  date: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}
