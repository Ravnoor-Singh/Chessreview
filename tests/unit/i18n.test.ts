import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '@/i18n/dictionaries';
import {
  LOCALES,
  allKeys,
  detectLocale,
  formatDecimal1,
  getLeaf,
  leafPlaceholders,
  pseudoTransform,
  t,
} from '@/i18n';
import { generateFeedback } from '@/analysis/feedback';
import { migrateSettings } from '@/store/settingsStore';
import type { MoveClass } from '@/lib/types';

describe('i18n catalogue parity (Prompt 10)', () => {
  it('all locales expose exactly the English key set', () => {
    const enKeys = allKeys(DICTIONARIES.en);
    expect(enKeys.length).toBeGreaterThan(200);
    for (const locale of LOCALES) {
      expect(allKeys(DICTIONARIES[locale]), locale).toEqual(enKeys);
    }
  });

  it('placeholder sets match English per key in every locale', () => {
    for (const key of allKeys(DICTIONARIES.en)) {
      const enLeaf = getLeaf(DICTIONARIES.en, key);
      expect(enLeaf, key).toBeDefined();
      const ref = leafPlaceholders(enLeaf!);
      for (const locale of LOCALES) {
        const leaf = getLeaf(DICTIONARIES[locale], key);
        expect(leaf, `${locale}:${key}`).toBeDefined();
        expect(leafPlaceholders(leaf!), `${locale}:${key}`).toEqual(ref);
      }
    }
  });

  it('no empty strings anywhere', () => {
    for (const locale of LOCALES) {
      for (const key of allKeys(DICTIONARIES[locale])) {
        const leaf = getLeaf(DICTIONARIES[locale], key)!;
        const templates = typeof leaf === 'string' ? [leaf] : [leaf.one, leaf.other];
        for (const s of templates) expect(s.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('t() interpolation and plurals', () => {
  it('interpolates named placeholders', () => {
    expect(t('en', 'settings.boardSize', { px: 640 })).toBe('Board size · 640 px');
    expect(t('hi', 'settings.boardSize', { px: 640 })).toContain('640');
    expect(t('es', 'feedback.bestWas', { best: 'Nf3' })).toBe('La mejor era Nf3.');
  });

  it('selects the English plural form by count', () => {
    expect(t('en', 'input.multiGames', { count: 1 })).toBe('This file has 1 game — pick one:');
    expect(t('en', 'input.multiGames', { count: 4 })).toBe('This file has 4 games — pick one:');
  });

  it('selects Hindi plural categories via Intl.PluralRules', () => {
    // hi: 1 -> "one", 5 -> "other" per CLDR.
    expect(new Intl.PluralRules('hi').select(1)).toBe('one');
    expect(new Intl.PluralRules('hi').select(5)).toBe('other');
    expect(t('hi', 'input.multiGames', { count: 1 })).toContain('गेम है');
    expect(t('hi', 'input.multiGames', { count: 5 })).toContain('गेम हैं');
  });

  it('selects Punjabi plural categories via Intl.PluralRules', () => {
    expect(new Intl.PluralRules('pa').select(1)).toBe('one');
    expect(new Intl.PluralRules('pa').select(5)).toBe('other');
    expect(t('pa', 'input.multiGames', { count: 1 })).toContain('ਖੇਡ ਹੈ');
    expect(t('pa', 'input.multiGames', { count: 5 })).toContain('ਖੇਡਾਂ ਹਨ');
  });
});

describe('locale detection mapping', () => {
  it('maps hi*/pa*/es* to those locales, everything else to en', () => {
    expect(detectLocale('hi')).toBe('hi');
    expect(detectLocale('hi-IN')).toBe('hi');
    expect(detectLocale('pa')).toBe('pa');
    expect(detectLocale('pa-IN')).toBe('pa');
    expect(detectLocale('es')).toBe('es');
    expect(detectLocale('es-ES')).toBe('es');
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('fr-FR')).toBe('en');
    expect(detectLocale('')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
    expect(detectLocale(null)).toBe('en');
  });
});

describe('Intl formatting', () => {
  it('formats decimals with the locale numbering system', () => {
    expect(formatDecimal1('en', 91.3)).toBe('91.3');
    expect(formatDecimal1('hi', 91.3)).toBe(
      new Intl.NumberFormat('hi', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        91.3,
      ),
    );
    expect(formatDecimal1('es', 91.3)).toBe('91,3');
  });
});

describe('pseudo-localization transform', () => {
  it('wraps, accents and lengthens the English string', () => {
    const out = pseudoTransform('Settings');
    expect(out.startsWith('⟦~')).toBe(true);
    expect(out.endsWith('~⟧')).toBe(true);
    expect(out.length).toBeGreaterThan('Settings'.length);
    expect(out).toContain('Š');
  });
});

describe('feedback generator — every classification × every locale', () => {
  const CLASSES: MoveClass[] = [
    'brilliant',
    'great',
    'best',
    'excellent',
    'good',
    'book',
    'inaccuracy',
    'mistake',
    'blunder',
    'miss',
    'forced',
  ];
  const BASE = {
    san: 'Nf3',
    bestMoveSan: 'Nf3',
    epl: 0.005,
    evalSwingPawns: 0,
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveUci: 'g1f3',
    pvSan: ['Nf3', 'Nf6'],
  };
  for (const locale of LOCALES) {
    for (const classification of CLASSES) {
      it(`${locale} / ${classification} produces a non-empty headline`, () => {
        const fb = generateFeedback({ ...BASE, classification, locale });
        expect(fb.headline.trim().length).toBeGreaterThan(0);
        expect(fb.headline).toContain('Nf3');
        if (locale !== 'en') {
          const enFb = generateFeedback({ ...BASE, classification, locale: 'en' });
          expect(fb.headline).not.toBe(enFb.headline);
        }
      });
    }
  }

  it('book feedback names the opening in every locale', () => {
    for (const locale of LOCALES) {
      const fb = generateFeedback({
        ...BASE,
        classification: 'book',
        bookName: 'Italian Game',
        bookEco: 'C50',
        locale,
      });
      expect(fb.detail).toContain('Italian Game');
      expect(fb.detail).toContain('C50');
    }
  });
});

describe('settings migration for the locale field (Prompt 10)', () => {
  it('keeps a valid stored locale', () => {
    expect(migrateSettings({ locale: 'hi' }).locale).toBe('hi');
    expect(migrateSettings({ locale: 'pa' }).locale).toBe('pa');
    expect(migrateSettings({ locale: 'es' }).locale).toBe('es');
  });

  it('falls back to English for unknown or absent stored locales', () => {
    expect(migrateSettings({ locale: 'fr' as never }).locale).toBe('en');
    expect(migrateSettings({}).locale).toBe('en');
    expect(migrateSettings({ boardTheme: 'grey' }).locale).toBe('en');
  });
});
