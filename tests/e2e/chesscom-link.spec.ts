import { expect, test } from '@playwright/test';

// Round 2, Prompt 2: the complete chess.com link → inline username →
// archive search → found flow, with the /api/chesscom network mocked.
// The mocked search answers: archiveMonths → [2026-10, 2026-09];
// the scoped search misses in 2026-10 and finds the game in 2026-09.

const PGN =
  '[Event "Live Chess"]\n[White "Alice"]\n[Black "Bob"]\n[Termination "White won by resignation"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n';

test('chess.com game link asks for a username inline, searches archives, and opens the review', async ({
  page,
}) => {
  await page.route('**/api/chesscom**', async (route) => {
    const url = new URL(route.request().url());
    const op = url.searchParams.get('op');
    if (op === 'archiveMonths') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          months: [
            { year: 2026, month: 10 },
            { year: 2026, month: 9 },
          ],
        }),
      });
      return;
    }
    if (op === 'searchArchives') {
      const month = url.searchParams.get('month');
      await route.fulfill({
        contentType: 'application/json',
        body:
          month === '9'
            ? JSON.stringify({ found: true, pgn: PGN, month: '2026-09' })
            : JSON.stringify({ found: false, month: '2026-10' }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: /link \/ username/i }).click();
  await page.getByLabel(/game link or username/i).fill('https://www.chess.com/game/live/123456789');
  await page.getByRole('button', { name: /^review$/i }).click();

  // Inline prompt (not a modal): fill the username and search.
  const prompt = page.getByTestId('chesscom-username-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByLabel(/chess\.com username/i).fill('alice');
  await prompt.getByRole('button', { name: /search archives/i }).click();

  await expect(page).toHaveURL(/\/review/);
  await expect(page.getByTestId('termination-banner')).toContainText('Alice won by resignation', {
    timeout: 30_000,
  });

  // The successful username is remembered locally for the next import.
  const saved = await page.evaluate(() =>
    window.localStorage.getItem('chess-review:chesscom-username'),
  );
  expect(saved).toBe('alice');
});

test('username prompt is pre-filled from the remembered username', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('chess-review:chesscom-username', 'alice');
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /link \/ username/i }).click();
  await page
    .getByLabel(/game link or username/i)
    .fill('https://www.chess.com/game/daily/123456789');
  await page.getByRole('button', { name: /^review$/i }).click();
  const input = page.getByTestId('chesscom-username-prompt').getByLabel(/chess\.com username/i);
  await expect(input).toHaveValue('alice');
});
