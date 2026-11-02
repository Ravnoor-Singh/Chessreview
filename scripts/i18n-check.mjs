// i18n catalogue check (Prompt 10): `npm run i18n:check`.
//
// Loads all four dictionaries (compiled on the fly with esbuild, which
// ships with the repo's dev dependencies) and fails on:
//  - key-set mismatch across locales (redundant with tsc's `: Messages`
//    annotation, but catches dynamic cases),
//  - placeholder-set mismatch per key across locales,
//  - empty strings anywhere.
// Exits non-zero with a readable report when anything is off.

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = `
export { en } from './src/i18n/en.ts';
export { hi } from './src/i18n/hi.ts';
export { es } from './src/i18n/es.ts';
export { pa } from './src/i18n/pa.ts';
`;

const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
const entryPath = join(process.cwd(), 'i18n-check-entry.ts');
writeFileSync(entryPath, entry);
const outPath = join(dir, 'bundle.mjs');
try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: outPath,
    logLevel: 'silent',
  });
} finally {
  const { unlinkSync } = await import('node:fs');
  try {
    unlinkSync(entryPath);
  } catch {
    // best effort cleanup
  }
}
const dicts = await import(pathToFileURL(outPath).href);

function leaves(dict) {
  const out = new Map();
  const walk = (node, prefix) => {
    if (typeof node === 'string') {
      out.set(prefix, [node]);
      return;
    }
    if (node !== null && typeof node === 'object') {
      const vals = Object.values(node);
      if (
        vals.length === 2 &&
        vals.every((v) => typeof v === 'string') &&
        'one' in node &&
        'other' in node
      ) {
        out.set(prefix, [node.one, node.other]);
        return;
      }
      for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(dict, '');
  return out;
}

function placeholders(templates) {
  const set = new Set();
  for (const tpl of templates) {
    for (const m of tpl.matchAll(/\{(\w+)\}/g)) set.add(m[1]);
  }
  return [...set].sort().join(',');
}

const names = ['en', 'hi', 'es', 'pa'];
const maps = Object.fromEntries(names.map((n) => [n, leaves(dicts[n])]));
const problems = [];

const allKeySet = new Set();
for (const n of names) for (const k of maps[n].keys()) allKeySet.add(k);

for (const key of [...allKeySet].sort()) {
  for (const n of names) {
    if (!maps[n].has(key)) problems.push(`key "${key}" missing in ${n}`);
  }
  if (names.every((n) => maps[n].has(key))) {
    const ref = placeholders(maps.en.get(key));
    for (const n of names.slice(1)) {
      const got = placeholders(maps[n].get(key));
      if (got !== ref)
        problems.push(`placeholder mismatch for "${key}": en has {${ref}}, ${n} has {${got}}`);
    }
  }
  for (const n of names) {
    const templates = maps[n].get(key);
    if (templates && templates.some((s) => s.trim().length === 0)) {
      problems.push(`empty string at "${key}" in ${n}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n:check FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `i18n:check OK — ${allKeySet.size} keys × ${names.length} locales, placeholders aligned, no empty strings.`,
);
