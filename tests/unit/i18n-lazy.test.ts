// Lazy dictionary loading (Round 2, Prompt 6): with a FRESH module
// registry, non-English locales start unloaded (t() falls back to
// English) and ensureDictionary() swaps in the real catalogue.
import { describe, expect, it, vi } from 'vitest';

describe('lazy i18n dictionaries', () => {
  it('falls back to English until the locale dictionary is ensured', async () => {
    vi.resetModules();
    const i18n = await import('@/i18n');
    expect(i18n.isDictionaryLoaded('en')).toBe(true);
    expect(i18n.isDictionaryLoaded('hi')).toBe(false);

    const enLeaf = i18n.t('en', 'settings.boardSize', { px: 640 });
    expect(i18n.t('hi', 'settings.boardSize', { px: 640 })).toBe(enLeaf);

    let notified = 0;
    const off = i18n.onDictionaryLoaded(() => notified++);
    await i18n.ensureDictionary('hi');
    expect(i18n.isDictionaryLoaded('hi')).toBe(true);
    expect(notified).toBe(1);
    expect(i18n.t('hi', 'settings.boardSize', { px: 640 })).not.toBe(enLeaf);
    expect(i18n.t('hi', 'settings.boardSize', { px: 640 })).toContain('640');

    // Idempotent: a second ensure does not re-notify.
    await i18n.ensureDictionary('hi');
    expect(notified).toBe(1);
    off();

    // getDictionary returns the real Hindi catalogue now.
    expect(i18n.getDictionary('hi')).not.toBe(i18n.getDictionary('en'));
    expect(i18n.getDictionary('pa')).toBe(i18n.getDictionary('en')); // not loaded -> en fallback
  });
});
