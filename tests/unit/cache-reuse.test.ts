import { describe, expect, it } from 'vitest';
import {
  CACHE_SCHEMA_VERSION,
  approxCacheEntryBytes,
  cacheKeyPrefixV2,
  canServeCachedDepth,
  normalizeFen,
  pickBestCachedEntry,
  positionKeyV2,
  summarizeCacheStats,
} from '@/engine/cache';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_NORMALIZED = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

describe('positionKeyV2', () => {
  it('embeds schema version, engine version and budget profile', () => {
    expect(positionKeyV2(START, 18, 3, '19.0.1', 'standard')).toBe(
      `v${CACHE_SCHEMA_VERSION}|${START_NORMALIZED}|pv3|eng19.0.1|profstandard|d18`,
    );
    expect(CACHE_SCHEMA_VERSION).toBe(2);
  });

  it('differs across engine versions and profiles, so stale entries cannot collide', () => {
    const base = positionKeyV2(START, 18, 3, '19.0.1', 'standard');
    expect(positionKeyV2(START, 18, 3, '19.0.2', 'standard')).not.toBe(base);
    expect(positionKeyV2(START, 18, 3, '19.0.1', 'deep')).not.toBe(base);
    expect(positionKeyV2(START, 18, 5, '19.0.1', 'standard')).not.toBe(base);
    // …and never equals a legacy v1 key for the same request.
    expect(base).not.toBe(`${normalizeFen(START)}|d18|pv3`);
  });

  it('stores the achieved depth as the final segment, under a shared prefix', () => {
    const prefix = cacheKeyPrefixV2(START, 3, '19.0.1', 'standard');
    expect(positionKeyV2(START, 12, 3, '19.0.1', 'standard')).toBe(`${prefix}|d12`);
    expect(positionKeyV2(START, 22, 3, '19.0.1', 'standard')).toBe(`${prefix}|d22`);
  });
});

describe('cache reuse rule (depth >= requested)', () => {
  it('canServeCachedDepth is a plain >= comparison', () => {
    expect(canServeCachedDepth(18, 18)).toBe(true);
    expect(canServeCachedDepth(22, 18)).toBe(true);
    expect(canServeCachedDepth(14, 18)).toBe(false);
    expect(canServeCachedDepth(12, 12)).toBe(true);
  });

  it('pickBestCachedEntry picks the shallowest sufficient entry', () => {
    const entries = [{ depth: 22 }, { depth: 12 }, { depth: 19 }, { depth: 10 }];
    expect(pickBestCachedEntry(entries, 18)?.depth).toBe(19);
    expect(pickBestCachedEntry(entries, 12)?.depth).toBe(12);
    expect(pickBestCachedEntry(entries, 22)?.depth).toBe(22);
  });

  it('pickBestCachedEntry returns undefined when nothing is deep enough', () => {
    expect(pickBestCachedEntry([{ depth: 10 }, { depth: 14 }], 18)).toBeUndefined();
    expect(pickBestCachedEntry([], 12)).toBeUndefined();
  });

  it('a deeper cached result serves a shallower request (Deep → Standard)', () => {
    const deepResult = { depth: 22, lines: [] as unknown[] };
    expect(pickBestCachedEntry([deepResult], 18)).toBe(deepResult);
    expect(pickBestCachedEntry([deepResult], 14)).toBe(deepResult);
  });
});

describe('cache statistics', () => {
  it('summarizeCacheStats counts entries and approximates total size', () => {
    const entries = [
      { key: 'a', lines: [], depth: 12 },
      { key: 'b', lines: [{ multipv: 1, depth: 18, pv: ['e2e4'] }], depth: 18 },
    ];
    const stats = summarizeCacheStats(entries);
    expect(stats.count).toBe(2);
    expect(stats.approxBytes).toBe(entries.reduce((sum, e) => sum + approxCacheEntryBytes(e), 0));
    expect(stats.approxBytes).toBeGreaterThan(0);
  });

  it('empty cache summarizes to zero', () => {
    expect(summarizeCacheStats([])).toEqual({ count: 0, approxBytes: 0 });
  });
});
