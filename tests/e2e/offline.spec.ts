import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Offline / PWA e2e (Prompt 9) against the production server.
 *
 * Proves, in order:
 * 1. Online first visit: the page is crossOriginIsolated BEFORE the service
 *    worker controls it (server headers), the SW activates and takes
 *    control, and the page is STILL crossOriginIsolated afterwards — the
 *    proof that SW-served responses carry the injected COOP/COEP headers
 *    (without them the multi-threaded engine would silently degrade).
 * 2. Engine files fetched online land in the SW's dedicated engine cache.
 * 3. Offline (context.setOffline): a reload serves the app shell from the
 *    SW, a seeded saved review opens and renders its summary, and the
 *    engine manifest + a WASM file are fetchable from cache — i.e. a real
 *    analysis could start offline (the full engine run itself is covered
 *    by review.spec.ts online; here we assert the stronger feasible
 *    offline fact: the exact bytes analysis needs are served from cache).
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

async function waitForSwControl(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
    timeout: 30_000,
  });
}

async function seedReview(page: Page): Promise<void> {
  await page.evaluate(async (review) => {
    await new Promise<void>((resolve, reject) => {
      const req = window.indexedDB.open('chess-review', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('positions'))
          db.createObjectStore('positions', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('reviews'))
          db.createObjectStore('reviews', { keyPath: 'id' });
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('reviews', 'readwrite');
        tx.objectStore('reviews').put(review);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
    window.sessionStorage.setItem(
      'chess-review:pending',
      JSON.stringify({ reviewId: (review as { id: string }).id }),
    );
  }, reviewFixture);
}

test('offline: SW preserves cross-origin isolation, shell + saved review + engine files work offline', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);

  // --- Online first visit -------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();

  // Isolation from the SERVER headers, before SW control.
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  // SW registers (production only), activates and claims the page.
  await waitForSwControl(page);

  // Isolation AFTER SW control — responses now come from the SW, so this
  // only stays true if the SW injects COOP/COEP into everything it serves.
  await page.reload();
  await waitForSwControl(page);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();

  // Caches populated: app precache + runtime, and the engine cache after
  // fetching the manifest and the small lite WASM through the SW.
  const warm = await page.evaluate(async () => {
    const manifestRes = await fetch('/engine/engine-manifest.json');
    const manifest = (await manifestRes.json()) as { version: string };
    const wasmRes = await fetch('/engine/stockfish-19-lite-single.wasm');
    const wasmBytes = (await wasmRes.arrayBuffer()).byteLength;
    const names = await caches.keys();
    return { version: manifest.version, wasmBytes, names };
  });
  expect(warm.wasmBytes).toBeGreaterThan(1_000_000);
  expect(warm.names.some((n) => n.startsWith('chess-review-app-'))).toBe(true);
  // Since Prompt 7 the SW engine cache name carries the engine payload's
  // content fingerprint: chess-review-sw-engine-v<version>-f<16 hex>.
  expect(
    warm.names.some((n) =>
      new RegExp(
        `^chess-review-sw-engine-v${warm.version.replace(/\./g, '\\.')}-f[0-9a-f]{16}$`,
      ).test(n),
    ),
  ).toBe(true);

  // Seed a saved review (same approach as visual.spec.ts).
  await seedReview(page);

  // --- Go offline -----------------------------------------------------------
  await context.setOffline(true);

  // App shell loads from the SW; the offline banner + link-tab state show.
  await page.reload();
  await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();
  await expect(
    page.getByText(/saved reviews, the board editor and analysis still work/),
  ).toBeVisible();
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  // The link-import tab shows its offline state.
  await page.getByRole('tab', { name: /link/i }).click();
  await expect(page.getByText(/paste a PGN or use the editor instead/)).toBeVisible();

  // Engine files are served from the SW engine cache while offline.
  const offlineEngine = await page.evaluate(async () => {
    const manifestRes = await fetch('/engine/engine-manifest.json');
    const wasmRes = await fetch('/engine/stockfish-19-lite-single.wasm');
    return {
      manifestOk: manifestRes.ok,
      wasmOk: wasmRes.ok,
      wasmBytes: (await wasmRes.arrayBuffer()).byteLength,
    };
  });
  expect(offlineEngine.manifestOk).toBe(true);
  expect(offlineEngine.wasmOk).toBe(true);
  expect(offlineEngine.wasmBytes).toBeGreaterThan(1_000_000);

  // The seeded saved review opens offline and renders its summary.
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.getByText('91.3')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  await context.setOffline(false);
});
