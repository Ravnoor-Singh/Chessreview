// Shared helpers for the Prompt 11 API route tests (MSW-mocked upstreams).

import { NextRequest } from 'next/server';
import { setupServer } from 'msw/node';
import { importRateLimiter } from '@/server/rateLimit';
import { InMemoryCacheAdapter, setServerCacheForTests } from '@/server/cache';
import { setUpstreamFetchForTests } from '@/server/upstream';

export const mswServer = setupServer();

/** Reset all process-global API state between tests. */
export function resetApiState(): void {
  importRateLimiter.reset();
  setServerCacheForTests(new InMemoryCacheAdapter());
  setUpstreamFetchForTests(undefined);
  delete process.env.CHESSCOM_CALLBACK_ENABLED;
}

let ipCounter = 0;
/** A fresh client IP per call so the shared rate limiter never couples tests. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

export function apiRequest(path: string, ip?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': ip ?? freshIp() },
  });
}

export interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

export async function readError(res: Response): Promise<ErrorBody> {
  return (await res.json()) as ErrorBody;
}

/** A chess.com archive game object normalizeArchiveGame accepts. */
export function archiveGame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: 'https://www.chess.com/game/live/123456789',
    pgn: '[Event "Live Chess"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    end_time: 1761000000,
    time_class: 'blitz',
    rules: 'chess',
    white: { username: 'Alice', rating: 1500, result: 'win' },
    black: { username: 'Bob', rating: 1400, result: 'resigned' },
    ...overrides,
  };
}

export const SAMPLE_PGN =
  '[Event "Casual game"]\n[Site "Lichess"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n';
