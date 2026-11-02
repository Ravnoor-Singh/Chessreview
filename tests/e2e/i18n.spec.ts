import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Internationalization layout checks (Prompt 10). Hindi/Punjabi strings
 * can be longer than English: at mobile width the settings drawer and
 * the review summary table must not overflow horizontally. These are
 * assertions, not new visual baselines — the committed English
 * snapshots in visual.spec.ts must keep passing unchanged.
 *
 * Pseudo-localization (Prompt 10 review fix): pseudo strings are ~30%
 * longer than English — longer than any real locale — so the input
 * page, the settings drawer and the review summary are ALL held to
 * the same no-horizontal-overflow bar at 390×844 in pseudo mode. The
 * seeded-review approach mirrors visual.spec.ts (completed review in
 * IndexedDB + sessionStorage hand-off; no engine run).
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    window.localStorage.setItem(
      'chess-review-settings',
      JSON.stringify({ state: { settings: s }, version: 0 }),
    );
  }, settings);
}

async function seedReview(page: Page): Promise<void> {
  await page.goto('/');
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

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('i18n layout safety', () => {
  test('settings drawer in Hindi at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0, locale: 'hi' });
    await page.goto('/');
    await page.getByRole('button', { name: 'सेटिंग्स' }).click();
    const drawer = page.getByRole('dialog', { name: 'सेटिंग्स' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('भाषा')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-settings-hi-mobile.png' });
  });

  test('settings drawer in Punjabi at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0, locale: 'pa' });
    await page.goto('/');
    await page.getByRole('button', { name: 'ਸੈਟਿੰਗਾਂ' }).click();
    const drawer = page.getByRole('dialog', { name: 'ਸੈਟਿੰਗਾਂ' });
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('review summary in Hindi at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0, locale: 'hi' });
    await seedReview(page);
    await page.goto('/review');
    // Hindi summary chrome: the Start Review button and accuracy label.
    await expect(page.getByRole('button', { name: /समीक्षा शुरू करें/ })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-summary-hi-mobile.png' });
  });

  test('pseudo mode renders transformed English on the input page without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0 });
    await page.goto('/?pseudo=1');
    await expect(page.getByRole('tab', { name: /⟦~/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-pseudo-mobile.png' });
  });

  test('pseudo mode settings drawer at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0 });
    await page.goto('/?pseudo=1');
    // Pseudo-transformed "Settings" button (accented, wrapped in ⟦~ … ~⟧).
    await page.getByRole('button', { name: /Šéttíñgš/ }).click();
    const drawer = page.getByRole('dialog', { name: /Šéttíñgš/ });
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-pseudo-settings-mobile.png' });
  });

  test('pseudo mode review summary at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0 });
    await seedReview(page);
    await page.goto('/review?pseudo=1');
    // Pseudo-transformed "Start Review" button on the summary screen.
    await expect(page.getByRole('button', { name: /Štárt Révíéw/ })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-pseudo-summary-mobile.png' });
  });
});

test.describe('per-locale surfaces (Round 2 Prompt 10)', () => {
  test('Hindi desktop: summary, move feedback, Noto font, localized title + manifest', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedSettings(page, { animationMs: 0, locale: 'hi' });
    await seedReview(page);
    await page.goto('/review');
    await expect(page.getByRole('button', { name: /समीक्षा शुरू करें/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('सटीकता', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Localized metadata + per-locale manifest (LocaleSync).
    await expect(page).toHaveTitle('शतरंज समीक्षा — Stockfish गेम विश्लेषण');
    // Two manifest links exist (the metadata one LocaleSync rewrites and
    // a static one); per the HTML standard the FIRST is the effective
    // manifest, and it is the localized one.
    const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute('href');
    expect(manifestHref).toBe('/manifest.hi.webmanifest');
    // The Devanagari face is self-hosted and loads for Hindi text.
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.load('16px "Noto Sans Devanagari Variable"', 'शतरंज');
      return document.fonts.check('16px "Noto Sans Devanagari Variable"', 'शतरंज');
    });
    expect(fontLoaded).toBe(true);
    // Move feedback in Hindi: start the walkthrough and pick a move.
    await page.getByRole('button', { name: /समीक्षा शुरू करें/ }).click();
    const moves = page.locator('[role="listbox"][aria-label="चालें"]');
    await expect(moves).toBeVisible({ timeout: 15_000 });
    await moves.getByRole('button').nth(3).click();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/[\u0900-\u097F]{4,}/);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-feedback-hi-desktop.png' });
  });

  test('Spanish desktop: summary + drawer marks machine-assisted locales', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedSettings(page, { animationMs: 0, locale: 'es' });
    await seedReview(page);
    await page.goto('/review');
    await expect(page.getByText('Precisión', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveTitle('Revisión de Partidas — Análisis con Stockfish');
    await expectNoHorizontalOverflow(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ajustes' }).click();
    const drawer = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(drawer).toBeVisible();
    const optionTexts = await drawer.getByLabel('Idioma').locator('option').allTextContents();
    expect(optionTexts.some((t) => t.includes('traducción automática'))).toBe(true);
    expect(optionTexts[0]).not.toContain('traducción automática'); // English = source
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-settings-es-desktop.png' });
  });

  test('Punjabi desktop: summary renders with the Gurmukhi face', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedSettings(page, { animationMs: 0, locale: 'pa' });
    await seedReview(page);
    await page.goto('/review');
    await expect(page.getByText('ਸ਼ੁੱਧਤਾ', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveTitle('ਸ਼ਤਰੰਜ ਸਮੀਖਿਆ — Stockfish ਖੇਡ ਵਿਸ਼ਲੇਸ਼ਣ');
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.load('16px "Noto Sans Gurmukhi Variable"', 'ਸ਼ਤਰੰਜ');
      return document.fonts.check('16px "Noto Sans Gurmukhi Variable"', 'ਸ਼ਤਰੰਜ');
    });
    expect(fontLoaded).toBe(true);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/i18n-summary-pa-desktop.png' });
  });

  test('Spanish summary at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0, locale: 'es' });
    await seedReview(page);
    await page.goto('/review');
    await expect(page.getByText('Precisión', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
  });

  test('Punjabi summary at mobile width does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0, locale: 'pa' });
    await seedReview(page);
    await page.goto('/review');
    await expect(page.getByText('ਸ਼ੁੱਧਤਾ', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
  });
});
