import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Visual regression tests (Prompt 7).
 *
 * Deterministic route: review screenshots NEVER run the engine. A
 * completed review (tests/fixtures/visual-review.json, built from the
 * bundled Opera Game PGN by scripts/make-visual-fixture.mjs) is seeded
 * into IndexedDB (`chess-review` DB, `reviews` store) and handed off via
 * the sessionStorage pending-review key — the app's "instant reopen from
 * a saved review" path. Animations are frozen by reduced-motion
 * emulation + Playwright's `animations: 'disabled'` screenshot option,
 * and the app's own animation setting is seeded to 0 ms.
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

const SHOT = { maxDiffPixelRatio: 0.01, animations: 'disabled' } as const;

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
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  // The seeded review renders the summary screen (accuracy table) with no
  // analysis run; wait for it plus the engine-load banner to settle.
  await expect(page.getByRole('button', { name: /start review/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('91.3')).toBeVisible();
  await expect(page.getByText(/Loading engine/)).toBeHidden({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('visual regression', () => {
  test('input page — desktop 1440×900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSettings(page, { animationMs: 0 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();
    await expect(page).toHaveScreenshot('input-desktop.png', SHOT);
  });

  test('input page — mobile 390×844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();
    await expect(page).toHaveScreenshot('input-mobile.png', SHOT);
  });

  test('input page — light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSettings(page, { animationMs: 0, theme: 'light' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /load sample game/i })).toBeVisible();
    await expect(page).toHaveScreenshot('input-light-theme.png', SHOT);
  });

  test('settings drawer open — piece sets and board themes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSettings(page, { animationMs: 0 });
    await page.goto('/');
    await page.getByRole('button', { name: /^settings$/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Settings' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: /piece set neo/i })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /board theme wood/i })).toBeVisible();
    await expect(page).toHaveScreenshot('settings-drawer.png', SHOT);
  });

  test('review summary — desktop (seeded review)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSettings(page, { animationMs: 0 });
    await seedReview(page);
    await expect(page).toHaveScreenshot('review-summary-desktop.png', SHOT);
  });

  test('review walkthrough mid-game (seeded review)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSettings(page, { animationMs: 0 });
    await seedReview(page);
    await page.getByRole('button', { name: /start review/i }).click();
    // Step to a mid-game ply (after 10...Nxb5) via keyboard navigation.
    for (let i = 0; i < 18; i += 1) await page.keyboard.press('ArrowRight');
    // Scoped by content: the board has its own polite live region since
    // Prompt 6 (keyboard announcements), so the bare selector is ambiguous.
    await expect(
      page.locator('div.sr-only[aria-live="polite"]').filter({ hasText: /Nxb5/ }),
    ).toContainText(/Nxb5/);
    await expect(page).toHaveScreenshot('review-walkthrough-midgame.png', SHOT);
  });

  test('review summary — mobile 390×844 (seeded review)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSettings(page, { animationMs: 0 });
    await seedReview(page);
    await expect(page).toHaveScreenshot('review-summary-mobile.png', SHOT);
  });

  test('review summary — tablet 820×1180 (seeded review)', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await seedSettings(page, { animationMs: 0 });
    await seedReview(page);
    await expect(page).toHaveScreenshot('review-summary-tablet.png', SHOT);
  });
});
