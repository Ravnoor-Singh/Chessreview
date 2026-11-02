// Prompt 11: /api/chesscom hardening — MSW-mocked upstreams.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GET } from '@/app/api/chesscom/route';
import {
  apiRequest,
  archiveGame,
  freshIp,
  mswServer,
  readError,
  resetApiState,
} from './api-test-helpers';
import { setUpstreamFetchForTests } from '@/server/upstream';

const ARCHIVES_URL = 'https://api.chess.com/pub/player/testuser/games/archives';
const MONTH_10 = 'https://api.chess.com/pub/player/testuser/games/2026/10';
const MONTH_09 = 'https://api.chess.com/pub/player/testuser/games/2026/09';

let upstreamCalls: string[] = [];

function useArchives(monthGames: Record<string, unknown>[] = [archiveGame()]) {
  mswServer.use(
    http.get(ARCHIVES_URL, () => {
      upstreamCalls.push('archives');
      return HttpResponse.json({ archives: [MONTH_09, MONTH_10] });
    }),
    http.get(MONTH_10, () => {
      upstreamCalls.push('month10');
      return HttpResponse.json({ games: monthGames });
    }),
    http.get(MONTH_09, () => {
      upstreamCalls.push('month09');
      return HttpResponse.json({ games: [] });
    }),
  );
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
beforeEach(() => {
  resetApiState();
  upstreamCalls = [];
});

describe('GET /api/chesscom?user= (success path preserved)', () => {
  it('returns normalized recent games with CDN cache headers', async () => {
    useArchives();
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { games: { white: string }[] };
    expect(body.games).toHaveLength(1);
    expect(body.games[0].white).toBe('Alice');
    expect(res.headers.get('cache-control')).toContain('s-maxage=');
    expect(res.headers.get('cache-control')).toContain('stale-while-revalidate=');
    expect(upstreamCalls).toEqual(['archives', 'month10', 'month09']);
  });

  it('serves the second identical request from the server cache', async () => {
    useArchives();
    const ip = freshIp();
    const first = await GET(apiRequest('/api/chesscom?user=testuser', ip));
    expect(first.status).toBe(200);
    const callsAfterFirst = upstreamCalls.length;
    const second = await GET(apiRequest('/api/chesscom?user=testuser', ip));
    expect(second.status).toBe(200);
    expect(upstreamCalls.length).toBe(callsAfterFirst);
    const body = (await second.json()) as { games: unknown[] };
    expect(body.games).toHaveLength(1);
  });

  it('explicit ?year=&month= reads exactly that constructed month', async () => {
    useArchives();
    const res = await GET(apiRequest('/api/chesscom?user=testuser&year=2026&month=9'));
    expect(res.status).toBe(200);
    expect(upstreamCalls).toEqual(['archives', 'month09']);
    // Past month only → long s-maxage.
    expect(res.headers.get('cache-control')).toContain('s-maxage=3600');
  });

  it('404 user → USER_NOT_FOUND (localized message)', async () => {
    mswServer.use(http.get(ARCHIVES_URL, () => new HttpResponse(null, { status: 404 })));
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(404);
    const body = await readError(res);
    expect(body.error.code).toBe('USER_NOT_FOUND');
    expect(body.error.retryable).toBe(false);
    expect(body.error.message).toContain('testuser');
  });

  it('upstream 429 → UPSTREAM_RATE_LIMITED', async () => {
    mswServer.use(http.get(ARCHIVES_URL, () => new HttpResponse(null, { status: 429 })));
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(429);
    expect((await readError(res)).error.code).toBe('UPSTREAM_RATE_LIMITED');
  });

  it('upstream 500 then success → retried once and succeeds', async () => {
    let attempts = 0;
    mswServer.use(
      http.get(ARCHIVES_URL, () => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({ archives: [] });
      }),
    );
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
    expect(((await res.json()) as { games: unknown[] }).games).toEqual([]);
  });

  it('upstream 500 twice → UPSTREAM_ERROR', async () => {
    let attempts = 0;
    mswServer.use(
      http.get(ARCHIVES_URL, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(502);
    const body = await readError(res);
    expect(body.error.code).toBe('UPSTREAM_ERROR');
    expect(body.error.retryable).toBe(true);
    expect(attempts).toBe(2);
  });

  it('upstream timeout (abort) → 504 UPSTREAM_TIMEOUT', async () => {
    setUpstreamFetchForTests((() => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    }) as typeof fetch);
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(504);
    const body = await readError(res);
    expect(body.error.code).toBe('UPSTREAM_TIMEOUT');
    expect(body.error.retryable).toBe(true);
  });

  it('oversized archives index → RESPONSE_TOO_LARGE', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024 + 1);
    mswServer.use(
      http.get(
        ARCHIVES_URL,
        () =>
          new HttpResponse(big, {
            status: 200,
            headers: { 'Content-Length': String(big.length) },
          }),
      ),
    );
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(502);
    expect((await readError(res)).error.code).toBe('RESPONSE_TOO_LARGE');
  });

  it('archive entries pointing at evil hosts are never fetched', async () => {
    mswServer.use(
      http.get(ARCHIVES_URL, () =>
        HttpResponse.json({
          archives: [
            'https://evil.example.com/pub/player/testuser/games/2026/10',
            'https://api.chess.com@evil.example.com/pub/player/testuser/games/2026/10',
            MONTH_10,
          ],
        }),
      ),
      http.get(MONTH_10, () => {
        upstreamCalls.push('month10');
        return HttpResponse.json({ games: [archiveGame()] });
      }),
      // If the evil host were fetched, MSW would need a handler; the
      // onUnhandledRequest:'error' listener would also fail the test.
      http.get('https://evil.example.com/*', () => {
        upstreamCalls.push('EVIL');
        return HttpResponse.json({ games: [] });
      }),
    );
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(200);
    expect(upstreamCalls).not.toContain('EVIL');
    expect(upstreamCalls).toContain('month10');
  });

  it('non-JSON upstream body → clean UPSTREAM_ERROR (no crash)', async () => {
    mswServer.use(
      http.get(ARCHIVES_URL, () => new HttpResponse('<html>oops</html>', { status: 200 })),
    );
    const res = await GET(apiRequest('/api/chesscom?user=testuser'));
    expect(res.status).toBe(502);
    expect((await readError(res)).error.code).toBe('UPSTREAM_ERROR');
  });
});

