// Lichess import helpers (spec 4.5).

/** Normalise a PGN exported from Lichess: trimmed, exactly one trailing newline. */
export function normalizeLichessPgn(pgn: string): string {
  const trimmed = pgn.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';
  return `${trimmed}\n`;
}

/**
 * URL of the Lichess game-export endpoint for a game id, requesting the
 * data the review pipeline needs (clocks and opening names included).
 */
export function lichessExportUrl(gameId: string): string {
  return `https://lichess.org/game/export/${encodeURIComponent(gameId)}?clocks=true&evals=false&opening=true&literate=false`;
}
