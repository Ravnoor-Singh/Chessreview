// The full four-locale dictionary set, statically imported.
//
// This module is deliberately NOT part of the app bundle's initial graph:
// src/i18n/index.ts loads non-English dictionaries lazily (see
// ensureDictionary) so the ~37 KB gzip of hi/es/pa catalogues is not in
// every page's First Load JS (Round 2, Prompt 6). Import this module only
// from tests and tooling that genuinely need every locale synchronously.
import { en } from './en';
import { hi } from './hi';
import { es } from './es';
import { pa } from './pa';
import type { Locale, Messages } from './index';

export const DICTIONARIES: Record<Locale, Messages> = { en, hi, es, pa };
