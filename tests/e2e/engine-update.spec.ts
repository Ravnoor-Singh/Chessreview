import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Engine / service-worker update e2e (post-Round-2 Prompt 2) against the
 * production server.
 *
 * Simulates an engine deploy WITHOUT rebuilding the app: the manifest
 * route is intercepted and first serves manifest A (the real deployed
 * manifest), then manifest B — same version, different content hash and
 * a different `generatedAt` marker. Asserts:
 * 1. Server cache headers: the manifest and /sw.js are `no-cache`, while
 *    a version-named payload file stays `immutable`.
 * 2. After the "deploy" and a fresh SW install/activation (unregister +
 *    reload, so the app re-registers /sw.js with
 *    `updateViaCache: 'none'`), a manifest fetch returns B — the SW's
 *    network-first manifest route never serves the A copy it cached.
 * 3. Activation purges stale engine bytes: a seeded entry the current
 *    manifest does not list, and a whole cache from an old fingerprint,
 *    are gone; the current payload entries survive.
 *
 * The manifest fetches in (2) are made from page context and pass
 * through the SW's network-first handler; the route is registered on
 * the browser CONTEXT (not the page), because page-level routing does
 * not intercept the service worker's own network fetch — the context
 * route is what lets the route stand in for the new deploy.
 */

interface ManifestFile {
  name: string;
  size: number;
  sha256: string;
}
interface EngineManifest {
  version: string;
  generatedAt: string;
  files: ManifestFile[];
}

const manifestA = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'engine', 'engine-manifest.json'), 'utf8'),
) as EngineManifest;

// Manifest B: identical deployment shape, different payload fingerprint
// (first file's hash flipped) and a marker timestamp.
const manifestB: EngineManifest = {
  ...manifestA,
  generatedAt: '2099-01-01T00:00:00.000Z',
  files: manifestA.files.map((f, i) => (i === 0 ? { ...f, sha256: 'a'.repeat(64) } : f)),
};

const OLD_CACHE = 'chess-review-sw-engine-v0.0.0-f0000000000000000';
const STALE_ENTRY = '/engine/stockfish-18.wasm';
const LITE_WASM = '/engine/stockfish-19-lite-single.wasm';

async function waitForSwControl(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
    timeout: 30_000,
  });
}

test('cache headers: engine manifest + sw.js are no-cache, versioned payload stays immutable', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const origin = new URL(page.url()).origin;

  const manifestRes = await request.get(`${origin}/engine/engine-manifest.json`);
  expect(manifestRes.headers()['cache-control']).toBe('no-cache');

  const swRes = await request.get(`${origin}/sw.js`);
  expect(swRes.headers()['cache-control']).toBe('no-cache');

  // A small version-named payload file (the lite JS, ~28 KB).
  const payloadRes = await request.get(`${origin}/engine/stockfish-19-lite-single.js`);
  expect(payloadRes.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('engine update: manifest B wins after redeploy and stale engine cache entries are purged', async ({
  page,
}) => {
  test.setTimeout(240_000);

  let phase: 'A' | 'B' = 'A';
  // Context-level routing: page.route does not intercept requests the
  // service worker itself makes, and the manifest fetch this test cares
  // about is the SW's network-first subrequest. A context route covers
  // both page-context and service-worker requests.
  await page.context().route('**/engine/engine-manifest.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify(phase === 'A' ? manifestA : manifestB),
    });
  });

  // --- First visit on manifest A -------------------------------------------
  await page.goto('/');
  await waitForSwControl(page);

  const seeded = await page.evaluate(
    async ({ liteWasm, staleEntry, oldCache }) => {
      // Warm the SW engine cache with a real payload file.
      const wasmRes = await fetch(liteWasm);
      await wasmRes.arrayBuffer();
      const names = await caches.keys();
      const engineName = names.find((n) => n.startsWith('chess-review-sw-engine-v'));
      if (!engineName) throw new Error('SW engine cache was not created');
      // Seed staleness: an entry the current manifest does not list,
      // inside the CURRENT engine cache, plus a whole old cache.
      const cache = await caches.open(engineName);
      await cache.put(staleEntry, new Response('stale engine bytes'));
      const old = await caches.open(oldCache);
      await old.put('/engine/stockfish-19.wasm', new Response('old engine bytes'));
      // Fetch + cache the A manifest through the SW.
      const manifestRes = await fetch('/engine/engine-manifest.json');
      const manifest = (await manifestRes.json()) as { generatedAt: string };
      return { engineName, generatedAt: manifest.generatedAt };
    },
    { liteWasm: LITE_WASM, staleEntry: STALE_ENTRY, oldCache: OLD_CACHE },
  );
  expect(seeded.generatedAt).toBe(manifestA.generatedAt);

  // --- "Deploy" manifest B, then force a fresh SW activation --------------
  phase = 'B';
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  });
  await page.reload();
  await waitForSwControl(page);

  // The manifest now served is B, not the A copy cached during visit 1.
  const served = await page.evaluate(async () => {
    const res = await fetch('/engine/engine-manifest.json');
    const manifest = (await res.json()) as { generatedAt: string; files: { sha256: string }[] };
    return { generatedAt: manifest.generatedAt, firstSha: manifest.files[0]?.sha256 };
  });
  expect(served.generatedAt).toBe(manifestB.generatedAt);
  expect(served.firstSha).toBe('a'.repeat(64));

  // Activation purged the stale entry + the old cache; current payload stays.
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ oldCache, staleEntry, liteWasm }) => {
            const names = await caches.keys();
            const engineName = names.find((n) => n.startsWith('chess-review-sw-engine-v'));
            const cache = engineName ? await caches.open(engineName) : null;
            const keys = cache ? (await cache.keys()).map((r) => new URL(r.url).pathname) : [];
            return {
              hasOldCache: names.includes(oldCache),
              hasStaleEntry: keys.includes(staleEntry),
              hasLiteWasm: keys.includes(liteWasm),
            };
          },
          { oldCache: OLD_CACHE, staleEntry: STALE_ENTRY, liteWasm: LITE_WASM },
        ),
      { timeout: 30_000 },
    )
    .toEqual({ hasOldCache: false, hasStaleEntry: false, hasLiteWasm: true });
});
