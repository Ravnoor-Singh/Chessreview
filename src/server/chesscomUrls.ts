// Construction of chess.com monthly-archive URLs from validated parts
// (Prompt 11). Lives outside the route module because Next.js route
// files may only export handlers/config.

/**
 * Monthly archive URL CONSTRUCTED from a validated archive-index entry:
 * the entry must be an https URL on api.chess.com whose path is exactly
 * /pub/player/{user}/games/{yyyy}/{mm}; the URL we fetch is rebuilt from
 * those parts, never the raw string. Returns null for anything else.
 */
export function constructArchiveMonthUrl(
  entry: unknown,
  username: string,
): { url: string; year: number; month: number } | null {
  if (typeof entry !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(entry);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== 'api.chess.com') return null;
  const m = /^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(\d{2})$/.exec(parsed.pathname);
  if (!m) return null;
  if (decodeURIComponent(m[1]).toLowerCase() !== username.toLowerCase()) return null;
  const year = Number(m[2]);
  const month = Number(m[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  return {
    url: `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`,
    year,
    month,
  };
}
