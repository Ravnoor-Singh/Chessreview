import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Settings page (Themes & Presets, Stage A): the /settings page edits a
 * draft and only persists on Save (zustand persist, localStorage key
 * 'chess-review-settings', version 2). These specs cover the Board &
 * Pieces section — picking a board / piece set / background and saving,
 * Cancel discarding via window.confirm, applying a sample preset, and
 * the OptionGrid roving-focus keyboard model — plus a persistence check
 * on the review board itself (seeded exactly like axe.spec.ts).
 */

const reviewFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'visual-review.json'), 'utf8'),
) as { id: string };

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

async function readStoredSettings(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('chess-review-settings');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        state?: { settings?: Record<string, unknown> };
      };
      return parsed.state?.settings ?? null;
    } catch {
      return null;
    }
  });
}

test.describe('settings page', () => {
  test('settings page: pick board, pieces and background, save, review board changes, persists after reload', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Boards tab is selected by default.
    await expect(page.getByRole('tab', { name: 'Boards' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Boards: Purple.
    await page.getByRole('radio', { name: 'Purple', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Purple', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Pieces: Neo.
    await page.getByRole('tab', { name: 'Pieces' }).click();
    await expect(page.getByRole('tab', { name: 'Pieces' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('radio', { name: 'Neo', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Neo', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Background: Forest.
    await page.getByRole('tab', { name: 'Background' }).click();
    await expect(page.getByRole('tab', { name: 'Background' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('radio', { name: 'Forest', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Forest', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Dirty state is announced and Save is the way to persist it.
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(async () => (await readStoredSettings(page))?.boardTheme).toBe('purple');
    await expect.poll(async () => (await readStoredSettings(page))?.pieceSet).toBe('neo');
    await expect.poll(async () => (await readStoredSettings(page))?.backgroundId).toBe('forest');

    // The review board reflects the saved Purple theme: a8 is a light
    // square (#e7dff2) with White orientation by default.
    await seedReview(page);
    await expect(page.locator('[data-square="a8"]')).toHaveCSS(
      'background-color',
      'rgb(231, 223, 242)',
    );

    // Persistence: a fresh load of /settings shows the saved choices.
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Boards' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('radio', { name: 'Purple', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByRole('tab', { name: 'Pieces' }).click();
    await expect(page.getByRole('radio', { name: 'Neo', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByRole('tab', { name: 'Background' }).click();
    await expect(page.getByRole('radio', { name: 'Forest', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('settings page: cancel discards unsaved changes', async ({ page }) => {
    // The Cancel flow calls window.confirm when dirty; Playwright
    // auto-dismisses dialogs by default, which would cancel the
    // confirm() and keep the draft — accept it explicitly, first.
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Green', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByRole('radio', { name: 'Brown', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Brown', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('radio', { name: 'Green', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('You have unsaved changes.')).toBeHidden();

    const stored = await readStoredSettings(page);
    const boardTheme = (stored?.boardTheme as string | undefined) ?? 'green';
    expect(boardTheme).toBe('green');
  });

  test('settings page: presets tab applies a sample preset to the draft', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('tab', { name: 'Presets' }).click();
    await expect(page.getByRole('tab', { name: 'Presets' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('button', { name: 'Warm Wood', exact: true }).click();
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(async () => (await readStoredSettings(page))?.boardTheme).toBe('wood');
    await expect.poll(async () => (await readStoredSettings(page))?.pieceSet).toBe('staunton-wood');
  });

  test('settings page: pieces tab lists all 36 sets and a Stage C pick saves (Stage C)', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('tab', { name: 'Pieces' }).click();
    const grid = page.getByRole('radiogroup', { name: 'Piece set' });
    await expect(grid.getByRole('radio')).toHaveCount(36);

    await grid.getByRole('radio', { name: 'Tigers', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readStoredSettings(page))?.pieceSet).toBe('tigers');
  });

  test('blindfold mode hides every piece image on the board (Stage C)', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'chess-review-settings',
        JSON.stringify({ state: { settings: { blindfoldMode: true } }, version: 0 }),
      );
    });
    await seedReview(page);
    // The review board renders all 64 squares…
    await expect(page.locator('[data-square]')).toHaveCount(64);
    // …but blindfold renders no board piece images. The only piece
    // images left on the page are the two static White/Black player
    // chips in the review header (UI chrome — they reveal nothing
    // about the position).
    const imgs = page.locator('img[src*="/pieces/"]');
    await expect(imgs).toHaveCount(2);
    await expect(imgs.nth(0)).toHaveAttribute('alt', 'White');
    await expect(imgs.nth(1)).toHaveAttribute('alt', 'Black');
  });

  test('settings page: keyboard — arrow keys move selection in the boards grid', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Boards' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const green = page.getByRole('radio', { name: 'Green', exact: true });
    await expect(green).toHaveAttribute('aria-checked', 'true');
    await green.focus();
    await expect(green).toBeFocused();

    await page.keyboard.press('ArrowRight');

    const brown = page.getByRole('radio', { name: 'Brown', exact: true });
    await expect(brown).toHaveAttribute('aria-checked', 'true');
    await expect(brown).toBeFocused();
  });
});
