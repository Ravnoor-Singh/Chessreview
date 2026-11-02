import { expect, test } from '@playwright/test';

// Smoke test (spec Section 15): load the bundled sample game, run a real
// Stockfish analysis in the browser, and verify the review UI end to end.
test('sample game review completes with accuracy, badges, eval bar and keyboard navigation', async ({
  page,
}) => {
  await page.goto('/');

  // Load the sample game (Morphy's Opera Game) and pick the fast depth.
  await page.getByRole('button', { name: /load sample game/i }).click();
  await page.locator('#depth-select').selectOption('quick');
  await page.getByRole('button', { name: /^review$/i }).click();

  await expect(page).toHaveURL(/\/review/);
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();

  // Analysis starts (Cancel button appears) and then finishes (it disappears).
  // Engine WASM load + 34 positions at Quick depth takes well under 3 minutes.
  const cancel = page.getByRole('button', { name: /cancel analysis/i });
  await expect(cancel).toBeVisible({ timeout: 30_000 });
  // NOTE (Prompt 9): this assertion previously looked for /Analyzing move/,
  // the progress label of components/review/ReviewHeader.tsx — a component
  // nothing imports anymore, so that text can never render (verified: the
  // spec failed identically with service workers blocked). The current
  // analysis UI shows progress in the coach bubble as "Move X of Y". The
  // locator was repaired to the shipped text; the assertion's intent and
  // strength (real engine progress must render) are unchanged.
  await expect(page.getByText(/Move \d+ of \d+/)).toBeVisible({ timeout: 60_000 });
  await expect(cancel).toBeHidden({ timeout: 180_000 });

  // Both accuracy numbers render (sample has 17 white / 16 black moves).
  // NOTE (Prompt 9): this previously targeted section[aria-label="Accuracy"]
  // from components/review/AccuracyCard.tsx — also no longer imported; the
  // shipped summary renders the players/accuracy grid inline in
  // src/app/review/page.tsx with the two values as one-decimal spans.
  // Repaired to that grid; still asserts BOTH players' accuracy numbers.
  const summaryGrid = page.locator('div:has(> span:text-is("Players"))').first();
  await expect(summaryGrid.getByText('Accuracy', { exact: true })).toBeVisible();
  await expect(
    summaryGrid
      .locator('span:text-is("Accuracy") ~ span > span')
      .filter({ hasText: /^\d{1,3}\.\d$/ }),
  ).toHaveCount(2);
  await expect(page.getByText(/Performance estimate/i).first()).toBeVisible();

  // Opening card names the Philidor Defense (C41).
  await expect(page.getByText(/Philidor/i).first()).toBeVisible();

  // Summary table has at least one classified move counted.
  await expect(page.getByText('Brilliant').first()).toBeVisible();

  // NOTE (Prompt 9): the move list, eval bar and keyboard walkthrough live
  // in the review panel mode, entered via "Start review" (the same flow
  // visual.spec.ts uses) — the summary screen does not render MoveList.
  await page.getByRole('button', { name: /start review/i }).click();

  // Move list shows SAN with classification badges (inline SVG circles).
  const moves = page.locator('[role="listbox"][aria-label="Moves"]');
  await expect(moves).toBeVisible();
  await expect(moves.getByText('Rd8#')).toBeVisible();
  await expect(moves.locator('svg').first()).toBeVisible();

  // Evaluation bar and graph are present with their accessible roles and
  // labels. Prompt 6 changed the roles (bar: img -> meter with a value,
  // graph: img -> slider for keyboard scrubbing); this spec kept looking
  // for the old role="img" and failed silently until the Prompt 9 full
  // e2e run — the assertions below pin the CURRENT contract instead.
  await expect(page.getByRole('meter').first()).toBeVisible();
  await expect(page.getByRole('slider', { name: /evaluation graph/i })).toBeVisible();

  // Keyboard navigation: End jumps to the final move, Left steps back.
  await page.keyboard.press('End');
  // Two polite live regions exist since Prompt 6 (the board's keyboard
  // announcements + the review's move announcements); scope to the move
  // region by its "Move N:" content pattern.
  const moveAnnouncer = page
    .locator('div.sr-only[aria-live="polite"]')
    .filter({ hasText: /Move \d+:/ });
  await expect(moveAnnouncer).toContainText(/Rd8/);
  await page.keyboard.press('ArrowLeft');
  await expect(moveAnnouncer).toContainText(/Nxb8/);
});
