// Shared loader for the i18n tooling scripts (glossary check, review
// CSV export/import): compiles the four TS catalogues with esbuild —
// the same technique as scripts/i18n-check.mjs — and flattens them to
// dot-key maps. Plural entries flatten to `<key>.one` / `<key>.other`.

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOCALES = ['en', 'hi', 'es', 'pa'];

export async function loadCatalogues() {
  const entry = LOCALES.map((l) => `export { ${l} } from './src/i18n/${l}.ts';`).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'i18n-catalogues-'));
  const entryPath = join(process.cwd(), '.i18n-catalogues-entry.ts');
  const outPath = join(dir, 'bundle.mjs');
  writeFileSync(entryPath, entry);
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
    try {
      unlinkSync(entryPath);
    } catch {
      // already gone
    }
  }
  const mod = await import(pathToFileURL(outPath).href);
  const flat = {};
  for (const locale of LOCALES) flat[locale] = flatten(mod[locale]);
  return flat;
}

export function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else if (value && typeof value === 'object') flatten(value, path, out);
    else throw new Error(`Unexpected catalogue leaf at ${path}: ${typeof value}`);
  }
  return out;
}

/** Sorted placeholder names ({name}) occurring in a template. */
export function placeholders(template) {
  const names = new Set();
  for (const match of template.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)) names.add(match[1]);
  return [...names].sort();
}
