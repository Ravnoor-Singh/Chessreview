// Review CSV import (Round 2, Prompt 10):
//   npm run i18n:import-review -- <locale> [csvPath]
//
// Validates i18n/review/<locale>.csv (structure, placeholders, length
// budgets, non-empty — see scripts/i18n-review-lib.mjs) and merges the
// rows marked status="reviewed" into src/i18n/<locale>.ts by targeted
// textual replacement of the exact leaf lines. Safety: the merge is
// verified by reloading the compiled catalogue afterwards; on ANY
// failure the original file is restored and nothing is kept.

import { readFileSync, writeFileSync } from 'node:fs';
import { loadCatalogues } from './i18n-catalogues.mjs';
import { parseCsv, validateReviewRows } from './i18n-review-lib.mjs';

const locale = process.argv[2];
if (!['en', 'hi', 'es', 'pa'].includes(locale ?? '')) {
  console.error('usage: npm run i18n:import-review -- <en|hi|es|pa> [csvPath]');
  process.exit(2);
}
const csvPath = process.argv[3] ?? `i18n/review/${locale}.csv`;
const targetPath = `src/i18n/${locale}.ts`;

const cats = await loadCatalogues();
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const problems = validateReviewRows(rows, cats.en);
if (problems.length > 0) {
  console.error(`import aborted — ${problems.length} validation problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const reviewed = rows.filter((r) => r.status === 'reviewed');
const changes = reviewed.filter((r) => r.translation !== (cats[locale][r.key] ?? ''));
console.log(
  `${csvPath}: ${rows.length} rows, ${reviewed.length} reviewed, ${changes.length} changed.`,
);
if (changes.length === 0) process.exit(0);

/** Escape a value for a single-quoted TS string literal. */
function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Locate leaf lines in the catalogue source by key path. The catalogue
 * files are uniformly formatted (2-space indent per level; a leaf is
 * `key: '...',` on one line, or `key:` followed by the string on the
 * next line, or a plural block whose one/other lines are leaves).
 * Returns a Map from flattened key -> { lineIndex, prefix, suffix }.
 */
function locateLeaves(source) {
  const lines = source.split('\n');
  const leaves = new Map();
  const stack = []; // { indent, key }
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const rest = match[3];
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const path = [...stack.map((s) => s.key), key].join('.');
    if (rest.startsWith("'") || rest.startsWith('"')) {
      leaves.set(path, { lineIndex: i });
    } else if (rest === '' && i + 1 < lines.length && /^\s*['"]/.test(lines[i + 1])) {
      leaves.set(path, { lineIndex: i + 1 });
    } else {
      stack.push({ indent, key });
    }
  }
  return leaves;
}

const original = readFileSync(targetPath, 'utf8');
const lines = original.split('\n');
const leaves = locateLeaves(original);
for (const change of changes) {
  const leaf = leaves.get(change.key);
  if (!leaf) {
    console.error(`import aborted — could not locate ${change.key} in ${targetPath}`);
    process.exit(1);
  }
  const line = lines[leaf.lineIndex];
  const replaced = line.replace(/(['"])((?:\\.|(?!\1).)*)\1/, quote(change.translation));
  if (replaced === line) {
    console.error(`import aborted — leaf replacement failed for ${change.key}`);
    process.exit(1);
  }
  lines[leaf.lineIndex] = replaced;
}
writeFileSync(targetPath, lines.join('\n'));

const after = await loadCatalogues();
const mismatches = changes.filter((c) => after[locale][c.key] !== c.translation);
if (mismatches.length > 0) {
  writeFileSync(targetPath, original);
  console.error(
    `import aborted — post-merge verification failed for ${mismatches.map((m) => m.key).join(', ')}; original restored.`,
  );
  process.exit(1);
}
console.log(`merged ${changes.length} reviewed translation(s) into ${targetPath}:`);
for (const c of changes) console.log(`  - ${c.key}`);
console.log('Run npm run i18n:check && npm run glossary:check before committing.');
