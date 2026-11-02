// Prompt 11: server module units — rate limiter, caches (memory + KV via
// mocked fetch), upstream fetcher, validation schemas, config flags.

import { describe, expect, it, vi } from 'vitest';
import {
  TokenBucketRateLimiter,
  KvTokenBucketRateLimiter,
  clientIp,
  getImportRateLimiter,
  setImportRateLimiterForTests,
} from '@/server/rateLimit';
import { InMemoryCacheAdapter, KvCacheAdapter, kvConfigFromEnv } from '@/server/cache';
import { fetchUpstream, UpstreamError, ALLOWED_UPSTREAM_HOSTS } from '@/server/upstream';
import { constructArchiveMonthUrl } from '@/server/chesscomUrls';
import { chesscomQuerySchema, lichessQuerySchema, searchParamsRecord } from '@/server/validation';
import { chesscomCallbackEnabled } from '@/server/config';
import { LOCALES } from '@/i18n';
import { localeSchema } from '@/server/validation';

describe('TokenBucketRateLimiter (burst 10, refill 0.5/s = 30/min)', () => {
  it('allows a burst of 10, then 429s with Retry-After until refill', async () => {
    let now = 1_000_000;
    const limiter = new TokenBucketRateLimiter({ now: () => now });
    for (let i = 0; i < 10; i += 1) {
      expect((await limiter.tryConsume('1.2.3.4')).allowed).toBe(true);
    }
    const blocked = await limiter.tryConsume('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    // One token needs 2 s at 0.5 tokens/s.
    expect(blocked.retryAfterSeconds).toBe(2);
    // Advancing the clock by 1 s is not enough…
    now += 1000;
    expect((await limiter.tryConsume('1.2.3.4')).allowed).toBe(false);
    // …but 2 s refills exactly one token.
    now += 1000;
    expect((await limiter.tryConsume('1.2.3.4')).allowed).toBe(true);
    expect((await limiter.tryConsume('1.2.3.4')).allowed).toBe(false);
  });

  it('sustains 30/min: after 60 s the bucket is full again (capacity-capped)', async () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter({ now: () => now });
    for (let i = 0; i < 10; i += 1) await limiter.tryConsume('k');
    now += 60_000;
    for (let i = 0; i < 10; i += 1) {
      expect((await limiter.tryConsume('k')).allowed).toBe(true);
    }
    expect((await limiter.tryConsume('k')).allowed).toBe(false);
  });

  it('buckets are per-key', async () => {
    const limiter = new TokenBucketRateLimiter();
    for (let i = 0; i < 10; i += 1) await limiter.tryConsume('a');
    expect((await limiter.tryConsume('a')).allowed).toBe(false);
    expect((await limiter.tryConsume('b')).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry, then x-real-ip, then fallback', () => {
    expect(
      clientIp(
        new Request('http://x/', {
          headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' },
        }),
      ),
    ).toBe('203.0.113.9');
    expect(clientIp(new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe(
      '198.51.100.2',
    );
    expect(clientIp(new Request('http://x/'))).toBe('unknown');
  });
});

describe('InMemoryCacheAdapter', () => {
  it('round-trips values and honours TTL via the injected clock', async () => {
    let now = 0;
    const cache = new InMemoryCacheAdapter({ now: () => now });
    await cache.set('k', { a: 1 }, 60);
    expect(await cache.get('k')).toEqual({ a: 1 });
    now = 59_999;
    expect(await cache.get('k')).toEqual({ a: 1 });
    now = 60_000;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('isolates stored values (JSON snapshot semantics)', async () => {
    const cache = new InMemoryCacheAdapter();
    const value = { list: [1] };
    await cache.set('k', value, 60);
    value.list.push(2);
    expect(await cache.get<{ list: number[] }>('k')).toEqual({ list: [1] });
  });
});

describe('KvCacheAdapter (mocked fetch, Upstash REST protocol)', () => {
  function kvFetch(handler: (args: unknown[]) => unknown) {
    const calls: { url: string; args: unknown[]; auth: string }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      calls.push({
        url: String(url),
        args,
        auth: String((init?.headers as Record<string, string>).Authorization),
      });
      return new Response(JSON.stringify({ result: handler(args) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    return { calls, fetchFn };
  }

  it('GET/SET round-trip with EX ttl and bearer auth', async () => {
    const store = new Map<string, string>();
    const { calls, fetchFn } = kvFetch((args) => {
      if (args[0] === 'GET') return store.get(String(args[1])) ?? null;
      if (args[0] === 'SET') {
        store.set(String(args[1]), String(args[2]));
        return 'OK';
      }
      return null;
    });
    const kv = new KvCacheAdapter({
      url: 'https://kv.example.com/',
      token: 'secret-token',
      fetchFn,
    });
    await kv.set('k', { a: 1 }, 120);
    expect(calls[0].args).toEqual(['SET', 'k', '{"a":1}', 'EX', 120]);
    expect(calls[0].auth).toBe('Bearer secret-token');
    expect(calls[0].url).toBe('https://kv.example.com');
    expect(await kv.get('k')).toEqual({ a: 1 });
    expect(await kv.get('missing')).toBeUndefined();
  });

  it('degrades to a miss on KV failure and never throws on set', async () => {
    const fetchFn = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const kv = new KvCacheAdapter({ url: 'https://kv.example.com', token: 't', fetchFn });
    expect(await kv.get('k')).toBeUndefined();
    await expect(kv.set('k', 1, 10)).resolves.toBeUndefined();
  });
});

describe('kvConfigFromEnv', () => {
  it('prefers KV_REST_API_* and falls back to UPSTASH_*; absent → null', () => {
    expect(kvConfigFromEnv({})).toBeNull();
    expect(kvConfigFromEnv({ KV_REST_API_URL: 'u' })).toBeNull();
    expect(kvConfigFromEnv({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toEqual({
      url: 'u',
      token: 't',
    });
    expect(
      kvConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'u2', UPSTASH_REDIS_REST_TOKEN: 't2' }),
    ).toEqual({ url: 'u2', token: 't2' });
  });
});

describe('fetchUpstream', () => {
  const noSleep = async () => {};

  it('allowlist contains exactly the three upstream hosts', () => {
    expect([...ALLOWED_UPSTREAM_HOSTS].sort()).toEqual([
      'api.chess.com',
      'lichess.org',
      'www.chess.com',
    ]);
  });

  it('rejects a non-allowlisted host before any fetch', async () => {
    const fetchFn = vi.fn(async () => new Response('{}'));
    await expect(
      fetchUpstream('https://evil.example.com/x', {
        maxBytes: 1024,
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'blocked_host' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects http: URLs (https only)', async () => {
    await expect(
      fetchUpstream('http://lichess.org/game/export/x', {
        maxBytes: 1024,
        fetchFn: (async () => new Response('')) as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'blocked_host' });
  });

  it('enforces the size cap via content-length', async () => {
    const fetchFn = (async () =>
      new Response('hello', {
        headers: { 'content-length': '999999' },
      })) as typeof fetch;
    await expect(
      fetchUpstream('https://lichess.org/game/export/x', {
        maxBytes: 100,
        fetchFn,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'too_large' });
  });

  it('enforces the size cap by streamed byte count (no content-length)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(64)));
        controller.enqueue(new TextEncoder().encode('x'.repeat(64)));
        controller.close();
      },
    });
    const fetchFn = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
    await expect(
      fetchUpstream('https://lichess.org/game/export/x', {
        maxBytes: 100,
        fetchFn,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'too_large' });
  });

  it('times out a hanging fetch via AbortController', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as typeof fetch;
    await expect(
      fetchUpstream('https://lichess.org/game/export/x', {
        maxBytes: 100,
        timeoutMs: 30,
        fetchFn,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('retries a network error once with jittered backoff, then succeeds', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const fetchFn = (async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('fetch failed');
      return new Response('ok', { status: 200 });
    }) as typeof fetch;
    const res = await fetchUpstream('https://lichess.org/game/export/x', {
      maxBytes: 100,
      fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([500]); // 300 + 0.5*400 jitter midpoint
  });

  it('never retries timeouts or blocked redirects', async () => {
    let attempts = 0;
    const fetchFn = (async () => {
      attempts += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example.com/' },
      });
    }) as typeof fetch;
    await expect(
      fetchUpstream('https://lichess.org/game/export/x', {
        maxBytes: 100,
        fetchFn,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'blocked_host' });
    expect(attempts).toBe(1);
  });

  it('follows a redirect to another allowlisted host', async () => {
    const fetchFn = (async (url: string) => {
      if (String(url).includes('lichess.org')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://api.chess.com/pub/player/x' },
        });
      }
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const res = await fetchUpstream('https://lichess.org/game/export/x', {
      maxBytes: 100,
      fetchFn,
      sleep: noSleep,
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('ok');
  });

  it('UpstreamError is an Error with a kind', () => {
    const e = new UpstreamError('timeout', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe('timeout');
  });
});

describe('constructArchiveMonthUrl', () => {
  it('rebuilds a well-formed entry', () => {
    expect(
      constructArchiveMonthUrl(
        'https://api.chess.com/pub/player/TestUser/games/2026/09',
        'testuser',
      ),
    ).toEqual({
      url: 'https://api.chess.com/pub/player/testuser/games/2026/09',
      year: 2026,
      month: 9,
    });
  });

  it('rejects evil hosts, other users, bad months and junk', () => {
    const bad: unknown[] = [
      'https://evil.example.com/pub/player/testuser/games/2026/09',
      'https://api.chess.com@evil.example.com/pub/player/testuser/games/2026/09',
      'https://api.chess.com/pub/player/otheruser/games/2026/09',
      'https://api.chess.com/pub/player/testuser/games/2026/13',
      'https://api.chess.com/pub/player/testuser/games/1999/09',
      'https://api.chess.com/pub/player/testuser/games/2026/09/extra',
      'http://api.chess.com/pub/player/testuser/games/2026/09',
      'not a url',
      42,
      null,
    ];
    for (const entry of bad) {
      expect(constructArchiveMonthUrl(entry, 'testuser')).toBeNull();
    }
  });
});

describe('validation schemas', () => {
  it('locale schema mirrors the i18n LOCALES list', () => {
    expect([...localeSchema.options]).toEqual([...LOCALES]);
  });

  it('chesscom query: accepts user / id forms, rejects the rest', () => {
    const rec = (s: string) => searchParamsRecord(new URLSearchParams(s));
    expect(chesscomQuerySchema.safeParse(rec('user=good_name-1')).success).toBe(true);
    expect(chesscomQuerySchema.safeParse(rec('id=123&type=daily')).success).toBe(true);
    expect(chesscomQuerySchema.safeParse(rec('')).success).toBe(false);
    expect(chesscomQuerySchema.safeParse(rec('user=a')).success).toBe(false); // too short
    expect(chesscomQuerySchema.safeParse(rec('user=-leading-dash')).success).toBe(false);
    expect(chesscomQuerySchema.safeParse(rec('id=12a3')).success).toBe(false);
  });

  it('lichess query: 8/12-char ids only', () => {
    const rec = (s: string) => searchParamsRecord(new URLSearchParams(s));
    expect(lichessQuerySchema.safeParse(rec('id=AbCdEfGh')).success).toBe(true);
    expect(lichessQuerySchema.safeParse(rec('id=AbCdEfGh1234')).success).toBe(true);
    expect(lichessQuerySchema.safeParse(rec('id=AbCdEfGh12345')).success).toBe(false);
    expect(lichessQuerySchema.safeParse(rec('id=AbCdEf!h')).success).toBe(false);
  });
});

describe('chesscomCallbackEnabled', () => {
  it('default off; "1"/"true" on; anything else off', () => {
    expect(chesscomCallbackEnabled({})).toBe(false);
    expect(chesscomCallbackEnabled({ CHESSCOM_CALLBACK_ENABLED: '1' })).toBe(true);
    expect(chesscomCallbackEnabled({ CHESSCOM_CALLBACK_ENABLED: 'true' })).toBe(true);
    expect(chesscomCallbackEnabled({ CHESSCOM_CALLBACK_ENABLED: 'yes' })).toBe(false);
  });
});

describe('KvTokenBucketRateLimiter (mocked fetch, EVAL token bucket)', () => {
  /**
   * In-memory emulation of the Lua bucket the limiter ships: parses the
   * EVAL command array and applies the same math (capacity/refill/now
   * arrive as ARGV). This mirrors the KvCacheAdapter test strategy — the
   * wire protocol and semantics are tested, the store itself is not.
   */
  function fakeKvFetch(store: Map<string, { tokens: number; updatedAt: number }>) {
    return vi.fn(async (_url: string, init: { body: string }) => {
      const cmd = JSON.parse(init.body) as string[];
      expect(cmd[0]).toBe('EVAL');
      const key = cmd[3];
      const capacity = Number(cmd[4]);
      const refill = Number(cmd[5]);
      const nowMs = Number(cmd[6]);
      const bucket = store.get(key) ?? { tokens: capacity, updatedAt: nowMs };
      const elapsed = Math.max(0, (nowMs - bucket.updatedAt) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refill);
      bucket.updatedAt = nowMs;
      let allowed = 0;
      let retryAfter = 0;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        allowed = 1;
      } else {
        retryAfter = Math.max(1, Math.ceil((1 - bucket.tokens) / refill));
      }
      store.set(key, bucket);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: [allowed, retryAfter, Math.floor(bucket.tokens)] }),
      } as Response;
    });
  }

  it('matches the in-memory bucket semantics: burst 10, block, refill', async () => {
    let now = 5_000_000;
    const store = new Map();
    const limiter = new KvTokenBucketRateLimiter({
      url: 'https://kv.example',
      token: 'secret',
      fetchFn: fakeKvFetch(store) as unknown as typeof fetch,
      now: () => now,
    });
    for (let i = 0; i < 10; i += 1) {
      expect((await limiter.tryConsume('9.9.9.9')).allowed).toBe(true);
    }
    const blocked = await limiter.tryConsume('9.9.9.9');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(2);
    now += 2000;
    expect((await limiter.tryConsume('9.9.9.9')).allowed).toBe(true);
    // A different key has its own bucket in the shared store.
    expect((await limiter.tryConsume('8.8.8.8')).allowed).toBe(true);
    expect(store.size).toBe(2);
  });

  it('fails OPEN with a logged warning when the store errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = new KvTokenBucketRateLimiter({
      url: 'https://kv.example',
      token: 'secret',
      fetchFn: (async () => {
        throw new Error('connection refused');
      }) as unknown as typeof fetch,
    });
    const result = await failing.tryConsume('1.1.1.1');
    expect(result.allowed).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[rate-limit] KV store unavailable'));
    warn.mockRestore();

    const httpFailing = new KvTokenBucketRateLimiter({
      url: 'https://kv.example',
      token: 'secret',
      fetchFn: (async () =>
        ({
          ok: false,
          status: 500,
          json: async () => ({}),
        }) as Response) as unknown as typeof fetch,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await httpFailing.tryConsume('1.1.1.1')).allowed).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('getImportRateLimiter (env selection)', () => {
  it('uses KV when the env is present, in-memory otherwise', () => {
    const originalUrl = process.env.KV_REST_API_URL;
    const originalToken = process.env.KV_REST_API_TOKEN;
    try {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      setImportRateLimiterForTests(undefined);
      expect(getImportRateLimiter()).toBeInstanceOf(TokenBucketRateLimiter);

      process.env.KV_REST_API_URL = 'https://kv.example';
      process.env.KV_REST_API_TOKEN = 'secret';
      setImportRateLimiterForTests(undefined);
      expect(getImportRateLimiter()).toBeInstanceOf(KvTokenBucketRateLimiter);
    } finally {
      if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = originalUrl;
      if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = originalToken;
      setImportRateLimiterForTests(undefined);
    }
  });
});
