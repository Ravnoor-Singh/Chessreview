// Error taxonomy for the import API routes (Prompt 11).
//
// Every error response from /api/chesscom and /api/lichess is JSON:
//   { error: { code, message, retryable } }
// `code` is stable and machine-readable — clients must branch on it, never
// on `message`. `message` is human-facing and localized through the
// existing i18n catalogue via the request's ?locale= parameter (the map
// below is the single code → catalogue-key table). `retryable` tells the
// client whether retrying (possibly via a fallback path) can succeed.

import { NextResponse } from 'next/server';
import { t, type Locale, type MessageKey } from '@/i18n';

export const ERROR_CODES = [
  'INVALID_INPUT',
  'USER_NOT_FOUND',
  'GAME_NOT_FOUND',
  'GAME_PRIVATE',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'UPSTREAM_RATE_LIMITED',
  'RESPONSE_TOO_LARGE',
  'RATE_LIMITED',
  'NOT_CONFIGURED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes for which a retry (immediately or via a fallback) may succeed. */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'UPSTREAM_RATE_LIMITED',
  'RATE_LIMITED',
  'INTERNAL',
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; retryable: boolean };
}

export function apiErrorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message, retryable: isRetryable(code) } };
}

/**
 * Build a taxonomy error response. `messageKey` must be a catalogue key;
 * the chess.com bad-request key needs its literal {username}/{gameId}
 * placeholders preserved, exactly as the pre-Prompt-11 route passed them.
 */
export function apiError(
  status: number,
  code: ErrorCode,
  locale: Locale,
  messageKey: MessageKey,
  params?: Record<string, string | number>,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(apiErrorBody(code, t(locale, messageKey, params)), {
    status,
    headers,
  });
}
