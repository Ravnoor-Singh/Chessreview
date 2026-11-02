import { expect, test } from '@playwright/test';

// Round 2, Prompt 7 — the external-engine deployment, verified end to end
// (acceptance A2). The `chromium-cdn` project serves a build whose
// NEXT_PUBLIC_ENGINE_BASE_URL points at a DIFFERENT origin
// (scripts/serve-engine-cdn.mjs on :3202 serving public/engine with the
// README recipe's CORS/CORP/immutable headers; the app itself on :3103
// with full COOP/COEP). The app must:
//   - stay cross-origin isolated,
//   - fetch the manifest + engine files from the CDN origin only,
//   - start the MULTI-threaded build from that origin (via the Blob
//     worker wrapper + SHA-256 verification), and
//   - complete a real Quick analysis.

const CDN_ORIGIN = 'http://127.0.0.1:3202';
const APP_ORIGIN = 'http://localhost:3103';

test('multi-threaded engine runs entirely from a cross-origin CDN base', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('/');
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

  await page.getByRole('button', { name: /load sample game/i }).click();
  await page.locator('#depth-select').selectOption('quick');
  await page.getByRole('button', { name: /^review$/i }).click();
  await expect(page).toHaveURL(/\/review/);

  const cancel = page.getByRole('button', { name: /cancel analysis/i });
  await expect(cancel).toBeVisible({ timeout: 60_000 });
  await expect(cancel).toBeHidden({ timeout: 240_000 });

  const debug = await page.evaluate(() =>
    (
      window as unknown as {
        __engineDebug: () => { mode: string | null; buildFile: string | null };
      }
    ).__engineDebug(),
  );
  expect(debug.mode).toBe('multi');
  expect(debug.buildFile).toBe('stockfish-19.js');

  // The engine payload came from the CDN origin…
  expect(requested.some((u) => u.startsWith(`${CDN_ORIGIN}/engine/engine-manifest.json`))).toBe(
    true,
  );
  expect(requested.some((u) => u.startsWith(`${CDN_ORIGIN}/engine/stockfish-19.wasm`))).toBe(true);
  expect(requested.some((u) => u.startsWith(`${CDN_ORIGIN}/engine/stockfish-19.js`))).toBe(true);
  // …and no engine file was requested from the app origin.
  expect(requested.some((u) => u.startsWith(`${APP_ORIGIN}/engine/`))).toBe(false);
});
