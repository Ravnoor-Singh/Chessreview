// Per-profile shipped-file test (Round 2, Prompt 7, requirement R6).
//
// For every ENGINE_BUNDLE profile: run the real copy step, then assert
//   1. public/engine contains exactly the profile's files + the manifest;
//   2. the manifest lists exactly the shipped files — except `external`,
//      whose manifest must list ALL runtime files (they live on the CDN)
//      while shipping none;
//   3. every manifest entry's size + SHA-256 matches the bytes on disk
//      (or, for external, the bytes in the stockfish package).
// Restores the default `all` profile at the end (even on failure), so the
// unit suite's generated-manifest test sees its expected state.
//
// Run with `npm run test:profiles`. This is the shipped-file half of the
// per-profile build test; each profile also gets a full `npm run build`
// in the Prompt 7 verification pass recorded in RELEASE_REPORT.md §18.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_RUNTIME_FILES, PROFILES } from './copy-engine.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'engine');
const binDir = join(root, 'node_modules', 'stockfish', 'bin');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

function runCopy(profile) {
  execFileSync(process.execPath, [join(root, 'scripts', 'copy-engine.mjs')], {
    env: { ...process.env, ENGINE_BUNDLE: profile },
    stdio: 'pipe',
  });
}

for (const [profile, expectedFiles] of Object.entries(PROFILES)) {
  console.log(`ENGINE_BUNDLE=${profile}`);
  runCopy(profile);
  const onDisk = readdirSync(dest).sort();
  const expectedOnDisk = [...expectedFiles, 'engine-manifest.json'].sort();
  check(
    'shipped file list matches the profile',
    JSON.stringify(onDisk) === JSON.stringify(expectedOnDisk),
    `on disk: ${onDisk.join(', ')}`,
  );
  const manifest = JSON.parse(readFileSync(join(dest, 'engine-manifest.json'), 'utf8'));
  const listedNames = manifest.files.map((f) => f.name).sort();
  const expectedListed = (profile === 'external' ? ALL_RUNTIME_FILES : expectedFiles)
    .slice()
    .sort();
  check(
    'manifest lists exactly the expected files',
    JSON.stringify(listedNames) === JSON.stringify(expectedListed),
    `listed: ${listedNames.join(', ')}`,
  );
  let hashesOk = true;
  for (const entry of manifest.files) {
    const sourceDir = profile === 'external' ? binDir : dest;
    const bytes = readFileSync(join(sourceDir, entry.name));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entry.size || sha !== entry.sha256) hashesOk = false;
  }
  check('manifest sizes + SHA-256 match the actual bytes', hashesOk);
}

console.log('restoring ENGINE_BUNDLE=all');
runCopy('all');
if (failures > 0) {
  console.error(`test-profiles: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('test-profiles: all profiles OK');
