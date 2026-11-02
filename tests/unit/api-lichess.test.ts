// Prompt 11: /api/lichess hardening — MSW-mocked upstreams.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GET } from '@/app/api/lichess/route';
import { apiRequest, mswServer, readError, resetApiState, SAMPLE_PGN } from './api-test-helpers';
import { setUpstreamFetchForTests } from '@/server/upstream';

const EXPORT_URL = 'https://lichess.org/game/export/AbCdEfGh';

let exportCalls = 0;

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
beforeEach(() => {
  resetApiState();
  exportCalls = 0;
});

describe('GET /api/lichess (success path preserved)', () => {
  it('returns the normalized PGN with medium CDN cache headers', async () => {
    mswServer.use(
      http.get(EXPORT_URL, () => {
        exportCalls += 1;
        return new HttpResponse(SAMPLE_PGN, {
          headers: { 'Content-Type': 'application/x-chess-pgn' },
        });
      }),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pgn: string };
    expect(body.pgn).toBe(SAMPLE_PGN);
    expect(res.headers.get('cache-control')).toContain('s-maxage=3600');
  });

  it('second identical request is served from the server cache', async () => {
    mswServer.use(
      http.get(EXPORT_URL, () => {
        exportCalls += 1;
        return new HttpResponse(SAMPLE_PGN);
      }),
    );
    const ip = '198.51.100.7';
    await GET(apiRequest('/api/lichess?id=AbCdEfGh', ip));
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh', ip));
    expect(res.status).toBe(200);
    expect(exportCalls).toBe(1);
  });

  it('accepts 12-char ids', async () => {
    mswServer.use(
      http.get('https://lichess.org/game/export/AbCdEfGh1234', () => new HttpResponse(SAMPLE_PGN)),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh1234'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/lichess error taxonomy', () => {
  it('404 → GAME_NOT_FOUND, not retryable', async () => {
    mswServer.use(http.get(EXPORT_URL, () => new HttpResponse(null, { status: 404 })));
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(404);
    const body = await readError(res);
    expect(body.error.code).toBe('GAME_NOT_FOUND');
    expect(body.error.retryable).toBe(false);
    expect(body.error.message).toContain('Lichess game not found');
  });

  it('429 → UPSTREAM_RATE_LIMITED', async () => {
    mswServer.use(http.get(EXPORT_URL, () => new HttpResponse(null, { status: 429 })));
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(429);
    expect((await readError(res)).error.code).toBe('UPSTREAM_RATE_LIMITED');
  });

  it('500 then success → retried once and succeeds', async () => {
    let attempts = 0;
    mswServer.use(
      http.get(EXPORT_URL, () => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 500 });
        return new HttpResponse(SAMPLE_PGN);
      }),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('500 twice → 502 UPSTREAM_ERROR', async () => {
    let attempts = 0;
    mswServer.use(
      http.get(EXPORT_URL, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(502);
    const body = await readError(res);
    expect(body.error.code).toBe('UPSTREAM_ERROR');
    expect(body.error.retryable).toBe(true);
    expect(attempts).toBe(2);
  });

  it('400 from upstream is NOT retried → 502 UPSTREAM_ERROR after 1 attempt', async () => {
    let attempts = 0;
    mswServer.use(
      http.get(EXPORT_URL, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 400 });
      }),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(502);
    expect(attempts).toBe(1);
  });

  it('timeout → 504 UPSTREAM_TIMEOUT', async () => {
    setUpstreamFetchForTests((() => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    }) as typeof fetch);
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(504);
    expect((await readError(res)).error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('oversized body → RESPONSE_TOO_LARGE', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024 + 1);
    mswServer.use(
      http.get(
        EXPORT_URL,
        () =>
          new HttpResponse(big, {
            headers: { 'Content-Length': String(big.length) },
          }),
      ),
    );
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(502);
    expect((await readError(res)).error.code).toBe('RESPONSE_TOO_LARGE');
  });

  it('empty export → UPSTREAM_ERROR with the historical empty message', async () => {
    mswServer.use(http.get(EXPORT_URL, () => new HttpResponse('')));
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh'));
    expect(res.status).toBe(502);
    const body = await readError(res);
    expect(body.error.code).toBe('UPSTREAM_ERROR');
    expect(body.error.message).toContain('empty game');
  });

  it('localized message via ?locale= (es)', async () => {
    mswServer.use(http.get(EXPORT_URL, () => new HttpResponse(null, { status: 404 })));
    const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh&locale=es'));
    const body = await readError(res);
    expect(body.error.message).toContain('no encontrada');
  });
});

describe('GET /api/lichess rate limiting (route level)', () => {
  it('burst of 10 passes, the 11th is 429 RATE_LIMITED with Retry-After', async () => {
    mswServer.use(
      http.get(EXPORT_URL, () => {
        exportCalls += 1;
        return new HttpResponse(SAMPLE_PGN);
      }),
    );
    const ip = '192.0.2.55';
    // The limiter runs before validation/cache, so repeated requests from
    // one IP count even when later ones would be cache hits.
    for (let i = 0; i < 10; i += 1) {
      const res = await GET(apiRequest('/api/lichess?id=AbCdEfGh', ip));
      expect(res.status).toBe(200);
    }
    const blocked = await GET(apiRequest('/api/lichess?id=AbCdEfGh', ip));
    expect(blocked.status).toBe(429);
    const body = await readError(blocked);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryable).toBe(true);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    // A different client IP is unaffected.
    const other = await GET(apiRequest('/api/lichess?id=AbCdEfGh', '192.0.2.56'));
    expect(other.status).toBe(200);
  });
});

describe('GET /api/lichess validation fuzz → 400 INVALID_INPUT, zero upstream calls', () => {
  const hostile: [string, string][] = [
    ['too short', '/api/lichess?id=abc'],
    ['too long', '/api/lichess?id=' + 'a'.repeat(10_000)],
    ['path traversal', '/api/lichess?id=' + encodeURIComponent('../../etc')],
    ['sql-ish', '/api/lichess?id=' + encodeURIComponent("' OR 1=1 --")],
    ['unicode', '/api/lichess?id=' + encodeURIComponent('ü♞ü♞ü♞ü♞')],
    ['missing id', '/api/lichess'],
    [
      'url instead of id',
      '/api/lichess?id=' + encodeURIComponent('https://evil.example.com/AbCdEfGh'),
    ],
    ['bad locale', '/api/lichess?id=AbCdEfGh&locale=fr'],
  ];
  for (const [name, path] of hostile) {
    it(name, async () => {
      mswServer.use(
        http.get(EXPORT_URL, () => {
          exportCalls += 1;
          return new HttpResponse(SAMPLE_PGN);
        }),
      );
      const res = await GET(apiRequest(path));
      expect(res.status).toBe(400);
      const body = await readError(res);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.retryable).toBe(false);
      expect(exportCalls).toBe(0);
    });
  }

  it('bad id keeps the historical message', async () => {
    const res = await GET(apiRequest('/api/lichess?id=nope'));
    expect((await readError(res)).error.message).toBe('That does not look like a Lichess game id.');
  });
});
