import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ensureDictionary, LOCALES } from '@/i18n';

// Vitest globals are off in this repo, so register RTL cleanup explicitly.
afterEach(() => {
  cleanup();
});

// Component tests assert real translated strings synchronously; the app
// loads non-English dictionaries lazily (Prompt 6), so preload them here
// (same rationale as tests/unit/setup.ts).
await Promise.all(LOCALES.map((locale) => ensureDictionary(locale)));
