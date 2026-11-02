// Client-side import API helpers (Prompt 11).
//
// Talks to /api/chesscom and /api/lichess and understands the Prompt 11
// error taxonomy: { error: { code, message, retryable } }. Callers branch
// on `code` / `retryable`, never on message text (the message is already
// localized by the server via the locale parameter).
//
// Lichess fallback: when the proxy route fails with a RETRYABLE error,
// the importer retries DIRECTLY against lichess.org (which serves CORS)
// through the exact same PGN parsing path (normalizeLichessPgn). A
// non-retryable failure (400/404/…) never falls back — the game does not
// exist or the id is invalid, and a direct call would fail the same way.

import { lichessExportUrl, normalizeLichessPgn } from '@/parsers/lichess';
import type { ImportedGameSummary } from '@/lib/types';

export interface ApiErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
  status: number;
}

export class ImportApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ImportApiError';
    this.code = info.code;
    this.retryable = info.retryable;
    this.status = info.status;
  }
}

/** Parse a taxonomy error body; tolerant of a malformed/non-JSON body. */
export async function readApiError(res: Response): Promise<ApiErrorInfo> {
  let message = `HTTP ${res.status}`;
  let code = 'INTERNAL';
  let retryable = res.status >= 500;
  try {
    const data = (await res.json()) as {
      error?: { code?: unknown; message?: unknown; retryable?: unknown };
    };
    if (data && typeof data === 'object' && data.error) {
      if (typeof data.error.code === 'string') code = data.error.code;
      if (typeof data.error.message === 'string' && data.error.message) {
        message = data.error.message;
      }
      if (typeof data.error.retryable === 'boolean') retryable = data.error.retryable;
    }
  } catch {
    // Non-JSON error body: keep the HTTP-derived defaults above.
  }
  return { code, message, retryable, status: res.status };
}

async function fetchJsonOrThrow<T>(
  url: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetchFn(url, signal ? { signal } : undefined);
  if (!res.ok) throw new ImportApiError(await readApiError(res));
  return (await res.json()) as T;
}

/** localStorage key for the last chess.com username used in a successful
 * link import (Round 2, Prompt 2) — stored only on this device. */
export const CHESSCOM_USERNAME_STORAGE_KEY = 'chess-review:chesscom-username';

export interface ChesscomArchiveMonth {
  year: number;
  month: number;
}

/** The player's archive months (newest first, max 12) via the official
 * public API proxy — used to drive the month-by-month search progress. */
export async function getChesscomArchiveMonths(
  username: string,
  locale: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ChesscomArchiveMonth[]> {
  const data = await fetchJsonOrThrow<{ months?: ChesscomArchiveMonth[] }>(
    `/api/chesscom?op=archiveMonths&user=${encodeURIComponent(username)}&locale=${locale}`,
    fetchFn,
    signal,
  );
  return data.months ?? [];
}

/** Search ONE archive month for a game id. A miss is a normal result
 * ({ found: false }), not an error, so callers can walk months with
 * progress + cancel. */
export async function searchChesscomArchiveMonth(
  username: string,
  id: string,
  gameType: 'live' | 'daily',
  year: number,
  month: number,
  locale: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ found: boolean; pgn?: string }> {
  const data = await fetchJsonOrThrow<{ found?: boolean; pgn?: string }>(
    `/api/chesscom?op=searchArchives&user=${encodeURIComponent(username)}&id=${encodeURIComponent(id)}&type=${gameType}&year=${year}&month=${month}&locale=${locale}`,
    fetchFn,
    signal,
  );
  return { found: !!data.found, pgn: data.pgn };
}

/** Search up to 12 archive months server-side in one request (the
 * non-interactive form of the same operation). */
export async function searchChesscomArchives(
  username: string,
  id: string,
  gameType: 'live' | 'daily',
  locale: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ pgn: string }> {
  const data = await fetchJsonOrThrow<{ pgn?: string }>(
    `/api/chesscom?op=searchArchives&user=${encodeURIComponent(username)}&id=${encodeURIComponent(id)}&type=${gameType}&locale=${locale}`,
    fetchFn,
    signal,
  );
  if (!data.pgn) {
    throw new ImportApiError({
      code: 'GAME_NOT_FOUND',
      message: 'Chess.com archive search found no game.',
      retryable: false,
      status: 404,
    });
  }
  return { pgn: data.pgn };
}

export async function importChesscomGame(
  id: string,
  gameType: 'live' | 'daily',
  locale: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ pgn: string }> {
  const data = await fetchJsonOrThrow<{ pgn?: string }>(
    `/api/chesscom?id=${encodeURIComponent(id)}&type=${gameType}&locale=${locale}`,
    fetchFn,
  );
  if (!data.pgn) {
    throw new ImportApiError({
      code: 'UPSTREAM_ERROR',
      message: 'Chess.com import failed.',
      retryable: true,
      status: 502,
    });
  }
  return { pgn: data.pgn };
}

export async function importChesscomUserGames(
  username: string,
  locale: string,
  fetchFn: typeof fetch = fetch,
): Promise<ImportedGameSummary[]> {
  const data = await fetchJsonOrThrow<{ games?: ImportedGameSummary[] }>(
    `/api/chesscom?user=${encodeURIComponent(username)}&locale=${locale}`,
    fetchFn,
  );
  return data.games ?? [];
}

/**
 * Direct-to-Lichess export (CORS-enabled) — the fallback path, and a
 * useful standalone. Uses the same URL builder + PGN normalization as the
 * proxy route.
 */
export async function fetchLichessPgnDirect(
  gameId: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(lichessExportUrl(gameId), {
      headers: { Accept: 'application/x-chess-pgn' },
    });
  } catch (e) {
    throw new ImportApiError({
      code: 'UPSTREAM_ERROR',
      message: e instanceof Error ? e.message : 'Could not reach Lichess.',
      retryable: true,
      status: 502,
    });
  }
  if (!res.ok) {
    throw new ImportApiError({
      code: res.status === 404 ? 'GAME_NOT_FOUND' : 'UPSTREAM_ERROR',
      message: `Lichess returned ${res.status}.`,
      retryable: res.status >= 500 || res.status === 429,
      status: res.status,
    });
  }
  const pgn = normalizeLichessPgn(await res.text());
  if (!pgn || pgn.length < 10) {
    throw new ImportApiError({
      code: 'UPSTREAM_ERROR',
      message: 'Lichess returned an empty game.',
      retryable: true,
      status: 502,
    });
  }
  return pgn;
}

/**
 * Lichess import via the proxy, with a direct fallback on retryable
 * proxy failures only.
 */
export async function importLichessGame(
  gameId: string,
  locale: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ pgn: string }> {
  try {
    const data = await fetchJsonOrThrow<{ pgn?: string }>(
      `/api/lichess?id=${encodeURIComponent(gameId)}&locale=${locale}`,
      fetchFn,
    );
    if (!data.pgn) {
      throw new ImportApiError({
        code: 'UPSTREAM_ERROR',
        message: 'Lichess import failed.',
        retryable: true,
        status: 502,
      });
    }
    return { pgn: data.pgn };
  } catch (e) {
    if (e instanceof ImportApiError && e.retryable) {
      return { pgn: await fetchLichessPgnDirect(gameId, fetchFn) };
    }
    throw e;
  }
}
