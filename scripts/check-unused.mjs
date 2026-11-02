#!/usr/bin/env node
/**
 * Unused-file check (Round 2, Prompt 9): fails when a source file under
 * src/ is not reachable from the app's entry points through the import
 * graph. This is the check that would have caught the orphaned
 * ReviewHeader.tsx / AccuracyCard.tsx components (deleted in Prompt 9).
 *
 * Graph rules:
 *  - Entries: every file under src/app/ (Next.js framework entries:
 *    pages, layouts, route handlers, loading/error files), the worker
 *    entries referenced via `new Worker(new URL(...))`, and src/i18n
 *    dictionary modules loaded by the i18n index.
 *  - Edges: static imports, re-exports, dynamic import(), side-effect
 *    imports, `new URL('./x', import.meta.url)` worker references, and
 *    asset path strings ('../assets/...') used by next/font.
 *  - Resolution: '@/…' → src/, relative paths, .ts/.tsx/.js/.jsx/.mts/.css
 *    extensions and index files.
 *  - Non-code assets under src/ (fonts, licenses) count as used when an
 *    edge resolves to them; they are not graph nodes themselves.
 *
 * Allowlist: files that are intentionally unreachable from the import
 * graph (e.g. loaded by a platform convention this parser cannot see)
 * go in ALLOWLIST with a reason. An allowlist entry that no longer
 * exists, or that became reachable, is reported as stale.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** @type {{ file: string, reason: string }[]} */
const ALLOWLIST = [
  {
    file: 'src/i18n/dictionaries.ts',
    reason:
      'Static all-locale dictionary facade imported by tests and the i18n checker; production code loads dictionaries lazily per locale via src/i18n/index.ts by design (Prompt 6).',
  },
  {
    file: 'src/engine/budgetRules.d.mts',
    reason:
      'Type declarations for budgetRules.mjs; TypeScript pairs a .d.mts with its .mjs automatically — there is no import statement to graph.',
  },
  {
    file: 'src/lib/swCore.d.mts',
    reason:
      'Type declarations for swCore.mjs (service-worker core); paired automatically by TypeScript like budgetRules.d.mts.',
  },
  {
    file: 'src/themes/index.ts',
    reason:
      'Theme-registry barrel for tests and tooling (its documented purpose); production code imports the per-kind registry modules directly so bundles stay split.',
  },
];

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts'];
const ALL_EXTS = [...CODE_EXTS, '.css', '.json', '.svg', '.woff2', '.md'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = walk(SRC);
const codeFiles = allFiles.filter((f) => CODE_EXTS.some((e) => f.endsWith(e)));

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else return null; // package import — not a graph node
  const candidates = [
    base,
    ...ALL_EXTS.map((e) => base + e),
    ...CODE_EXTS.map((e) => join(base, 'index' + e)),
  ];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const IMPORT_PATTERNS = [
  /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
  /path:\s*['"]([^'"]+)['"]/g,
];

function edgesOf(file) {
  const source = readFileSync(file, 'utf8');
  const targets = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved) targets.add(resolved);
    }
  }
  return targets;
}

// Entries: everything under src/app plus the vision worker (it is also
// imported as a type by client.ts, but its runtime entry is the URL).
const entries = codeFiles.filter(
  (f) => relative(SRC, f).startsWith('app/') || f.endsWith('vision.worker.ts'),
);

const reachable = new Set(entries);
const queue = [...entries];
while (queue.length) {
  const file = queue.pop();
  if (!codeFiles.includes(file)) continue;
  for (const target of edgesOf(file)) {
    if (!reachable.has(target)) {
      reachable.add(target);
      queue.push(target);
    }
  }
}

const rel = (f) => relative(ROOT, f);
const unused = codeFiles.filter((f) => !reachable.has(f));
const allowlisted = new Set(ALLOWLIST.map((a) => join(ROOT, a.file)));
const violations = unused.filter((f) => !allowlisted.has(f));
const staleAllowlist = ALLOWLIST.filter(
  (a) => !existsSync(join(ROOT, a.file)) || reachable.has(join(ROOT, a.file)),
);

for (const f of unused) {
  console.log(`unused: ${rel(f)}${allowlisted.has(f) ? ' (allowlisted)' : ''}`);
}
for (const a of staleAllowlist) {
  console.log(`stale allowlist entry: ${a.file} — ${a.reason}`);
}
if (violations.length || staleAllowlist.length) {
  console.error(
    `check-unused: ${violations.length} unreachable file(s), ${staleAllowlist.length} stale allowlist entr(ies)`,
  );
  process.exit(1);
}
console.log(
  `check-unused: OK — ${codeFiles.length} source files, ${reachable.size} reachable from ${entries.length} entries, ${unused.length} allowlisted unused`,
);
