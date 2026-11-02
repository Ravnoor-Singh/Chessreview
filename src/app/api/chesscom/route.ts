import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { decodeChessComMoveList, normalizeArchiveGame } from '@/parsers/chesscom';
import type { ImportedGameSummary } from '@/lib/types';
import { detectLocale, type Locale } from '@/i18n';
import { apiError } from '@/server/errors';
import { chesscomQuerySchema, searchParamsRecord, type ChesscomQuery } from '@/server/validation';
import { fetchUpstream, parseUpstreamJson, UpstreamError } from '@/server/upstream';
import { getServerCache } from '@/server/cache';
import { jsonCached, rateLimitResponse } from '@/server/respond';
import { chesscomCallbackEnabled } from '@/server/config';
import { constructArchiveMonthUrl } from '@/server/chesscomUrls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'chess-review/1.0 (game review app; contact: local user)';

// Response size caps (Prompt 11): archive index is a list of URLs (small),
// a monthly archive holds at most a few thousand games of JSON.
const ARCHIVES_INDEX_MAX_BYTES = 5 * 1024 * 1024;
const MONTHLY_ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
const CALLBACK_MAX_BYTES = 5 * 1024 * 1024;

// Cache policy (see README "API & security"):
// - server cache TTLs: past-month archive lists are immutable → 1 h;
//   a single game (callback) is immutable once finished → 24 h.
// - Cache-Control: archives list mixes current month → short s-maxage.
const ARCHIVE_LIST_TTL_S = 3600;
const GAME_TTL_S = 24 * 3600;
// Archive search (Round 2, Prompt 2): past months are immutable → long
// server-cache TTL (7 days); the current month can still gain games →
// short TTL (5 min). A found game itself is immutable → GAME_TTL_S.
const PAST_MONTH_TTL_S = 7 * 24 * 3600;
const CURRENT_MONTH_TTL_S = 300;
/** How far back a link import searches a player's archives. */
const ARCHIVE_SEARCH_MAX_MONTHS = 12;

interface FetchResult {
  status: number;
  json: unknown;
  /** Upstream Retry-After header, when present (honored on 429s). */
  retryAfter?: string | null;
  headers?: Headers;
}

/** fetchUpstream + JSON parse. A 200 with a non-JSON body throws
 * UpstreamError('invalid_json') (clean UPSTREAM_ERROR upstream); error
 * statuses keep their status mapping even when the body is empty or
 * non-JSON, exactly like the pre-Prompt-11 route which parsed leniently. */
async function fetchJson(url: string, maxBytes: number): Promise<FetchResult> {
  const res = await fetchUpstream(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    maxBytes,
  });
  if (res.status === 200) {
    return { status: res.status, json: parseUpstreamJson(res.text), headers: res.headers };
  }
  let json: unknown = null;
  try {
    json = res.text ? (JSON.parse(res.text) as unknown) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    json,
    retryAfter: res.headers.get('retry-after'),
    headers: res.headers,
  };
}

function upstreamFailure(locale: Locale, e: unknown, archive: boolean): NextResponse {
  if (e instanceof UpstreamError) {
    if (e.kind === 'timeout') {
      return apiError(504, 'UPSTREAM_TIMEOUT', locale, 'errors.upstreamTimeout');
    }
    if (e.kind === 'too_large') {
      return apiError(502, 'RESPONSE_TOO_LARGE', locale, 'errors.responseTooLarge');
    }
  }
  return apiError(
    502,
    'UPSTREAM_ERROR',
    locale,
    archive ? 'errors.chesscomArchiveFailed' : 'errors.chesscomNetwork',
  );
}

function isCurrentMonth(year: number, month: number, now = new Date()): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

