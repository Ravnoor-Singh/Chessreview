// IndexedDB persistence: position analysis cache + saved reviews (spec 5.3).
//
// Prompt 3: the position cache is schema v2. Keys carry the engine version
// and the budget profile name alongside FEN/MultiPV, and store the ACHIEVED
// depth (adaptive searches often stop before the target). A cached entry
// may serve a request when its achieved depth is >= the requested depth
// (`canServeCachedDepth`); `pickBestCachedEntry` chooses the shallowest
// sufficient entry. The DB version bump drops v1 position entries (their
// keys cannot collide with v2 keys, and they carry no depth guarantees).
import { openDB, type IDBPDatabase } from 'idb';
import type { EngineLine, GameReview } from '@/lib/types';
import { CACHE_MAX_ENTRIES } from '@/lib/constants';

const DB_NAME = 'chess-review';
const DB_VERSION = 2;

/** Position-cache schema version, embedded as the first key segment. */
export const CACHE_SCHEMA_VERSION = 2;

interface PositionEntry {
  key: string;
  lines: EngineLine[];
  depth: number;
  engine: string;
  ts: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 2) {
          // v1 position keys lack engine version / budget profile; drop them.
          if (d.objectStoreNames.contains('positions')) d.deleteObjectStore('positions');
          d.createObjectStore('positions', { keyPath: 'key' });
        } else if (!d.objectStoreNames.contains('positions')) {
          d.createObjectStore('positions', { keyPath: 'key' });
        }
        if (!d.objectStoreNames.contains('reviews')) {
          d.createObjectStore('reviews', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/** EPD-like normalization: drop halfmove/fullmove counters so transpositions hit. */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(' ');
}

/** Legacy (v1) key format, kept for compatibility with existing callers/tests. */
export function positionKey(fen: string, depth: number, multiPv: number): string {
  return `${normalizeFen(fen)}|d${depth}|pv${multiPv}`;
}

/**
 * V2 key: schema version, normalized FEN, MultiPV, engine version and
 * budget profile name, with the ACHIEVED depth as the final segment (so a
 * prefix scan over everything before `|d` finds every depth stored for the
 * same position/request shape).
 */
export function positionKeyV2(
  fen: string,
  depth: number,
  multiPv: number,
  engineVersion: string,
  profile: string,
  repTag?: string,
): string {
  return `${cacheKeyPrefixV2(fen, multiPv, engineVersion, profile, repTag)}|d${depth}`;
}

/**
 * Everything in a v2 key before the achieved-depth segment. `repTag`
 * (Round 2) encodes how many times the position already occurred in the
 * game being analyzed: the same board with a different repetition count
 * can have a different true evaluation (a draw claim changes what the
 * engine should find), so such positions must never share a cache entry.
 * When omitted the legacy key shape is preserved exactly.
 */
export function cacheKeyPrefixV2(
  fen: string,
  multiPv: number,
  engineVersion: string,
  profile: string,
  repTag?: string,
): string {
  const eng = (engineVersion || 'unknown').replace(/\|/g, '/');
  const prof = (profile || 'standard').replace(/\|/g, '/');
  const base = `v${CACHE_SCHEMA_VERSION}|${normalizeFen(fen)}|pv${multiPv}|eng${eng}|prof${prof}`;
  return repTag ? `${base}|rep${repTag.replace(/\|/g, '/')}` : base;
}

/** Reuse rule: a cached result may serve a request when it was searched at least as deep. */
export function canServeCachedDepth(cachedDepth: number, requestedDepth: number): boolean {
  return cachedDepth >= requestedDepth;
}

/**
 * Choose the entry to serve a request from same-position candidates: the
 * shallowest entry that still satisfies the reuse rule (deepest-first is
 * wasteful to prefer when a just-sufficient entry exists). Undefined when
 * no candidate is deep enough.
 */
export function pickBestCachedEntry<T extends { depth: number }>(
  candidates: readonly T[],
  requestedDepth: number,
): T | undefined {
  let best: T | undefined;
  for (const entry of candidates) {
    if (!canServeCachedDepth(entry.depth, requestedDepth)) continue;
    if (!best || entry.depth < best.depth) best = entry;
  }
  return best;
}

export async function getCachedPosition(key: string): Promise<PositionEntry | undefined> {
  try {
    const d = await db();
    return (await d.get('positions', key)) as PositionEntry | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find a cached entry for a position that satisfies the reuse rule for
 * `requestedDepth` under the given MultiPV / engine version / budget
 * profile. Scans every achieved depth stored for the position.
 */
export async function getCachedPositionForRequest(
  fen: string,
  multiPv: number,
  engineVersion: string,
  profile: string,
  requestedDepth: number,
  repTag?: string,
): Promise<PositionEntry | undefined> {
  try {
    const d = await db();
    const prefix = cacheKeyPrefixV2(fen, multiPv, engineVersion, profile, repTag);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const keys = (await d.getAllKeys('positions', range)) as string[];
    if (keys.length === 0) return undefined;
    const candidates: PositionEntry[] = [];
    for (const key of keys) {
      // The range scan is only a coarse filter: a rep-tagged key
      // (`<prefix>|repN|d…`) also sorts inside the UNTAGGED prefix range,
      // and repetition-tagged entries must never serve a request with a
      // different tag (see cacheKeyPrefixV2). Only keys of the exact
      // shape `<prefix>|d<depth>` belong to this request.
      if (!key.startsWith(`${prefix}|d`)) continue;
      const entry = (await d.get('positions', key)) as PositionEntry | undefined;
      if (entry) candidates.push(entry);
    }
    return pickBestCachedEntry(candidates, requestedDepth);
  } catch {
    return undefined;
  }
}

export async function putCachedPosition(
  key: string,
  lines: EngineLine[],
  depth: number,
  engine: string,
): Promise<void> {
  try {
    const d = await db();
    await d.put('positions', { key, lines, depth, engine, ts: Date.now() } satisfies PositionEntry);
    // LRU eviction, checked opportunistically.
    const count = await d.count('positions');
    if (count > CACHE_MAX_ENTRIES) {
      const all = (await d.getAll('positions')) as PositionEntry[];
      all.sort((a, b) => a.ts - b.ts);
      const tx = d.transaction('positions', 'readwrite');
      for (const entry of all.slice(0, count - CACHE_MAX_ENTRIES)) {
        void tx.store.delete(entry.key);
      }
      await tx.done;
    }
  } catch {
    // Cache failures must never break analysis.
  }
}

export async function clearPositionCache(): Promise<void> {
  try {
    const d = await db();
    await d.clear('positions');
  } catch {
    // ignore
  }
}

export interface CacheStats {
  /** Number of cached positions. */
  count: number;
  /** Approximate stored size in bytes (sum of serialized entries). */
  approxBytes: number;
}

/** Approximate serialized size of one cache entry (pure; unit-tested). */
export function approxCacheEntryBytes(entry: unknown): number {
  try {
    return JSON.stringify(entry)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Summarize cache entries into settings-facing statistics (pure; unit-tested). */
export function summarizeCacheStats(entries: readonly unknown[]): CacheStats {
  let approxBytes = 0;
  for (const entry of entries) approxBytes += approxCacheEntryBytes(entry);
  return { count: entries.length, approxBytes };
}

/** Cache statistics for the Settings drawer (count + approximate size). */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const d = await db();
    const all = (await d.getAll('positions')) as PositionEntry[];
    return summarizeCacheStats(all);
  } catch {
    return { count: 0, approxBytes: 0 };
  }
}

/** Saved-review statistics for the Settings storage panel (count + approximate size). */
export async function getReviewStats(): Promise<CacheStats> {
  try {
    const d = await db();
    const all = (await d.getAll('reviews')) as GameReview[];
    return summarizeCacheStats(all);
  } catch {
    return { count: 0, approxBytes: 0 };
  }
}

export async function saveReview(review: GameReview): Promise<void> {
  try {
    const d = await db();
    await d.put('reviews', review);
  } catch {
    // ignore
  }
}

export async function getReview(id: string): Promise<GameReview | undefined> {
  try {
    const d = await db();
    return (await d.get('reviews', id)) as GameReview | undefined;
  } catch {
    return undefined;
  }
}

export interface ReviewSummary {
  id: string;
  white: string;
  black: string;
  result: string;
  date: string;
  createdAt: number;
  pgn: string;
}

export async function listReviews(): Promise<ReviewSummary[]> {
  try {
    const d = await db();
    const all = (await d.getAll('reviews')) as GameReview[];
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        white: r.headers.White ?? 'White',
        black: r.headers.Black ?? 'Black',
        result: r.headers.Result ?? '*',
        date: r.headers.Date ?? '',
        createdAt: r.createdAt,
        pgn: r.pgn,
      }));
  } catch {
    return [];
  }
}

export async function deleteReview(id: string): Promise<void> {
  try {
    const d = await db();
    await d.delete('reviews', id);
  } catch {
    // ignore
  }
}
