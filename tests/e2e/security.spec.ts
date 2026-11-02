import { expect, test } from '@playwright/test';

// Prompt 11: the production server must send the full security header
// set (incl. CSP) and the app must stay cross-origin isolated under it.
test('security headers: CSP + standard set present, page still cross-origin isolated', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  const headers = response!.headers();

  const csp = headers['content-security-policy'];
  expect(csp, 'Content-Security-Policy header must be present').toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  // WASM compilation for the Stockfish engine.
  expect(csp).toContain("'wasm-unsafe-eval'");
  // Engine workers.
  expect(csp).toContain("worker-src 'self' blob:");
  // Client fallbacks + engine CDN mode.
  expect(csp).toContain('https://lichess.org');
  expect(csp).toContain('https://api.chess.com');
  // Image previews.
  expect(csp).toContain("img-src 'self' data: blob:");
  expect(csp).toContain("frame-ancestors 'none'");

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toContain('camera=()');
  // Isolation (pre-existing) must survive alongside the CSP.
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');

  // The page must actually run under the policy: hydration works (the
  // heading is client-rendered text from the i18n catalogue) and the
  // document is cross-origin isolated, so the multi-threaded engine
  // path stays available.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const isolated = await page.evaluate(() => self.crossOriginIsolated);
  expect(isolated).toBe(true);
});
