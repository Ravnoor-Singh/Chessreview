// Prompt 11: client import helpers — taxonomy reading + Lichess direct
// fallback (engages on retryable proxy failure, never on 400/404).

import { describe, expect, it, vi } from 'vitest';
import {
  ImportApiError,
  importChesscomGame,
  importLichessGame,
  readApiError,
} from '@/lib/importApi';
import { SAMPLE_PGN } from './api-test-helpers';

function taxonomyResponse(status: number, code: string, retryable: boolean): Response {
  return new Response(JSON.stringify({ error: { code, message: `msg-${code}`, retryable } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readApiError', () => {
  it('reads the taxonomy shape', async () => {
    const info = await readApiError(taxonomyResponse(502, 'UPSTREAM_ERROR', true));
    expect(info).toEqual({
      code: 'UPSTREAM_ERROR',
      message: 'msg-UPSTREAM_ERROR',
      retryable: true,
      status: 502,
    });
  });

  it('survives a non-JSON body', async () => {
    const info = await readApiError(new Response('<html>', { status: 500 }));
    expect(info.code).toBe('INTERNAL');
    expect(info.retryable).toBe(true);
  });
});

describe('importLichessGame fallback', () => {
  it('falls back DIRECTLY to lichess.org on a retryable proxy 502', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(String(url));
      if (String(url).startsWith('/api/lichess')) {
        return taxonomyResponse(502, 'UPSTREAM_ERROR', true);
      }
      return new Response(SAMPLE_PGN, { status: 200 });
    }) as typeof fetch;
    const out = await importLichessGame('AbCdEfGh', 'en', fetchFn);
    expect(out.pgn).toBe(SAMPLE_PGN);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/api/lichess');
    expect(urls[1]).toContain('https://lichess.org/game/export/AbCdEfGh');
  });

  it('falls back on proxy 429 (UPSTREAM_RATE_LIMITED, retryable)', async () => {
    const fetchFn = (async (url: string) => {
      if (String(url).startsWith('/api/lichess')) {
        return taxonomyResponse(429, 'UPSTREAM_RATE_LIMITED', true);
      }
      return new Response(SAMPLE_PGN, { status: 200 });
    }) as typeof fetch;
    const out = await importLichessGame('AbCdEfGh', 'en', fetchFn);
    expect(out.pgn).toBe(SAMPLE_PGN);
  });

  it('does NOT fall back on a proxy 400 (INVALID_INPUT)', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/lichess')) {
        return taxonomyResponse(400, 'INVALID_INPUT', false);
      }
      return new Response(SAMPLE_PGN, { status: 200 });
    }) as unknown as typeof fetch;
    await expect(importLichessGame('bad', 'en', fetchFn)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(vi.mocked(fetchFn).mock.calls).toHaveLength(1);
  });

  it('does NOT fall back on a proxy 404 (GAME_NOT_FOUND)', async () => {
    let calls = 0;
    const fetchFn = (async (url: string) => {
      calls += 1;
      if (String(url).startsWith('/api/lichess')) {
        return taxonomyResponse(404, 'GAME_NOT_FOUND', false);
      }
      return new Response(SAMPLE_PGN, { status: 200 });
    }) as typeof fetch;
    await expect(importLichessGame('AbCdEfGh', 'en', fetchFn)).rejects.toMatchObject({
      code: 'GAME_NOT_FOUND',
    });
    expect(calls).toBe(1);
  });

  it('proxy success → no direct call', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ pgn: SAMPLE_PGN }), { status: 200 });
    }) as typeof fetch;
    const out = await importLichessGame('AbCdEfGh', 'en', fetchFn);
    expect(out.pgn).toBe(SAMPLE_PGN);
    expect(calls).toBe(1);
  });
});

describe('importChesscomGame', () => {
  it('returns the PGN on success', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ pgn: SAMPLE_PGN }), { status: 200 })) as typeof fetch;
    const out = await importChesscomGame('123', 'live', 'en', fetchFn);
    expect(out.pgn).toBe(SAMPLE_PGN);
  });

  it('throws ImportApiError carrying the taxonomy code (NOT_CONFIGURED)', async () => {
    const fetchFn = (async () => taxonomyResponse(503, 'NOT_CONFIGURED', false)) as typeof fetch;
    const err = await importChesscomGame('123', 'live', 'en', fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportApiError);
    expect((err as ImportApiError).code).toBe('NOT_CONFIGURED');
    expect((err as ImportApiError).retryable).toBe(false);
  });
});
