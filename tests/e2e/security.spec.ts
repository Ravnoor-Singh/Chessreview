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
  // CSP tightening: production connect-src has NO bare https: token
  // (a named host's '//' does not match this pattern) and NO loopback.
  expect(csp).not.toMatch(/(?:^|[\s;])https:(?=\s|;|$)/);
  expect(csp).not.toContain('http://localhost');
  expect(csp).not.toContain('http://127.0.0.1');
  // Image previews use blob: object URLs only — the tightened policy
  // (post-Round-2 Prompt 1) has no data: in img-src.
  expect(csp).toContain("img-src 'self' blob:");
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

// CSP tightening (post-Round-2 Prompt 1): the tightened connect-src must
// actually bite in a production build — a fetch to an unlisted origin
// from page context is blocked by the policy (rejection + a
// securitypolicyviolation event naming connect-src), not merely absent
// from the header text asserted above.
test('CSP blocks a fetch to an unlisted origin (example.com) from page context', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    const onViolation = (e: SecurityPolicyViolationEvent) => {
      violations.push(e.effectiveDirective);
    };
    document.addEventListener('securitypolicyviolation', onViolation);
    let fetchError: string | null = null;
    try {
      await fetch('https://example.com/');
    } catch (err) {
      fetchError = String(err);
    }
    // The violation event is dispatched asynchronously after the block.
    await new Promise((resolve) => setTimeout(resolve, 100));
    document.removeEventListener('securitypolicyviolation', onViolation);
    return { fetchError, violations };
  });
  expect(result.fetchError, 'fetch to example.com must reject').not.toBeNull();
  expect(
    result.violations.some((d) => d.includes('connect-src')),
    `expected a connect-src violation, got: ${result.violations.join(', ') || '(none)'}`,
  ).toBe(true);
});
