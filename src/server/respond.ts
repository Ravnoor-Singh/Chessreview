// Shared route plumbing: rate limiting + success responses with
// Cache-Control (Prompt 11). Error responses use errors.ts.

import { NextResponse } from 'next/server';
import { apiError } from './errors';
import { clientIp, getImportRateLimiter, type RateLimiter } from './rateLimit';
import { detectLocale } from '@/i18n';

/**
 * Check the shared import rate limiter for this request. Returns a 429
 * taxonomy response (with Retry-After) when the bucket is empty, else
 * null. `limiter` is injectable for tests; by default the env-selected
 * shared limiter (KV-backed when configured, in-memory otherwise).
 */
export async function rateLimitResponse(
  req: Request,
  limiter: RateLimiter = getImportRateLimiter(),
): Promise<NextResponse | null> {
  const result = await limiter.tryConsume(clientIp(req));
  if (result.allowed) return null;
  const locale = detectLocale(new URL(req.url).searchParams.get('locale'));
  return apiError(429, 'RATE_LIMITED', locale, 'errors.rateLimited', undefined, {
    'Retry-After': String(result.retryAfterSeconds),
  });
}

/** JSON success with CDN cache headers (s-maxage + stale-while-revalidate). */
export function jsonCached(
  body: unknown,
  sMaxAgeSeconds: number,
  staleWhileRevalidateSeconds: number,
): NextResponse {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': `public, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
    },
  });
}
