import { expect, test } from '@playwright/test';

// Round 2, Prompt 7 — the lite-only deployment profile in a real browser
// (the `chromium-lite` project serves an ENGINE_BUNDLE=lite-only build):
//   - the settings drawer offers only the shipped build (Auto + Lite) and
//     shows the "weaker engine" deployment note;
//   - a real Quick analysis completes on the lite build — the loader's
//     manifest-driven walk skipped the unshipped multi/single builds
//     without requesting their files (asserted via request tracking).

test('lite-only deployment: drawer filtering, note, and a lite analysis', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('/');
  await page.getByRole('button', { name: /settings/i }).click();
  const dialog = page.getByRole('dialog', { name: /settings/i });
  await expect(dialog).toBeVisible();

  const buildSelect = dialog.getByLabel(/engine build/i);
  await expect(buildSelect).toBeVisible();
  const values = await buildSelect
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(['auto', 'lite']);
  await expect(dialog.getByText(/ships only the Lite engine build/)).toBeVisible();
  await dialog
    .getByRole('button', { name: /close settings/i })
    .first()
    .click();
  await expect(dialog).toBeHidden();

  // A real analysis on the only shipped build.
  await page.getByRole('button', { name: /load sample game/i }).click();
  await page.locator('#depth-select').selectOption('quick');
  await page.getByRole('button', { name: /^review$/i }).click();
  await expect(page).toHaveURL(/\/review/);
  const cancel = page.getByRole('button', { name: /cancel analysis/i });
  await expect(cancel).toBeVisible({ timeout: 60_000 });
  await expect(cancel).toBeHidden({ timeout: 240_000 });

  const debug = await page.evaluate(() =>
    (
      window as unknown as {
        __engineDebug: () => { mode: string | null; buildFile: string | null };
      }
    ).__engineDebug(),
  );
  expect(debug.mode).toBe('lite');
  expect(debug.buildFile).toBe('stockfish-19-lite-single.js');
  // The unshipped builds were never requested.
  expect(requested.some((u) => u.endsWith('/engine/stockfish-19.wasm'))).toBe(false);
  expect(requested.some((u) => u.endsWith('/engine/stockfish-19-single.wasm'))).toBe(false);
});
