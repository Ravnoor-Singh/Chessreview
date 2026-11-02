// Unit-project setup (Round 2, Prompt 6): the app loads non-English
// dictionaries lazily in the browser, but unit tests assert real
// translated strings synchronously — preload every dictionary here so
// t() resolves them exactly as it did when the catalogues were static.
// The lazy mechanism itself is covered by i18n-lazy.test.ts, which uses
// a fresh module registry.
import { ensureDictionary, LOCALES } from '@/i18n';

await Promise.all(LOCALES.map((locale) => ensureDictionary(locale)));
