// Engine payload audit: prints every file in the stockfish package, its size,
// which runtime mode uses it, and whether the default copy set ships it.
// Run with `npm run engine:report` (or `node scripts/engine-report.mjs`).
// Source of truth is node_modules/stockfish/bin — what copy-engine.mjs sees.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'node_modules', 'stockfish', 'bin');
const publicDir = join(root, 'public', 'engine');

const CLASSIFICATION = new Map([
  [
    'stockfish-19.js',
    { mode: 'multi', shipped: true, note: 'Worker script, multi-threaded full build' },
  ],
  ['stockfish-19.wasm', { mode: 'multi', shipped: true, note: 'WASM for the multi build' }],
  [
    'stockfish-19-single.js',
    { mode: 'single', shipped: true, note: 'Worker script, single-threaded full build' },
  ],
  [
    'stockfish-19-single.wasm',
    {
      mode: 'single',
      shipped: true,
      note: 'WASM for the single build (different binary from multi)',
    },
  ],
  [
    'stockfish-19-lite-single.js',
    { mode: 'lite', shipped: true, note: 'Worker script, lite single-threaded build' },
  ],
  [
    'stockfish-19-lite-single.wasm',
    { mode: 'lite', shipped: true, note: 'WASM for the lite build' },
  ],
  [
    'stockfish-19-lite.js',
    {
      mode: 'unused',
      shipped: false,
      note: 'Multi-threaded lite build — never selected (opt-in: ENGINE_INCLUDE_LITE_MULTI=1)',
    },
  ],
  [
    'stockfish-19-lite.wasm',
    {
      mode: 'unused',
      shipped: false,
      note: 'WASM for the multi-threaded lite build — never selected',
    },
  ],
  [
    'stockfish-19-asm.js',
    {
      mode: 'unused',
      shipped: false,
      note: 'asm.js fallback for pre-WASM browsers — never selected (opt-in: ENGINE_INCLUDE_ASM=1)',
    },
  ],
]);

function human(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

if (!existsSync(binDir)) {
  console.error('[engine-report] node_modules/stockfish/bin not found — run `npm install` first.');
  process.exit(1);
}

const names = readdirSync(binDir).sort();
const rows = names.map((name) => {
  const size = statSync(join(binDir, name)).size;
  const info = CLASSIFICATION.get(name) ?? {
    mode: 'unknown',
    shipped: false,
    note: 'Unclassified file',
  };
  return { name, size, ...info };
});

console.log('# Stockfish engine payload audit\n');
console.log('| File | Size (bytes) | Size | Runtime mode | Ships by default | Notes |');
console.log('| --- | ---: | ---: | --- | --- | --- |');
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.size} | ${human(r.size)} | ${r.mode} | ${r.shipped ? 'yes' : 'no'} | ${r.note} |`,
  );
}

const totalAll = rows.reduce((s, r) => s + r.size, 0);
const totalShipped = rows.filter((r) => r.shipped).reduce((s, r) => s + r.size, 0);
const perMode = (mode) => rows.filter((r) => r.mode === mode).reduce((s, r) => s + r.size, 0);

// Per-profile deploy sizes (Prompt 7): totals for each ENGINE_BUNDLE
// profile, computed from the same PROFILES table copy-engine.mjs ships.
const { PROFILES, ALL_RUNTIME_FILES } = await import('./copy-engine.mjs');
const sizeOf = (name) => statSync(join(binDir, name)).size;
console.log('');
console.log('## Deploy size per ENGINE_BUNDLE profile\n');
console.log('| ENGINE_BUNDLE | Files shipped | Deploy size (bytes) | Deploy size |');
console.log('| --- | ---: | ---: | ---: |');
for (const [profile, files] of Object.entries(PROFILES)) {
  const bytes = files.reduce((s, n) => s + sizeOf(n), 0);
  const listed = profile === 'external' ? ALL_RUNTIME_FILES.length : files.length;
  console.log(
    `| ${profile} | ${files.length} (+ manifest listing ${listed}) | ${bytes} | ${human(bytes)} |`,
  );
}
console.log(
  '\nexternal ships 0 engine bytes with the app; the manifest-listed payload ' +
    `(${ALL_RUNTIME_FILES.reduce((s, n) => s + sizeOf(n), 0)} bytes) must be hosted at NEXT_PUBLIC_ENGINE_BASE_URL.`,
);

console.log('');
console.log(`- Full package (all builds): ${totalAll} bytes (${human(totalAll)})`);
console.log(
  `- Default shipped set (multi + single + lite-single): ${totalShipped} bytes (${human(totalShipped)})`,
);
console.log(
  `- Dropped by default: ${totalAll - totalShipped} bytes (${human(totalAll - totalShipped)}) — asm.js + multi-threaded lite`,
);
console.log(
  `- Per-mode shipped sizes: multi ${human(perMode('multi'))}, single ${human(perMode('single'))}, lite ${human(perMode('lite'))}`,
);
console.log(
  '- A visitor downloads ONE build only: ~94.5 MiB (full) or ~1.8 MiB (lite), not the whole directory.',
);

if (existsSync(publicDir)) {
  const copied = readdirSync(publicDir).sort();
  console.log(`\npublic/engine currently contains: ${copied.join(', ')}`);
  const manifestPath = join(publicDir, 'engine-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    console.log(
      `engine-manifest.json: version ${manifest.version}, generated ${manifest.generatedAt}, ${manifest.files.length} files with SHA-256 hashes.`,
    );
  } else {
    console.log('engine-manifest.json: MISSING (run `node scripts/copy-engine.mjs`)');
  }
} else {
  console.log(
    '\npublic/engine does not exist yet — run `npm install` (postinstall copies the engine).',
  );
}
