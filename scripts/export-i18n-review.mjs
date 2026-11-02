// Review CSV export (Round 2, Prompt 10): `npm run i18n:export-review`.
//
// Writes i18n/review/<locale>.csv for all four locales from the live
// catalogues: key, English source, current translation, a context note
// (which screen/section the string belongs to), a length budget for
// short UI strings (~1.3x the English length; long body copy is
// unbounded), and empty reviewer/status columns — status starts as
// "machine-assisted" (or "source" for English). A native speaker edits
// the translation, sets status to "reviewed", and the import script
// (npm run i18n:import-review -- <locale>) validates and merges it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCatalogues, LOCALES } from './i18n-catalogues.mjs';
import { toCsv } from './i18n-review-lib.mjs';

const SECTION_CONTEXT = {
  common: 'Shared labels used across screens',
  pieces: 'Piece names (board editor, promotion picker)',
  meta: 'Browser tab title and search/social description',
  input: 'Home page: game input (PGN/FEN/link/image tabs)',
  editor: 'Board editor (FEN setup)',
  vision: 'Screenshot import flow',
  review: 'Review screen header and progress',
  termination: 'Game-ending banners',
  summary: 'Review summary panel (accuracy, classifications)',
  moves: 'Move list, coach feedback and retry mode',
  engine: 'Engine status, eval bar/graph, engine lines',
  classifications: 'Move classification labels (badges)',
  classificationPhrases: 'Move classification phrases (coach text)',
  performance: 'Performance estimate bands',
  feedback: 'Coach feedback sentences',
  settings: 'Settings drawer',
  errors: 'Error messages',
  pwa: 'PWA install/update prompts',
  board: 'Board accessibility announcements',
};

const cats = await loadCatalogues();
mkdirSync('i18n/review', { recursive: true });
for (const locale of LOCALES) {
  const rows = [];
  for (const key of Object.keys(cats.en).sort()) {
    const english = cats.en[key];
    const section = key.split('.')[0];
    let context = SECTION_CONTEXT[section] ?? `Section: ${section}`;
    if (key.endsWith('.one')) context += ' — plural form "one"';
    if (key.endsWith('.other')) context += ' — plural form "other"';
    rows.push({
      key,
      english,
      translation: cats[locale][key] ?? '',
      context,
      max_length: english.length <= 100 ? String(Math.ceil(english.length * 1.3) + 4) : '',
      reviewer: '',
      status: locale === 'en' ? 'source' : 'machine-assisted',
    });
  }
  writeFileSync(`i18n/review/${locale}.csv`, toCsv(rows));
  console.log(`i18n/review/${locale}.csv — ${rows.length} rows`);
}
