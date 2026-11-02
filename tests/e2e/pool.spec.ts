import { expect, test, type Page } from '@playwright/test';

// Round 2, Prompt 4 — the single-thread fallback pool, verified in a REAL
// browser (closes K5: until now the pool path was only ever exercised
// with fake engines in unit tests).
//
// The same spec runs in two projects (see playwright.config.ts):
//  - `heavy` (port 3100, COOP/COEP served): the page is cross-origin
//    isolated, so the app must negotiate the ONE multi-threaded build and
//    NO pool may exist.
//  - `chromium-noiso` (port 3101, NOISO=1 build without COOP/COEP): the
//    page is NOT isolated, so the app must fall back to the pool of
//    single-thread workers with the documented configuration — threads 1,
//    hash 32 MB, size min(4, hardwareConcurrency − 1) (pool.ts).
//
// The assertions read `window.__engineDebug()` (src/hooks/useEngine.ts),
// a read-only snapshot of the configuration the app actually negotiated.

interface EngineDebug {
  mode: string | null;
  buildFile: string | null;
  threads: number | null;
  hashMb: number | null;
  poolSize: number | null;
  poolClientCount: number | null;
  poolThreads: number | null;
  poolHashMb: number | null;
}

async function runSampleReviewAtQuick(page: Page): Promise<EngineDebug> {
  await page.goto('/');
  await page.getByRole('button', { name: /load sample game/i }).click();
  await page.locator('#depth-select').selectOption('quick');
  await page.getByRole('button', { name: /^review$/i }).click();
  await expect(page).toHaveURL(/\/review/);

  // A real analysis runs to completion (same completion signal as
  // review.spec.ts: the Cancel button appears, then disappears).
  const cancel = page.getByRole('button', { name: /cancel analysis/i });
  await expect(cancel).toBeVisible({ timeout: 30_000 });
  await expect(cancel).toBeHidden({ timeout: 180_000 });

  // The review really rendered (both accuracy numbers on the summary).
  const summaryGrid = page.locator('div:has(> span:text-is("Players"))').first();
  await expect(summaryGrid.getByText('Accuracy', { exact: true })).toBeVisible();

  return page.evaluate(() =>
    (window as unknown as { __engineDebug: () => EngineDebug }).__engineDebug(),
  );
}

test('engine configuration matches the isolation of the page', async ({ page }, testInfo) => {
  const debug = await runSampleReviewAtQuick(page);
  // Read AFTER the run, on the app origin (about:blank is never isolated).
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  const cores = await page.evaluate(() => navigator.hardwareConcurrency);

  if (testInfo.project.name === 'chromium-noiso') {
    expect(isolated).toBe(false);
    // Fallback engaged: a single-thread mode and a REAL pool behind it.
    expect(['single', 'lite']).toContain(debug.mode);
    expect(debug.poolSize).toBe(Math.min(4, Math.max(1, cores - 1)));
    expect(debug.poolThreads).toBe(1);
    expect(debug.poolHashMb).toBe(32);
    // Pool workers are real engine clients created for this analysis.
    expect(debug.poolClientCount).toBeGreaterThanOrEqual(1);
  } else {
    expect(isolated).toBe(true);
    // Exactly one multi-threaded client; no pool exists in this mode.
    expect(debug.mode).toBe('multi');
    expect(debug.threads).toBe(Math.max(1, Math.min(cores - 1, 8)));
    expect(debug.poolSize).toBeNull();
    expect(debug.poolClientCount).toBeNull();
  }
});
