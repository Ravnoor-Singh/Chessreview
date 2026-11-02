import { expect, test } from '@playwright/test';

// CSP tightening (post-Round-2 Prompt 1): the privacy proof. "All
// analysis is local, nothing is uploaded" is asserted, not just claimed:
// run a FULL sample-game analysis while recording every network request
// the page makes, then assert every single request went to the app's own
// origin (plus the configured engine-CDN origin when one is in play —
// read from E2E_ENGINE_ORIGIN because NEXT_PUBLIC_ENGINE_BASE_URL is a
// build-time value the page cannot read back; the standard heavy build
// serves the engine same-origin, so normally nothing extra is allowed).
// This spec lives in the heavy project (see playwright.config.ts): it
// runs a real Stockfish analysis, like review.spec.ts.
test('privacy: full sample-game analysis contacts only the app origin', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('/');
  const appOrigin = new URL(page.url()).origin;
  const allowed = new Set([appOrigin]);
  if (process.env.E2E_ENGINE_ORIGIN) allowed.add(new URL(process.env.E2E_ENGINE_ORIGIN).origin);

  // Load the bundled sample game and run a real Quick analysis — the
  // same flow as tests/e2e/review.spec.ts.
  await page.getByRole('button', { name: /load sample game/i }).click();
  await page.locator('#depth-select').selectOption('quick');
  await page.getByRole('button', { name: /^review$/i }).click();
  await expect(page).toHaveURL(/\/review/);

  const cancel = page.getByRole('button', { name: /cancel analysis/i });
  await expect(cancel).toBeVisible({ timeout: 60_000 });
  await expect(cancel).toBeHidden({ timeout: 180_000 });

  // The analysis really ran: the engine payload was fetched.
  expect(
    requested.some((u) => u.startsWith(`${appOrigin}/engine/`)),
    'expected at least one same-origin /engine/ request (proof the engine ran)',
  ).toBe(true);

  // …and NOTHING left the allowed origins. blob: worker wrappers wrap a
  // URL of their creating origin (blob:<origin>/…), so unwrap those
  // before comparing origins.
  const originOf = (raw: string): string => {
    try {
      return new URL(raw.startsWith('blob:') ? raw.slice('blob:'.length) : raw).origin;
    } catch {
      return '(unparseable)';
    }
  };
  const offenders = requested.filter((u) => !allowed.has(originOf(u)));
  expect(
    offenders,
    `analysis must contact only ${[...allowed].join(' / ')}; offenders: ${offenders.join(', ')}`,
  ).toEqual([]);
});
