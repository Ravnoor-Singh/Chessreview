// Display formatting: evaluations, clocks, node counts, hashing, clamping.

import { EVAL_DISPLAY_CLAMP_PAWNS, MATE_CP } from './constants';

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Format an evaluation from White's perspective.
 * `evalWhiteCp` is in centipawns; mates are encoded as ±(MATE_CP - |mate|)
 * and can also be passed explicitly via `mate` (moves to mate, White's
 * perspective, signed). Examples: "+1.3", "-0.7", "M4", "-M3", "0.0".
 */
export function formatEval(evalWhiteCp: number, mate?: number): string {
  let mateValue = mate;
  if (mateValue === undefined && Math.abs(evalWhiteCp) >= MATE_CP - 1000) {
    // Decode the internal mate encoding: |cp| = MATE_CP - |mate in moves|.
    const decoded = MATE_CP - Math.abs(evalWhiteCp);
    mateValue = evalWhiteCp >= 0 ? decoded : -decoded;
  }
  if (mateValue !== undefined && mateValue !== 0) {
    return mateValue > 0 ? `M${mateValue}` : `-M${Math.abs(mateValue)}`;
  }
  if (mateValue !== undefined && mateValue === 0) {
    // Mate on the move / side to move is mated: sign follows the eval.
    return evalWhiteCp >= 0 ? 'M0' : '-M0';
  }
  const pawns = clamp(evalWhiteCp / 100, -EVAL_DISPLAY_CLAMP_PAWNS, EVAL_DISPLAY_CLAMP_PAWNS);
  if (pawns === 0) return '0.0';
  const text = Math.abs(pawns).toFixed(1);
  return pawns > 0 ? `+${text}` : `-${text}`;
}

/**
 * Format an evaluation (White's perspective) from a given colour's point of
 * view: for Black the sign (and the mate sign) flips.
 */
export function formatEvalForSide(evalWhiteCp: number, side: 'w' | 'b', mate?: number): string {
  if (side === 'w') return formatEval(evalWhiteCp, mate);
  return formatEval(-evalWhiteCp, mate === undefined ? undefined : -mate);
}

/**
 * Format a remaining clock time in milliseconds as a chess clock string.
 * At a minute or more: "12:34" (or "1:02:34" past an hour). Under a minute
 * a tenths digit is shown, as real clocks do: "0:45.2".
 */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '0:00';
  const sign = ms < 0 ? '-' : '';
  const totalSeconds = Math.abs(ms) / 1000;
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  const seconds = Math.floor(totalSeconds);
  const tenths = Math.floor((totalSeconds - seconds) * 10);
  return `${sign}0:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/** Compact node count: 950 → "950", 12_400 → "12.4k", 3_200_000 → "3.2M". */
export function formatNodes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  const trim = (value: number, suffix: string): string => {
    const text = value.toFixed(1);
    return `${text.endsWith('.0') ? text.slice(0, -2) : text}${suffix}`;
  };
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return trim(n / 1000, 'k');
  if (n < 1_000_000_000) return trim(n / 1_000_000, 'M');
  return trim(n / 1_000_000_000, 'B');
}

/**
 * FNV-1a 32-bit hash of a string, as 8 lowercase hex characters.
 * Deterministic across runs and platforms; used for game/cache ids.
 */
export function hashString(s: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
