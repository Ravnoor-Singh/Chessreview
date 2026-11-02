import { expect, test } from '@playwright/test';

// Round 2 (termination taxonomy): the banner renders from the parsed
// game's resolved termination as soon as the review page loads — it does
// not wait for engine analysis — so these tests assert the displayed
// texts without waiting for a full Stockfish run.

async function submitPgn(page: import('@playwright/test').Page, pgn: string) {
  await page.goto('/');
  await page.getByLabel(/PGN text/i).fill(pgn);
  await page.getByRole('button', { name: /^review$/i }).click();
  await expect(page).toHaveURL(/\/review/);
}

const HEADERS = '[White "Alice"]\n[Black "Bob"]';

test('resignation game shows "Alice won by resignation"', async ({ page }) => {
  await submitPgn(
    page,
    `[Event "T"]\n${HEADERS}\n[Termination "White won by resignation"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n`,
  );
  await expect(page.getByTestId('termination-banner')).toContainText('Alice won by resignation', {
    timeout: 30_000,
  });
});

test('timeout game shows "Bob won on time"', async ({ page }) => {
  await submitPgn(
    page,
    `[Event "T"]\n${HEADERS}\n[Termination "Black won on time"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1\n`,
  );
  await expect(page.getByTestId('termination-banner')).toContainText('Bob won on time', {
    timeout: 30_000,
  });
});

test('repetition draw shows "Draw by threefold repetition"', async ({ page }) => {
  await submitPgn(
    page,
    `[Event "T"]\n${HEADERS}\n[Result "1/2-1/2"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2\n`,
  );
  await expect(page.getByTestId('termination-banner')).toContainText(
    'Draw by threefold repetition',
    {
      timeout: 30_000,
    },
  );
});

test('truncated PGN offers "Analyze up to move N" and starts analysis on click', async ({
  page,
}) => {
  await submitPgn(
    page,
    `[Event "T"]\n${HEADERS}\n[Result "*"]\n\n1. e4 e5 2. Nf3 BADMOVE 3. Bb5 *\n`,
  );
  await expect(page.getByTestId('pgn-recovery')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pgn-recovery')).toContainText('BADMOVE');
  const button = page.getByRole('button', { name: /analyze up to move/i });
  await expect(button).toBeVisible();
  await button.click();
  // Analysis of the valid prefix starts (the Cancel button appears).
  await expect(page.getByRole('button', { name: /cancel analysis/i })).toBeVisible({
    timeout: 30_000,
  });
});

test('Chess960 game is blocked with the localized not-supported screen', async ({ page }) => {
  await submitPgn(
    page,
    `[Event "960"]\n${HEADERS}\n[Variant "Chess960"]\n[SetUp "1"]\n[FEN "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1"]\n[Result "*"]\n\n1. e4 e5 *\n`,
  );
  await expect(page.getByTestId('chess960-blocked')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chess960-blocked')).toContainText('Chess960 is not supported yet');
});