describe('GET /api/chesscom validation fuzz → 400 INVALID_INPUT, zero upstream calls', () => {
  const hostile: [string, string][] = [
    ['sql-ish username', '/api/chesscom?user=' + encodeURIComponent("x' OR '1'='1")],
    ['path traversal username', '/api/chesscom?user=' + encodeURIComponent('../../etc/passwd')],
    ['dot-dot id', '/api/chesscom?id=' + encodeURIComponent('../123')],
    ['sql-ish id', '/api/chesscom?id=' + encodeURIComponent('1;DROP TABLE games')],
    ['unicode username', '/api/chesscom?user=' + encodeURIComponent('üser♞name')],
    ['10k-char username', '/api/chesscom?user=' + 'a'.repeat(10_000)],
    ['10k-char id', '/api/chesscom?id=' + '1'.repeat(10_000)],
    ['negative month', '/api/chesscom?user=testuser&year=2026&month=-1'],
    ['month 13', '/api/chesscom?user=testuser&year=2026&month=13'],
    ['year 1900', '/api/chesscom?user=testuser&year=1900&month=5'],
    ['year without month', '/api/chesscom?user=testuser&year=2026'],
    ['bad type', '/api/chesscom?id=123&type=' + encodeURIComponent('rapid/../../')],
    ['bad locale', '/api/chesscom?user=testuser&locale=xx'],
    ['empty everything', '/api/chesscom'],
    ['url as username', '/api/chesscom?user=' + encodeURIComponent('https://evil.example.com/x')],
  ];
  for (const [name, path] of hostile) {
    it(name, async () => {
      useArchives();
      const res = await GET(apiRequest(path));
      expect(res.status).toBe(400);
      const body = await readError(res);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.retryable).toBe(false);
      expect(upstreamCalls).toEqual([]);
    });
  }

  it('missing params keep the historical bad-request message', async () => {
    const res = await GET(apiRequest('/api/chesscom'));
    expect(res.status).toBe(400);
    expect((await readError(res)).error.message).toBe('Pass ?user={username} or ?id={gameId}.');
  });

  it('bad id keeps the historical message', async () => {
    const res = await GET(apiRequest('/api/chesscom?id=abc'));
    expect(res.status).toBe(400);
    expect((await readError(res)).error.message).toBe('That chess.com game id looks wrong.');
  });
});

describe('GET /api/chesscom?id= callback flag (CHESSCOM_CALLBACK_ENABLED)', () => {
  const CALLBACK_URL = 'https://www.chess.com/callback/live/game/123456789';

  it('default off → 503 NOT_CONFIGURED, no upstream call', async () => {
    let called = false;
    mswServer.use(
      http.get(CALLBACK_URL, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const res = await GET(apiRequest('/api/chesscom?id=123456789&type=live'));
    expect(res.status).toBe(503);
    const body = await readError(res);
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(called).toBe(false);
  });

  it('enabled → returns the game PGN (callback path preserved)', async () => {
    process.env.CHESSCOM_CALLBACK_ENABLED = '1';
    mswServer.use(
      http.get(CALLBACK_URL, () =>
        HttpResponse.json({
          game: {
            pgn: '[Event "Live Chess"]\n\n1. e4 e5 1-0',
            pgnHeaders: { Event: 'Live Chess', Result: '1-0' },
          },
        }),
      ),
    );
    const res = await GET(apiRequest('/api/chesscom?id=123456789&type=live'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pgn: string };
    expect(body.pgn).toContain('[Event "Live Chess"]');
    // Finished game → long CDN cache.
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
  });

  it('enabled + upstream redirect to an evil host → blocked (UPSTREAM_ERROR)', async () => {
    process.env.CHESSCOM_CALLBACK_ENABLED = '1';
    let evilCalled = false;
    mswServer.use(
      http.get(
        CALLBACK_URL,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: 'https://evil.example.com/steal' },
          }),
      ),
      http.get('https://evil.example.com/steal', () => {
        evilCalled = true;
        return HttpResponse.json({ game: {} });
      }),
    );
    const res = await GET(apiRequest('/api/chesscom?id=123456789&type=live'));
    expect(res.status).toBe(502);
    expect((await readError(res)).error.code).toBe('UPSTREAM_ERROR');
    expect(evilCalled).toBe(false);
  });

  it('enabled + upstream 404 → GAME_NOT_FOUND', async () => {
    process.env.CHESSCOM_CALLBACK_ENABLED = '1';
    mswServer.use(http.get(CALLBACK_URL, () => new HttpResponse(null, { status: 404 })));
    const res = await GET(apiRequest('/api/chesscom?id=123456789&type=live'));
    expect(res.status).toBe(404);
    expect((await readError(res)).error.code).toBe('GAME_NOT_FOUND');
  });
});
