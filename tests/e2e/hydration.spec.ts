/**
 * Hydration regression gate (Round 2, Prompt 9 — closes the K6 #418 item).
 *
 * History: Round 1 recorded React error #418 (server/client markup
 * mismatch) on the home page under a light OS color scheme. On the
 * current tree the error does NOT reproduce — the Prompt 6 restructure
 * made the first render deterministic: the server and the first client
 * render both use the default settings snapshot (dark theme, English,
 * static dictionary); the pre-paint theme script adjusts only the
 * <html data-theme> attribute (the one attribute covered by
 * suppressHydrationWarning); locale, dictionary and stored settings all
 * apply in effects after hydration (LocaleSync, ensureDictionary,
 * zustand/persist's deferred rehydration).
 *
 * This spec locks that in: it sweeps dark/light color schemes × the four
 * locales (seeded as stored settings AND, for Hindi, as a first-visit
 * browser locale) and fails if ANY console error or page error matching
 * a hydration pattern appears. It also asserts the page truly settles
 * into the seeded theme/locale, so a broken page can't pass vacuously.
 */
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const HYDRATION_PATTERN =
  /hydrat|#418|#419|#423|did not match|server-rendered|Minified React error #4/i;

const LOCALES = ['en', 'hi', 'es', 'pa'] as const;

async function sweep(
  browser: Browser,
  baseURL: string,
  opts: { colorScheme: 'dark' | 'light'; locale?: string; seed?: object },
): Promise<string[]> {
  const context: BrowserContext = await browser.newContext({
    colorScheme: opts.colorScheme,
    locale: opts.locale,
    baseURL,
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && HYDRATION_PATTERN.test(msg.text())) {
      problems.push(`console: ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', (err) => {
    if (HYDRATION_PATTERN.test(String(err)))
      problems.push(`pageerror: ${String(err).slice(0, 200)}`);
  });
  if (opts.seed) {
    await context.addInitScript((seed) => {
      try {
        localStorage.setItem('chess-review-settings', JSON.stringify(seed));
      } catch {
        /* storage unavailable in this context — the seed is best-effort */
      }
    }, opts.seed);
  }
  await page.goto('/');
  // The app shell rendered (not an error page) and hydration completed.
  await expect(page.locator('main, [role="main"], h1, h2').first()).toBeVisible();
  await page.waitForTimeout(700);
  await context.close();
  return problems;
}

test.describe('hydration — no #418 across color schemes and locales', () => {
  test('stored settings sweep (dark/light × en/hi/es/pa, opposite themes)', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const problems: string[] = [];
    for (const colorScheme of ['dark', 'light'] as const) {
      for (const locale of LOCALES) {
        // Deliberately seed the OPPOSITE theme of the OS scheme and a
        // non-default locale: maximal server/client divergence pressure.
        const seed = {
          state: { settings: { theme: colorScheme === 'dark' ? 'light' : 'dark', locale } },
          version: 0,
        };
        const found = await sweep(browser, baseURL!, { colorScheme, seed });
        problems.push(...found.map((p) => `${colorScheme}/${locale}: ${p}`));
      }
    }
    expect(problems).toEqual([]);
  });

  test('first visit, browser locale hi + light OS (no stored settings)', async ({
    browser,
    baseURL,
  }) => {
    const problems = await sweep(browser, baseURL!, { colorScheme: 'light', locale: 'hi-IN' });
    expect(problems).toEqual([]);
  });

  test('first visit, browser locale pa + dark OS (no stored settings)', async ({
    browser,
    baseURL,
  }) => {
    const problems = await sweep(browser, baseURL!, { colorScheme: 'dark', locale: 'pa-IN' });
    expect(problems).toEqual([]);
  });

  test('the seeded theme and locale actually settle after hydration', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark', baseURL });
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          'chess-review-settings',
          JSON.stringify({ state: { settings: { theme: 'light', locale: 'hi' } }, version: 0 }),
        );
      } catch {
        /* ignore */
      }
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await context.close();
  });
});
