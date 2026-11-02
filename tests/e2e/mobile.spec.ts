import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mobile pass (Round 2, Prompt 6): a 360px touch viewport over the two
 * routes — no horizontal scrolling, primary touch targets >= 44px tall
 * under a coarse pointer, and the review summary fully usable.
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

async function expectNoHorizontalScroll(page: import('@playwright/test').Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement;
    return el ? el.scrollWidth - el.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('mobile 360px', () => {
  test('home: no horizontal scroll, tabs and primary actions are touch-sized', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /grandmaster/i })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // The coarse-pointer rule (globals.css) lifts buttons to >= 44px.
    const tabHeight = await page
      .getByRole('tab', { name: 'PGN' })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(tabHeight).toBeGreaterThanOrEqual(44);
  });

  test('review summary: no horizontal scroll, Start Review target >= 44px', async ({ page }) => {
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
    const start = page.getByRole('button', { name: /start review/i });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
    const h = await start.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  });
});
