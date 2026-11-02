// Round 2, Prompt 2: /api/chesscom archive search — official public API
// only. MSW-mocked upstreams; no username or PGN is ever logged by the
// route, so tests assert responses + upstream call patterns only.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GET } from '@/app/api/chesscom/route';
import { apiRequest, archiveGame, mswServer, readError, resetApiState } from './api-test-helpers';
import { setUpstreamFetchForTests } from '@/server/upstream';

const USER = 'testuser';
const INDEX_URL = `https://api.chess.com/pub/player/${USER}/games/archives`;
const TARGET_ID = '123456789';

function monthUrl(year: number, month: number): string {
  return `https://api.chess.com/pub/player/${USER}/games/${year}/${String(month).padStart(2, '0')}`;
}

/** Descending [year, month] pairs ending at (endYear, endMonth), n of them. */
function monthSeries(endYear: number, endMonth: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  let y = endYear;
  let m = endMonth;
  for (let i = 0; i < n; i += 1) {
    out.push([y, m]);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

let monthCalls: string[] = [];
let indexCalls = 0;
let lastUserAgent: string | null = null;

function useSearch(
  months: [number, number][],
  gamesByMonth: Record<string, Record<string, unknown>[]>,
) {
  monthCalls = [];
  mswServer.use(
    http.get(INDEX_URL, ({ request }) => {
      indexCalls += 1;
      lastUserAgent = request.headers.get('user-agent');
      return HttpResponse.json({ archives: months.map(([y, m]) => monthUrl(y, m)).reverse() });
    }),
    ...months.map(([y, m]) =>
      http.get(monthUrl(y, m), () => {
        monthCalls.push(`${y}-${String(m).padStart(2, '0')}`);
        return HttpResponse.json({ games: gamesByMonth[`${y}-${m}`] ?? [] });
      }),
    ),
  );
}

const searchPath = (extra = '') =>
  `/api/chesscom?op=searchArchives&user=${USER}&id=${TARGET_ID}&type=live${extra}`;

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
beforeEach(() => {
  resetApiState();
  monthCalls = [];
  indexCalls = 0;
  lastUserAgent = null;
});

describe('op=searchArchives (unscoped walk)', () => {
  it('matches in the current (newest) month and sends a descriptive User-Agent', async () => {
    const months = monthSeries(2026, 10, 3);
    useSearch(months, { '2026-10': [archiveGame()] });
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found: boolean; pgn: string; month: string };
    expect(body.found).toBe(true);
    expect(body.pgn).toContain('1. e4 e5');
    expect(body.month).toBe('2026-10');
    expect(monthCalls).toEqual(['2026-10']); // early stop on first match
    expect(lastUserAgent).toContain('chess-review');
  });

  it('matches 5 months back, walking newest-first and stopping there', async () => {
    const months = monthSeries(2026, 10, 8);
    useSearch(months, { '2026-5': [archiveGame()] });
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found: boolean; month: string };
    expect(body.found).toBe(true);
    expect(body.month).toBe('2026-05');
    expect(monthCalls).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  });

  it('handles daily games (/game/daily/<id>) the same way', async () => {
    const months = monthSeries(2026, 10, 2);
    useSearch(months, {
      '2026-10': [archiveGame({ url: 'https://www.chess.com/game/daily/123456789' })],
    });
    const res = await GET(
      apiRequest(`/api/chesscom?op=searchArchives&user=${USER}&id=${TARGET_ID}&type=daily`),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { found: boolean }).found).toBe(true);
  });

  it('not found after 12 months → 404 GAME_NOT_FOUND, only 12 months fetched', async () => {
    const months = monthSeries(2026, 10, 14);
    const games: Record<string, Record<string, unknown>[]> = {};
    for (const [y, m] of months) {
      games[`${y}-${m}`] = [archiveGame({ url: 'https://www.chess.com/game/live/999' })];
    }
    useSearch(months, games);
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(404);
    const body = await readError(res);
    expect(body.error.code).toBe('GAME_NOT_FOUND');
    expect(body.error.message).toContain('12');
    expect(monthCalls).toHaveLength(12);
  });

  it('empty archive index → 404 with the no-public-games message', async () => {
    useSearch([], {});
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(404);
    const body = await readError(res);
    expect(body.error.code).toBe('GAME_NOT_FOUND');
    expect(body.error.message).toContain('no public archived games');
    expect(monthCalls).toEqual([]);
  });

  it('months exist but hold no games (private/empty) → same empty message', async () => {
    const months = monthSeries(2026, 10, 3);
    useSearch(months, {});
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(404);
    expect((await readError(res)).error.message).toContain('no public archived games');
    expect(monthCalls).toHaveLength(3);
  });

  it('player 404 → USER_NOT_FOUND', async () => {
    mswServer.use(http.get(INDEX_URL, () => new HttpResponse(null, { status: 404 })));
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(404);
    expect((await readError(res)).error.code).toBe('USER_NOT_FOUND');
  });

  it('upstream 429 with Retry-After → 429 and the header is honored', async () => {
    const months = monthSeries(2026, 10, 1);
    mswServer.use(
      http.get(INDEX_URL, () =>
        HttpResponse.json({ archives: months.map(([y, m]) => monthUrl(y, m)) }),
      ),
      http.get(
        monthUrl(2026, 10),
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '42' } }),
      ),
    );
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect((await readError(res)).error.code).toBe('UPSTREAM_RATE_LIMITED');
  });

  it('upstream timeout → 504 UPSTREAM_TIMEOUT', async () => {
    setUpstreamFetchForTests((() => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    }) as typeof fetch);
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(504);
    expect((await readError(res)).error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('oversized monthly archive → 502 RESPONSE_TOO_LARGE', async () => {
    const months = monthSeries(2026, 10, 1);
    const big = 'x'.repeat(10 * 1024 * 1024 + 1);
    mswServer.use(
      http.get(INDEX_URL, () =>
        HttpResponse.json({ archives: months.map(([y, m]) => monthUrl(y, m)) }),
      ),
      http.get(
        monthUrl(2026, 10),
        () =>
          new HttpResponse(big, {
            status: 200,
            headers: { 'Content-Length': String(big.length) },
          }),
      ),
    );
    const res = await GET(apiRequest(searchPath()));
    expect(res.status).toBe(502);
    expect((await readError(res)).error.code).toBe('RESPONSE_TOO_LARGE');
  });

  it('hostile username → 400 INVALID_INPUT with zero upstream calls', async () => {
    useSearch(monthSeries(2026, 10, 1), { '2026-10': [archiveGame()] });
    const res = await GET(
      apiRequest(
        `/api/chesscom?op=searchArchives&user=${encodeURIComponent('../../etc/passwd')}&id=${TARGET_ID}`,
      ),
    );
    expect(res.status).toBe(400);
    expect((await readError(res)).error.code).toBe('INVALID_INPUT');
    expect(indexCalls).toBe(0);
    expect(monthCalls).toEqual([]);
  });

  it('non-numeric id for searchArchives → 400, zero upstream calls', async () => {
    useSearch(monthSeries(2026, 10, 1), { '2026-10': [archiveGame()] });
    const res = await GET(
      apiRequest(`/api/chesscom?op=searchArchives&user=${USER}&id=${encodeURIComponent('1;DROP')}`),
    );
    expect(res.status).toBe(400);
    expect(indexCalls).toBe(0);
  });

  it('second identical search is served from the month cache (no refetch)', async () => {
    const months = monthSeries(2026, 10, 2);
    useSearch(months, { '2026-9': [archiveGame()] });
    const first = await GET(apiRequest(searchPath()));
    expect(first.status).toBe(200);
    const callsAfterFirst = monthCalls.length;
    const second = await GET(apiRequest(searchPath()));
    expect(second.status).toBe(200);
    expect(monthCalls.length).toBe(callsAfterFirst);
  });
});

