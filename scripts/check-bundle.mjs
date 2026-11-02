// Bundle budget check (Round 2, Prompt 6).
//
// Computes each route's First Load JS as the sum of the GZIP sizes of the
// JS chunks in .next/app-build-manifest.json for that route (the same
// chunk set Next's build table reports), and compares against the budgets
// below. Run after `npm run build`. Exits 1 on any violation.
//
// Budgets (gzip KB): / <= 170, /review <= 220. Before this prompt the
// routes measured 234 / 268 on Next's own (raw-size) table; this script's
// gzip numbers are the enforced ones — both are reported in
// PERFORMANCE.md so the two series are never confused.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGETS = new Map([
  ['/page', 170],
  ['/review/page', 220],
]);

const root = process.cwd();
const manifestPath = join(root, '.next', 'app-build-manifest.json');
if (!existsSync(manifestPath)) {
  console.error('check-bundle: .next/app-build-manifest.json missing — run `npm run build` first.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const sizeCache = new Map();
function gzipKb(file) {
  if (!sizeCache.has(file)) {
    const buf = readFileSync(join(root, '.next', file));
    sizeCache.set(file, gzipSync(buf).length / 1024);
  }
  return sizeCache.get(file);
}

let failed = false;
for (const [route, budgetKb] of BUDGETS) {
  const files = manifest.pages[route];
  if (!files) {
    console.error(`check-bundle: route ${route} not in build manifest`);
    failed = true;
    continue;
  }
  const js = files.filter((f) => f.endsWith('.js'));
  const total = js.reduce((sum, f) => sum + gzipKb(f), 0);
  const ok = total <= budgetKb;
  if (!ok) failed = true;
  console.log(
    `check-bundle: ${route === '/page' ? '/' : '/review'} First Load JS ${total.toFixed(1)} KB gzip ` +
      `(budget ${budgetKb} KB) — ${ok ? 'OK' : 'OVER BUDGET'}`,
  );
}
process.exit(failed ? 1 : 0);
