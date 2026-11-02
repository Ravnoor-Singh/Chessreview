// Copies the stockfish npm package's engine builds into /public/engine so the
// browser can load them same-origin as Web Workers. The loader resolves its
// .wasm next to the .js file with the same basename, so names are preserved.
//
// Only the three builds the client can actually select are copied by default
// (multi, single, lite-single). The asm.js fallback and the multi-threaded
// lite build are unused at runtime; opt back in with:
//   ENGINE_INCLUDE_ASM=1        → also copy stockfish-19-asm.js
//   ENGINE_INCLUDE_LITE_MULTI=1 → also copy stockfish-19-lite.js/.wasm
//
// ENGINE_BUNDLE profiles (Round 2, Prompt 7) choose WHAT ships in
// public/engine (total size per profile: `npm run engine:report`):
//   all       → every selectable build (the default; today's behavior)
//   multi+lite→ multi + lite-single only. A non-isolated device that would
//               have chosen `single` uses lite instead: the loader checks
//               the manifest and walks its fallback order to the first
//               build whose files are actually listed (see engineLoader).
//   lite-only → lite-single only, for size-critical embeds. The multi and
//               single modes degrade to lite with the existing notice.
//   external  → copy NOTHING; the manifest still lists every selectable
//               build's files with sizes + SHA-256 (computed from the
//               stockfish package), so integrity verification keeps working
//               when the files are served from NEXT_PUBLIC_ENGINE_BASE_URL
//               (upload them with scripts/upload-engine.mjs).
//
// Also writes public/engine/engine-manifest.json ({version, generatedAt,
// files: [{name, size, sha256}]}) which the client uses for the footer size
// display and for SHA-256 integrity verification of the .wasm it loads.
import { cpSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');
if (!existsSync(src)) {
  console.warn('[copy-engine] node_modules/stockfish/bin not found, skipping');
  process.exit(0);
}

export const MULTI = ['stockfish-19.js', 'stockfish-19.wasm'];
export const SINGLE = ['stockfish-19-single.js', 'stockfish-19-single.wasm'];
export const LITE = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
export const ALL_RUNTIME_FILES = [...MULTI, ...SINGLE, ...LITE];

export const PROFILES = {
  all: ALL_RUNTIME_FILES,
  'multi+lite': [...MULTI, ...LITE],
  'lite-only': LITE,
  external: [],
};
const bundleProfile = process.env.ENGINE_BUNDLE ?? 'all';
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) main();
function main() {
  if (!Object.hasOwn(PROFILES, bundleProfile)) {
    console.error(
      `[copy-engine] unknown ENGINE_BUNDLE "${bundleProfile}" — expected one of: ${Object.keys(PROFILES).join(', ')}`,
    );
    process.exit(1);
  }

  const files = [...PROFILES[bundleProfile]];
  if (bundleProfile !== 'external') {
    if (process.env.ENGINE_INCLUDE_ASM === '1') files.push('stockfish-19-asm.js');
    if (process.env.ENGINE_INCLUDE_LITE_MULTI === '1') {
      files.push('stockfish-19-lite.js', 'stockfish-19-lite.wasm');
    }
  }

  // Start from a clean directory so builds removed from the set do not linger.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  const copied = [];
  for (const name of files) {
    const from = join(src, name);
    if (!existsSync(from)) {
      console.warn(`[copy-engine] ${name} not found in the stockfish package, skipping it`);
      continue;
    }
    cpSync(from, join(dest, name));
    copied.push(name);
  }

  let version = 'unknown';
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, 'node_modules', 'stockfish', 'package.json'), 'utf8'),
    );
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // version stays 'unknown'; the manifest is still written
  }

  // For the `external` profile nothing is copied, but the manifest still
  // lists every runtime file (sizes + hashes read from the stockfish
  // package) so a CDN serving those exact files passes integrity checks.
  const manifestSource = bundleProfile === 'external' ? ALL_RUNTIME_FILES : copied;
  const manifestFiles = manifestSource.map((name) => {
    const bytes = readFileSync(join(bundleProfile === 'external' ? src : dest, name));
    return {
      name,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  const manifest = { version, generatedAt: new Date().toISOString(), files: manifestFiles };
  writeFileSync(join(dest, 'engine-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const total = manifestFiles.reduce((sum, f) => sum + f.size, 0);
  console.log(
    `[copy-engine] ENGINE_BUNDLE=${bundleProfile}: copied ${copied.length} stockfish files + engine-manifest.json (v${version}, ${manifestFiles.length} files listed, ${(total / 1048576).toFixed(1)} MiB) to public/engine`,
  );
}
