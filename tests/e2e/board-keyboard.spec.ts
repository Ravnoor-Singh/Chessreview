import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Board keyboard model (Round 2, Prompt 6): on a seeded review taken to
 * the start position, the board is a single tab stop — arrow keys move
 * the focus square, Enter selects a piece (announcing its legal moves)
 * and completes a move on a target square (announcing the SAN), exactly
 * mirroring click-click. Assertions read the board's polite live region
 * and the squares' accessible names.
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

async function seedReviewAtStart(page: Page): Promise<void> {
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
  await page.getByRole('button', { name: 'First move' }).first().click();
  await expect(page.getByRole('gridcell', { name: 'e2, white pawn' })).toBeVisible();
}

test.describe('board keyboard model', () => {
  test('arrows navigate, Enter selects with legal-move announcement, Enter on target plays the move', async ({
    page,
  }) => {
    await seedReviewAtStart(page);

    const board = page.locator('div:has(> [role="grid"])').first();
    const live = board.locator('[aria-live="polite"]');
    // Focus the board container (the single tab stop) directly.
    await board.evaluate((el) => (el as HTMLElement).focus());

    // Default focus square is e2: Enter selects the pawn.
    await page.keyboard.press('Enter');
    await expect(live).toHaveText(/e2, white pawn selected\. 2 legal moves: e3, e4/);

    // Navigate e2 -> e4 and play it.
    await page.keyboard.press('ArrowUp');
    await expect(live).toHaveText(/^e3$/);
    await page.keyboard.press('ArrowUp');
    await expect(live).toHaveText(/^e4$/);
    await page.keyboard.press('Enter');
    await expect(live).toHaveText(/e4 played/);

    // The position actually changed: e4 now holds the white pawn, e2 is empty.
    await expect(page.getByRole('gridcell', { name: 'e4, white pawn' })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'e2', exact: true })).toBeVisible();

    // Escape clears a selection. After 1.e4 it is Black to move, so
    // navigate up to the e7 pawn and select it.
    await page.keyboard.press('ArrowUp'); // e5
    await page.keyboard.press('ArrowUp'); // e6
    await page.keyboard.press('ArrowUp'); // e7, black pawn
    await expect(live).toHaveText(/^e7, black pawn$/);
    await page.keyboard.press('Enter');
    await expect(live).toHaveText(/e7, black pawn selected\. 2 legal moves: e6, e5/);
    await page.keyboard.press('Escape');
    await expect(live).toHaveText(/Selection cleared/);
  });
});
