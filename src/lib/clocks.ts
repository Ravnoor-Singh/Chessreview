// Clock maths: TimeControl parsing, per-move time-spent derivation,
// player-bar clock formatting and time-trouble detection (Prompt 6).
//
// Time-spent derivation (also documented in README):
//   A PGN [%clk] comment after a move records that player's REMAINING
//   clock after the move. For move i by a player whose previous remaining
//   clock (after their own previous move) was `prev`, whose remaining
//   clock after this move is `clock`, and with increment `inc` (added
//   back after every move):
//       timeSpent = prev - clock + inc
//   For a player's FIRST move, `prev` is the game's base time from the
//   TimeControl header; when the base time is unknown the first move's
//   spent time is unknown too (undefined — never guessed). A move with a
//   missing [%clk], or whose predecessor clock is missing, likewise gets
//   undefined. Negative results (clock skew in the source PGN) clamp to 0.

export interface TimeControlInfo {
  /** Base time per player, in milliseconds. */
  baseMs: number;
  /** Increment added after each move, in milliseconds (0 when none). */
  incrementMs: number;
}

/**
 * Parse a PGN TimeControl header value into base + increment.
 *
 * Supported shapes:
 *   "600+5"      → base 600 s, increment 5 s (chess.com / Lichess style)
 *   "600"        → base only
 *   "180|2"      → pipe separator, treated like "+"
 *   "40/7200+30" → multi-stage: the LAST stage's "seconds+increment" part
 *                  is used (the part after the final "/"); a leading move
 *                  count is ignored because per-move derivation only needs
 *                  the stage's clock values.
 *   "7200+30:3600+30" (colon-separated stages) → last stage wins.
 * Returns null for "-", "*", empty or unparsable values.
 */
export function parseTimeControl(raw: string | undefined | null): TimeControlInfo | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text || text === '-' || text === '*') return null;
  // Multi-stage values: keep the last stage.
  if (text.includes(':')) text = text.split(':').pop()!.trim();
  // "moves/seconds+inc" → "seconds+inc".
  if (text.includes('/')) text = text.split('/').pop()!.trim();
  const match = /^(\d+(?:\.\d+)?)(?:\s*[+|]\s*(\d+(?:\.\d+)?))?$/.exec(text);
  if (!match) return null;
  const baseMs = Math.round(Number(match[1]) * 1000);
  const incrementMs = match[2] !== undefined ? Math.round(Number(match[2]) * 1000) : 0;
  if (!Number.isFinite(baseMs) || baseMs < 0) return null;
  return { baseMs, incrementMs };
}

/**
 * Derive per-move time spent from per-move remaining clocks.
 *
 * `clocksMs[i]` is the remaining clock (ms) of the player who made move i
 * (0-based move index), or null when that move has no [%clk]. Moves
 * alternate colours, so a player's previous clock is at index i - 2; for
 * i = 0 and i = 1 (each player's first move) the previous clock is the
 * base time `baseMs` when known. Returns an array of the same length with
 * `undefined` wherever the spent time cannot be derived.
 */
export function computeTimeSpentMs(
  clocksMs: readonly (number | null)[],
  opts: { incrementMs?: number; baseMs?: number | null } = {},
): (number | undefined)[] {
  const incrementMs = opts.incrementMs ?? 0;
  const baseMs = opts.baseMs ?? null;
  return clocksMs.map((clock, i) => {
    if (clock === null || clock === undefined) return undefined;
    const prev = i >= 2 ? clocksMs[i - 2] : baseMs;
    if (prev === null || prev === undefined) return undefined;
    return Math.max(0, prev - clock + incrementMs);
  });
}

/**
 * Player-bar clock format (Prompt 6). Rule (chosen, documented in README):
 * tenths are shown when the clock is under 20 seconds — earlier than
 * chess.com's under-10 rule, so the precise time is visible while there
 * is still time to act on it.
 *   >= 1 hour        → "h:mm:ss"   (e.g. 1:02:03)
 *   >= 20 seconds    → "m:ss"      (e.g. 12:34, 0:45)
 *   <  20 seconds    → "m:ss.t"    (e.g. 0:19.3, 0:04.0)
 * Negative values (flag fall recorded past zero) keep their sign.
 */
export function formatPlayerClock(ms: number): string {
  if (!Number.isFinite(ms)) return '0:00';
  const sign = ms < 0 ? '-' : '';
  const totalSeconds = Math.abs(ms) / 1000;
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (totalSeconds >= 20) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  // Integer tenths from milliseconds (avoids float error at e.g. 19.9 s).
  const totalTenths = Math.floor(Math.abs(ms) / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/**
 * Compact "time spent on this move" label for the move list.
 *   >= 60 s → "1:23" (m:ss), >= 10 s → "12s", < 10 s → "3.4s".
 */
export function formatSpentTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = ms / 1000;
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${seconds.toFixed(1)}s`;
}

/**
 * Time trouble (Prompt 6): the mover's remaining clock after the move is
 * under 30 seconds, OR under 10% of the game's base time when the base
 * time is known (the percentage rule only ever widens the flag for long
 * time controls — e.g. 90 s left in a 30-minute game is trouble too).
 */
export function isTimeTrouble(clockMs: number | undefined, baseMs?: number | null): boolean {
  if (clockMs === undefined || !Number.isFinite(clockMs)) return false;
  if (clockMs < 30_000) return true;
  if (baseMs !== undefined && baseMs !== null && baseMs > 0 && clockMs < baseMs * 0.1) return true;
  return false;
}