/** Username → recent games from the public monthly archives. */
async function handleUser(query: ChesscomQuery, locale: Locale) {
  const username = query.user as string;
  const cache = getServerCache();
  const key = `chesscom:user:${username.toLowerCase()}`;
  const hit = await cache.get<ImportedGameSummary[]>(key);
  if (hit) return jsonCached({ games: hit }, 300, 3600);

  let idx: FetchResult;
  try {
    idx = await fetchJson(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
      ARCHIVES_INDEX_MAX_BYTES,
    );
  } catch (e) {
    return upstreamFailure(locale, e, true);
  }
  if (idx.status === 404) {
    return apiError(404, 'USER_NOT_FOUND', locale, 'errors.chesscomUserNotFound', { username });
  }
  if (idx.status === 429) {
    return apiError(429, 'UPSTREAM_RATE_LIMITED', locale, 'errors.chesscomRateLimited');
  }
  if (idx.status !== 200 || !idx.json || typeof idx.json !== 'object') {
    return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomArchiveFailed');
  }
  const archives = (idx.json as { archives?: unknown[] }).archives ?? [];

  // Pick the months to read: an explicit ?year=&month= (validated), else
  // the two most recent archive entries — each CONSTRUCTED, never raw.
  let months: { url: string; year: number; month: number }[];
  if (query.year !== undefined && query.month !== undefined) {
    const mm = String(query.month).padStart(2, '0');
    months = [
      {
        url: `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${query.year}/${mm}`,
        year: query.year,
        month: query.month,
      },
    ];
  } else {
    months = archives
      .slice(-2)
      .reverse()
      .map((entry) => constructArchiveMonthUrl(entry, username))
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  const games: ImportedGameSummary[] = [];
  let touchesCurrentMonth = false;
  for (const monthRef of months) {
    if (isCurrentMonth(monthRef.year, monthRef.month)) touchesCurrentMonth = true;
    let month: FetchResult;
    try {
      month = await fetchJson(monthRef.url, MONTHLY_ARCHIVE_MAX_BYTES);
    } catch (e) {
      return upstreamFailure(locale, e, true);
    }
    if (month.status !== 200 || !month.json || typeof month.json !== 'object') continue;
    const list = (month.json as { games?: unknown[] }).games ?? [];
    for (const raw of list) {
      const g = normalizeArchiveGame(raw);
      if (g) games.push(g);
    }
  }
  games.sort((a, b) => (a.date < b.date ? 1 : -1));
  const trimmed = games.slice(0, 60);
  await cache.set(key, trimmed, ARCHIVE_LIST_TTL_S);
  // Current month can still gain games → short s-maxage; a past-month-only
  // (or empty) result is effectively immutable → long s-maxage.
  return touchesCurrentMonth
    ? jsonCached({ games: trimmed }, 300, 3600)
    : jsonCached({ games: trimmed }, 3600, 86400);
}

// --- Archive search (Round 2, Prompt 2) -----------------------------------
//
// PRIVACY: this module never logs usernames or PGNs. No console logging
// exists in the route at all; upstream failures surface only as taxonomy
// error codes to the client. If operational logging is ever added it may
// carry ONLY the error code and a duration in ms — never the username,
// the game id's owner, or any PGN text. See README "Privacy".
//
// Etiquette toward the official public API: a descriptive User-Agent on
// every upstream request (UA above), months are fetched strictly
// SEQUENTIALLY (concurrency 1, serialized per request), the search stops
// at the first match, and an upstream 429 is passed through with its
// Retry-After header instead of being retried around.

interface MonthRef {
  url: string;
  year: number;
  month: number;
}

function rateLimited(locale: Locale, retryAfter?: string | null): NextResponse {
  return apiError(
    429,
    'UPSTREAM_RATE_LIMITED',
    locale,
    'errors.chesscomRateLimited',
    undefined,
    retryAfter ? { 'Retry-After': retryAfter } : undefined,
  );
}

type IndexResult = { months: MonthRef[] } | { error: NextResponse };

/** Fetch + parse the player's archive index → months newest-first (max 12). */
async function loadArchiveIndex(username: string, locale: Locale): Promise<IndexResult> {
  let idx: FetchResult;
  try {
    idx = await fetchJson(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
      ARCHIVES_INDEX_MAX_BYTES,
    );
  } catch (e) {
    return { error: upstreamFailure(locale, e, true) };
  }
  if (idx.status === 404) {
    return {
      error: apiError(404, 'USER_NOT_FOUND', locale, 'errors.chesscomUserNotFound', { username }),
    };
  }
  if (idx.status === 429) return { error: rateLimited(locale, idx.retryAfter) };
  if (idx.status !== 200 || !idx.json || typeof idx.json !== 'object') {
    return { error: apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomArchiveFailed') };
  }
  const entries = (idx.json as { archives?: unknown[] }).archives ?? [];
  const seen = new Set<string>();
  const months: MonthRef[] = [];
  for (const entry of entries) {
    const ref = constructArchiveMonthUrl(entry, username);
    if (!ref) continue;
    const key = `${ref.year}-${ref.month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    months.push(ref);
  }
  months.sort((a, b) => b.year - a.year || b.month - a.month);
  return { months: months.slice(0, ARCHIVE_SEARCH_MAX_MONTHS) };
}

type MonthGamesResult = { games: ImportedGameSummary[] } | { error: NextResponse };

/** One month's normalized games, via the pluggable cache (past months are
 * immutable → long TTL; current month → short TTL). A 404 month simply
 * has no archived games and reads as an empty list. */
async function loadMonthGames(
  username: string,
  ref: MonthRef,
  locale: Locale,
): Promise<MonthGamesResult> {
  const cache = getServerCache();
  const mm = String(ref.month).padStart(2, '0');
  const key = `chesscom:month:${username.toLowerCase()}:${ref.year}-${mm}`;
  const hit = await cache.get<ImportedGameSummary[]>(key);
  if (hit) return { games: hit };

  let month: FetchResult;
  try {
    month = await fetchJson(ref.url, MONTHLY_ARCHIVE_MAX_BYTES);
  } catch (e) {
    return { error: upstreamFailure(locale, e, true) };
  }
  if (month.status === 429) return { error: rateLimited(locale, month.retryAfter) };
  if (month.status === 404) return { games: [] };
  if (month.status !== 200 || !month.json || typeof month.json !== 'object') {
    return { error: apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomArchiveFailed') };
  }
  const list = (month.json as { games?: unknown[] }).games ?? [];
  const games: ImportedGameSummary[] = [];
  for (const raw of list) {
    const g = normalizeArchiveGame(raw);
    if (g) games.push(g);
  }
  await cache.set(
    key,
    games,
    isCurrentMonth(ref.year, ref.month) ? CURRENT_MONTH_TTL_S : PAST_MONTH_TTL_S,
  );
  return { games };
}

function monthLabel(ref: MonthRef): string {
  return `${ref.year}-${String(ref.month).padStart(2, '0')}`;
}

/** op=archiveMonths → { months: [{year, month}] } newest first, max 12. */
async function handleArchiveMonths(query: ChesscomQuery, locale: Locale) {
  const username = query.user as string;
  const idx = await loadArchiveIndex(username, locale);
  if ('error' in idx) return idx.error;
  return jsonCached({ months: idx.months.map(({ year, month }) => ({ year, month })) }, 300, 3600);
}

/**
 * op=searchArchives → find one game (by the link's id) in a player's
 * monthly archives, official public API only.
 * - With ?year=&month=: search ONLY that month → 200 { found, pgn?, month }
 *   (a miss is a normal 200 so the client can walk month by month with
 *   progress + cancel).
 * - Without: walk up to 12 months newest-first, stop at the first match →
 *   200 { found: true, pgn, month } or 404 GAME_NOT_FOUND whose message
 *   distinguishes "no public games at all" from "not in the last 12
 *   months" and names the next step (paste the PGN).
 * Live and daily games are handled identically: archive entries carry
 * the same /game/live/<id> or /game/daily/<id> URL the id came from.
 */
async function handleSearchArchives(query: ChesscomQuery, locale: Locale) {
  const username = query.user as string;
  const id = query.id as string;
  const idx = await loadArchiveIndex(username, locale);
  if ('error' in idx) return idx.error;

  // Scoped single-month search (client-driven walk with progress/cancel).
  if (query.year !== undefined && query.month !== undefined) {
    const ref: MonthRef = {
      url: `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${query.year}/${String(query.month).padStart(2, '0')}`,
      year: query.year,
      month: query.month,
    };
    const loaded = await loadMonthGames(username, ref, locale);
    if ('error' in loaded) return loaded.error;
    const found = loaded.games.find((g) => g.id === id);
    const current = isCurrentMonth(ref.year, ref.month);
    return found
      ? jsonCached({ found: true, pgn: found.pgn, month: monthLabel(ref) }, 3600, 86400)
      : jsonCached({ found: false, month: monthLabel(ref) }, current ? 60 : 3600, 3600);
  }

  if (idx.months.length === 0) {
    return apiError(404, 'GAME_NOT_FOUND', locale, 'errors.chesscomSearchEmpty');
  }
  let sawAnyGame = false;
  for (const ref of idx.months) {
    const loaded = await loadMonthGames(username, ref, locale);
    if ('error' in loaded) return loaded.error;
    if (loaded.games.length > 0) sawAnyGame = true;
    const found = loaded.games.find((g) => g.id === id);
    if (found) {
      return jsonCached(
        { found: true, pgn: found.pgn, month: monthLabel(ref) },
        GAME_TTL_S,
        604800,
      );
    }
  }
  return apiError(
    404,
    'GAME_NOT_FOUND',
    locale,
    sawAnyGame ? 'errors.chesscomSearchNotFound' : 'errors.chesscomSearchEmpty',
  );
}

/** Game id → PGN via the public callback endpoint + moveList decoding.
 * Gated by CHESSCOM_CALLBACK_ENABLED (default off — see server/config). */
async function handleGame(query: ChesscomQuery, locale: Locale) {
  if (!chesscomCallbackEnabled()) {
    return apiError(503, 'NOT_CONFIGURED', locale, 'errors.notConfigured');
  }
  const id = query.id as string;
  const gameType = query.type;
  const cache = getServerCache();
  const key = `chesscom:game:${gameType}:${id}`;
  const hit = await cache.get<{ pgn: string }>(key);
  if (hit) return jsonCached(hit, GAME_TTL_S, 604800);

  let fetched: FetchResult;
  try {
    fetched = await fetchJson(
      `https://www.chess.com/callback/${gameType}/game/${encodeURIComponent(id)}`,
      CALLBACK_MAX_BYTES,
    );
  } catch (e) {
    return upstreamFailure(locale, e, false);
  }
  const { status, json } = fetched;
  if (status === 404) {
    return apiError(404, 'GAME_NOT_FOUND', locale, 'errors.chesscomGameNotFound');
  }
  if (status === 403) {
    return apiError(403, 'GAME_PRIVATE', locale, 'errors.chesscomGamePrivate');
  }
  if (status === 429) {
    return apiError(429, 'UPSTREAM_RATE_LIMITED', locale, 'errors.chesscomRateLimited');
  }
  if (status !== 200 || !json || typeof json !== 'object') {
    return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomGameFailed');
  }
  const game = (json as { game?: Record<string, unknown> }).game;
  if (!game) return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomUnexpected');

  const headers = (game.pgnHeaders ?? {}) as Record<string, string>;
  let pgn: string | undefined;

  if (typeof game.pgn === 'string' && game.pgn.includes('[Event')) {
    pgn = game.pgn;
  } else if (typeof game.moveList === 'string' && game.moveList.length > 0) {
    try {
      const ucis = decodeChessComMoveList(game.moveList);
      const chess = new Chess();
      const sans: string[] = [];
      for (const uci of ucis) {
        const mv = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci[4],
        });
        sans.push(mv.san);
      }
      const result = headers.Result ?? '*';
      const moveText: string[] = [];
      sans.forEach((san, i) => {
        if (i % 2 === 0) moveText.push(`${i / 2 + 1}.`);
        moveText.push(san);
      });
      moveText.push(result);
      const headerText = Object.entries(headers)
        .map(([k, v]) => `[${k} "${String(v).replace(/"/g, '')}"]`)
        .join('\n');
      pgn = `${headerText}\n\n${moveText.join(' ')}\n`;
    } catch {
      return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomDecodeFailed');
    }
  }

  if (!pgn) return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.chesscomNoMoves');
  const out = { pgn };
  await cache.set(key, out, GAME_TTL_S);
  return jsonCached(out, GAME_TTL_S, 604800);
}

