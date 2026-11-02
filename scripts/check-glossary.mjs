// Glossary consistency check (Round 2, Prompt 10): `npm run glossary:check`.
//
// Fails when:
//  - a catalogue value for a key listed in src/i18n/GLOSSARY.md's
//    canonical table differs from the table (either direction — update
//    both together), or
//  - a key whose English text mentions "Stockfish" lost the product
//    name in another locale (never-translate policy).
//
// The table is parsed from the Markdown, so GLOSSARY.md is the single
// source of truth for canonical wording.

import { readFileSync } from 'node:fs';
import { loadCatalogues, LOCALES } from './i18n-catalogues.mjs';

const md = readFileSync('src/i18n/GLOSSARY.md', 'utf8');
const rows = [];
for (const line of md.split('\n')) {
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (cells.length === 5 && cells[0].startsWith('`') && cells[0].endsWith('`')) {
    rows.push({ key: cells[0].slice(1, -1), values: cells.slice(1) });
  }
}
if (rows.length < 10) {
  console.error(`glossary:check — parsed only ${rows.length} canonical rows; table format broken?`);
  process.exit(1);
}

const cats = await loadCatalogues();
const problems = [];
for (const { key, values } of rows) {
  LOCALES.forEach((locale, i) => {
    const actual = cats[locale][key];
    if (actual === undefined) problems.push(`${key}: missing in ${locale}`);
    else if (actual !== values[i])
      problems.push(
        `${key} [${locale}]: catalogue "${actual}" != glossary "${values[i]}" — update both together`,
      );
  });
}
for (const [key, enValue] of Object.entries(cats.en)) {
  if (!enValue.includes('Stockfish')) continue;
  for (const locale of LOCALES.slice(1)) {
    const value = cats[locale][key];
    if (value !== undefined && !value.includes('Stockfish'))
      problems.push(`${key} [${locale}]: "Stockfish" must not be translated`);
  }
}

if (problems.length > 0) {
  console.error(`glossary:check FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `glossary:check OK — ${rows.length} canonical terms match across ${LOCALES.length} locales; Stockfish intact everywhere.`,
);