describe('op=searchArchives (scoped single month) + op=archiveMonths', () => {
  it('scoped miss is a 200 { found: false }, scoped hit returns the PGN', async () => {
    const months = monthSeries(2026, 10, 2);
    useSearch(months, { '2026-9': [archiveGame()] });
    const miss = await GET(apiRequest(searchPath('&year=2026&month=10')));
    expect(miss.status).toBe(200);
    expect(((await miss.json()) as { found: boolean }).found).toBe(false);
    const hit = await GET(apiRequest(searchPath('&year=2026&month=9')));
    expect(hit.status).toBe(200);
    const body = (await hit.json()) as { found: boolean; pgn: string; month: string };
    expect(body.found).toBe(true);
    expect(body.pgn).toContain('1. e4 e5');
    expect(body.month).toBe('2026-09');
  });

  it('archiveMonths returns at most 12 months, newest first', async () => {
    const months = monthSeries(2026, 10, 14);
    useSearch(months, {});
    const res = await GET(apiRequest(`/api/chesscom?op=archiveMonths&user=${USER}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { months: { year: number; month: number }[] };
    expect(body.months).toHaveLength(12);
    expect(body.months[0]).toEqual({ year: 2026, month: 10 });
    expect(body.months[11]).toEqual({ year: 2025, month: 11 });
  });
});
