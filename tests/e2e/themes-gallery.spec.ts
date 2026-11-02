import { expect, test, type Page } from '@playwright/test';

/**
 * Theme contact sheets (Themes & Presets, Stage B; extended in C).
 *
 * Screenshots the internal /theme-gallery page, which renders every
 * registered board and background from the real registry definitions —
 * so a token change, a broken texture filter, or a readability
 * regression shows up as a visual diff. Each section is shot in dark
 * and light UI themes with animations disabled. Baselines were
 * generated on this platform (linux) and carry a 2% pixel tolerance.
 */

const SHOT = { maxDiffPixelRatio: 0.02, animations: 'disabled', fullPage: true } as const;

async function seedUiTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem(
      'chess-review-settings',
      JSON.stringify({
        state: { settings: { theme: t, animationMs: 0, backgroundId: 'standard' } },
        version: 0,
      }),
    );
  }, theme);
}

for (const theme of ['dark', 'light'] as const) {
  test(`contact sheet — boards (${theme} UI)`, async ({ page }) => {
    await seedUiTheme(page, theme);
    await page.goto('/theme-gallery?section=boards');
    await expect(page.locator('[data-section="boards"]')).toBeVisible();
    // Registry size at Stage B: 34 boards. Update with the registry.
    await expect(page.locator('[data-board]')).toHaveCount(34);
    await expect(page.locator('[data-board="neon"]')).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-boards-${theme}.png`, SHOT);
  });

  test(`contact sheet — backgrounds (${theme} UI)`, async ({ page }) => {
    await seedUiTheme(page, theme);
    await page.goto('/theme-gallery?section=backgrounds');
    await expect(page.locator('[data-section="backgrounds"]')).toBeVisible();
    // Registry size at Stage B: 28 backgrounds (incl. 3 custom).
    await expect(page.locator('[data-background]')).toHaveCount(28);
    await expect(page.locator('[data-background="space"]')).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-backgrounds-${theme}.png`, SHOT);
  });

  test(`contact sheet — piece sets (${theme} UI)`, async ({ page }) => {
    await seedUiTheme(page, theme);
    await page.goto('/theme-gallery?section=pieces');
    await expect(page.locator('[data-section="pieces"]')).toBeVisible();
    // Registry size at Stage C: 36 piece sets (5 legacy + 31 generated).
    await expect(page.locator('[data-piece-set]')).toHaveCount(36);
    await expect(page.locator('[data-piece-set="colorblind-safe"]')).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-pieces-${theme}.png`, SHOT);
  });

  test(`contact sheet — presets (${theme} UI)`, async ({ page }) => {
    await seedUiTheme(page, theme);
    await page.goto('/theme-gallery?section=presets');
    await expect(page.locator('[data-section="presets"]')).toBeVisible();
    // Registry size at Stage C: 22 curated presets.
    await expect(page.locator('[data-preset]')).toHaveCount(22);
    await expect(page.locator('[data-preset="neon-arcade"]')).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-presets-${theme}.png`, SHOT);
  });
}
