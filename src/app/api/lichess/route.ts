import { NextRequest } from 'next/server';
import { lichessExportUrl, normalizeLichessPgn } from '@/parsers/lichess';
import { detectLocale, type Locale } from '@/i18n';
import { apiError } from '@/server/errors';
import { lichessQuerySchema, searchParamsRecord } from '@/server/validation';
import { fetchUpstream, UpstreamError } from '@/server/upstream';
import { getServerCache } from '@/server/cache';
import { jsonCached, rateLimitResponse } from '@/server/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'chess-review/1.0 (game review app)';

// A single exported game PGN is small; 2 MB is generous headroom while
// still bounding abuse (Prompt 11 size caps).
const LICHESS_EXPORT_MAX_BYTES = 2 * 1024 * 1024;
// A finished game never changes: medium-long server TTL + CDN s-maxage.
const GAME_TTL_S = 3600;

/**
 * GET /api/lichess?id={gameId} → { pgn } (spec 4.5).
 * All errors: { error: { code, message, retryable } } (Prompt 11 taxonomy).
 */
export async function GET(req: NextRequest) {
  const locale: Locale = detectLocale(req.nextUrl.searchParams.get('locale'));
  const limited = await rateLimitResponse(req);
  if (limited) return limited;

  const parsed = lichessQuerySchema.safeParse(searchParamsRecord(req.nextUrl.searchParams));
  if (!parsed.success) {
    return apiError(400, 'INVALID_INPUT', locale, 'errors.lichessBadId');
  }
  const id = parsed.data.id;

  const cache = getServerCache();
  const key = `lichess:game:${id}`;
  const hit = await cache.get<{ pgn: string }>(key);
  if (hit) return jsonCached(hit, GAME_TTL_S, 86400);

  try {
    // URL constructed by lichessExportUrl from the validated id; the host
    // is a constant and fetchUpstream re-asserts the allowlist.
    const upstream = await fetchUpstream(lichessExportUrl(id), {
      headers: { Accept: 'application/x-chess-pgn', 'User-Agent': UA },
      maxBytes: LICHESS_EXPORT_MAX_BYTES,
    });
    if (upstream.status === 404) {
      return apiError(404, 'GAME_NOT_FOUND', locale, 'errors.lichessNotFound');
    }
    if (upstream.status === 429) {
      return apiError(429, 'UPSTREAM_RATE_LIMITED', locale, 'errors.lichessRateLimited');
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.lichessUpstream', {
        status: upstream.status,
      });
    }
    const pgn = normalizeLichessPgn(upstream.text);
    if (!pgn || pgn.length < 10) {
      return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.lichessEmpty');
    }
    const out = { pgn };
    await cache.set(key, out, GAME_TTL_S);
    return jsonCached(out, GAME_TTL_S, 86400);
  } catch (e) {
    if (e instanceof UpstreamError) {
      if (e.kind === 'timeout') {
        return apiError(504, 'UPSTREAM_TIMEOUT', locale, 'errors.upstreamTimeout');
      }
      if (e.kind === 'too_large') {
        return apiError(502, 'RESPONSE_TOO_LARGE', locale, 'errors.responseTooLarge');
      }
    }
    return apiError(502, 'UPSTREAM_ERROR', locale, 'errors.lichessNetwork');
  }
}
