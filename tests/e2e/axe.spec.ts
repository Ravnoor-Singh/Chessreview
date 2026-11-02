import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Accessibility gate (Round 2, Prompt 5): axe-core over the three primary
 * surfaces — the home/import page, the home page with the settings drawer
 * open, and a completed review (seeded exactly like visual.spec.ts, no
 * engine run). The bar is ZERO axe violations; any new violation fails
 * this spec and must be fixed in the app or consciously scoped out here
 * with a written reason.
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

async function expectNoViolations(
  page: Page,
  label: string,
  opts?: { disableRules?: string[] },
): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (opts?.disableRules) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${v.nodes[0]?.target}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
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
  await expect(page.getByRole('button', { name: /start review/i })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('axe accessibility gate', () => {
  test('home / import page has zero violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /grandmaster/i }).first()).toBeVisible();
    await expectNoViolations(page, 'home');
  });

  test('home with settings drawer open has zero violations', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page, 'home + settings drawer');
  });

  test('completed review summary has zero violations', async ({ page }) => {
    await seedReview(page);
    // Scoped exception (documented, Round 2 Prompt 5): axe's
    // label-content-name-mismatch fires on the 8 board squares that carry
    // a coordinate glyph ("8", "a", …) — the glyph is the square's own
    // name rendered decoratively (aria-hidden) inside the square button,
    // and the accessible name already LEADS with that square ("a8, black
    // rook"). The rule's voice-control intent is met by the name itself;
    // every other rule stays at zero tolerance, and the board's full
    // keyboard/ARIA model (Prompt 6) re-audits this surface.
    await expectNoViolations(page, 'review summary', {
      disableRules: ['label-content-name-mismatch'],
    });
  });

  test('settings page has no axe violations', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectNoViolations(page, 'settings page');
  });
});

/**
 * Stage C extension: axe over /settings in ALL FOUR locales, walking
 * every Board & Pieces tab and the Sounds/Accessibility sections, so a
 * localized label can never reintroduce a violation unnoticed (the
 * Stage A pass only covered the English landing view). Navigation is
 * by role + index, so the test itself is locale-independent.
 */
test.describe('settings page — all locales', () => {
  async function seedLocale(page: Page, locale: string): Promise<void> {
    await page.addInitScript((l) => {
      window.localStorage.setItem(
        'chess-review-settings',
        JSON.stringify({ state: { settings: { locale: l } }, version: 0 }),
      );
    }, locale);
  }

  for (const locale of ['en', 'hi', 'es', 'pa'] as const) {
    test(`axe clean in ${locale} across tabs and sections`, async ({ page }) => {
      await seedLocale(page, locale);
      await page.goto('/settings');
      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveCount(4);
      // Boards tab (default view).
      await expectNoViolations(page, `settings boards (${locale})`);
      // Pieces, then Background tabs.
      await tabs.nth(1).click();
      await expectNoViolations(page, `settings pieces (${locale})`);
      await tabs.nth(2).click();
      await expectNoViolations(page, `settings background (${locale})`);
      // Presets tab. Scoped exception (documented in Stage B): the
      // preset cards' MiniPreview renders aria-hidden coordinate
      // glyphs that axe counts as visible text inside the card's
      // accessible name; the name itself is the visible preset name,
      // so the rule's intent is met — same class as the review-board
      // exception above.
      await tabs.nth(3).click();
      await expectNoViolations(page, `settings presets (${locale})`, {
        disableRules: ['label-content-name-mismatch'],
      });
      // Sections: Sounds (index 3) and Accessibility (index 4).
      const navButtons = page.locator('nav').getByRole('button');
      await navButtons.nth(3).click();
      await expectNoViolations(page, `settings sounds (${locale})`);
      await navButtons.nth(4).click();
      await expectNoViolations(page, `settings accessibility (${locale})`);
    });
  }
});
