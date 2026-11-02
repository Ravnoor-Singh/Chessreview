// Zod validation for the import API routes (Prompt 11).
//
// ALL client input to /api/chesscom and /api/lichess goes through these
// schemas before anything else happens. Upstream URLs are CONSTRUCTED
// from the validated parts in the route modules — no client string is
// ever interpolated into an upstream URL unvalidated, and no client
// input can influence the upstream host (the host comes from constants,
// additionally enforced by the allowlist in upstream.ts).

import { z } from 'zod';

/**
 * Chess.com usernames: 2–25 chars, letters/digits/underscore/hyphen,
 * must start with a letter or digit (chess.com signup rules).
 */
export const chesscomUsernameSchema = z
  .string()
  .min(2)
  .max(25)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'invalid chess.com username');

/** Lichess usernames: 2–30 chars, same alphabet (validated, though the
 * current lichess route only takes game ids — kept for symmetry/future). */
export const lichessUsernameSchema = z
  .string()
  .min(2)
  .max(30)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'invalid lichess username');

/** Chess.com numeric game ids (live/daily): 1–20 digits, nothing else. */
export const chesscomGameIdSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^\d+$/, 'invalid chess.com game id');

/** Lichess game ids: exactly 8 (game) or 12 (with color suffix) alphanumerics. */
export const lichessGameIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{8}$|^[A-Za-z0-9]{12}$/, 'invalid lichess game id');

export const gameTypeSchema = z.enum(['live', 'daily']).default('live');

/** Archive month selector (used to construct monthly archive URLs). */
export const archiveMonthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** The ?locale= parameter: one of the four supported locales (mirrors
 * LOCALES in src/i18n — a unit test asserts the two stay in sync). */
export const localeSchema = z.enum(['en', 'hi', 'es', 'pa']);

/** Query for GET /api/chesscom — exactly one of user / id must be present,
 * except for the archive operations (Round 2, Prompt 2):
 *   op=archiveMonths  → requires user; lists that player's archive months.
 *   op=searchArchives → requires user AND id (the game link's id); with
 *                       year+month it searches that single month, without
 *                       them it searches up to 12 months, newest first. */
export const chesscomQuerySchema = z
  .object({
    user: chesscomUsernameSchema.optional(),
    id: chesscomGameIdSchema.optional(),
    type: gameTypeSchema,
    locale: localeSchema.optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    op: z.enum(['searchArchives', 'archiveMonths']).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.op === 'searchArchives' && (!q.user || !q.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'searchArchives requires user and id',
        path: ['user'],
      });
    }
    if (q.op === 'archiveMonths' && !q.user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'archiveMonths requires user',
        path: ['user'],
      });
    }
    if (!q.op && !q.user && !q.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'one of user or id is required',
        path: ['user'],
      });
    }
    if ((q.year === undefined) !== (q.month === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'year and month must be given together',
        path: ['month'],
      });
    }
  });

/** Query for GET /api/lichess. */
export const lichessQuerySchema = z.object({
  id: lichessGameIdSchema,
  locale: localeSchema.optional(),
});

export type ChesscomQuery = z.infer<typeof chesscomQuerySchema>;
export type LichessQuery = z.infer<typeof lichessQuerySchema>;

/** searchParams → plain record (first value per key) for zod parsing. */
export function searchParamsRecord(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(params.keys())) {
    const v = params.get(key);
    if (v !== null) out[key] = v;
  }
  return out;
}