/**
 * GET /api/chesscom?user={username}[&year=&month=] → { games }
 * GET /api/chesscom?id={id}&type=live|daily → { pgn } (flag-gated)
 *
 * All errors: { error: { code, message, retryable } } (Prompt 11 taxonomy).
 */
export async function GET(req: NextRequest) {
  const locale = detectLocale(req.nextUrl.searchParams.get('locale'));
  const limited = await rateLimitResponse(req);
  if (limited) return limited;

  const rawParams = searchParamsRecord(req.nextUrl.searchParams);
  if (!rawParams.user && !rawParams.id && !rawParams.op) {
    // Historical bad-request response when neither selector is present.
    return apiError(400, 'INVALID_INPUT', locale, 'errors.chesscomBadRequest', {
      username: '{username}',
      gameId: '{gameId}',
    });
  }
  const parsed = chesscomQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    const firstPath = parsed.error.issues[0]?.path[0];
    if (firstPath === 'id') {
      return apiError(400, 'INVALID_INPUT', locale, 'errors.chesscomBadId');
    }
    if (firstPath === 'user') {
      return apiError(400, 'INVALID_INPUT', locale, 'errors.chesscomBadUsername');
    }
    if (firstPath === 'month' || firstPath === 'year') {
      return apiError(400, 'INVALID_INPUT', locale, 'errors.chesscomBadRequest', {
        username: '{username}',
        gameId: '{gameId}',
      });
    }
    // Missing user+id keeps the historical bad-request message.
    return apiError(400, 'INVALID_INPUT', locale, 'errors.chesscomBadRequest', {
      username: '{username}',
      gameId: '{gameId}',
    });
  }
  try {
    if (parsed.data.op === 'archiveMonths') return await handleArchiveMonths(parsed.data, locale);
    if (parsed.data.op === 'searchArchives') return await handleSearchArchives(parsed.data, locale);
    if (parsed.data.user) return await handleUser(parsed.data, locale);
    return await handleGame(parsed.data, locale);
  } catch {
    return apiError(500, 'INTERNAL', locale, 'errors.internal');
  }
}
