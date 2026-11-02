// The IndexedDB-backed half of src/engine/cache.ts, exercised against
// fake-indexeddb (installed before the cache module loads). In plain Node
// these functions all fall into their catch branches (that behavior is
// covered incidentally by the analyzer suites); here the real storage
// paths run: put/get round trips, the depth-reuse scan, review storage.
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngineLine, GameReview } from '@/lib/types';
import {
  clearPositionCache,
  deleteReview,
  getCacheStats,
  getCachedPosition,
  getCachedPositionForRequest,
  getReview,
  getReviewStats,
  listReviews,
  positionKeyV2,
  putCachedPosition,
  saveReview,
} from '@/engine/cache';

const FEN_A = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const FEN_B = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

function line(depth: number, scoreCp = 25): EngineLine {
  return { multipv: 1, depth, scoreCp, pv: ['e7e5'] };
}

function fakeReview(id: string, createdAt: number): GameReview {
  return {
    id,
    pgn: '1. e4 e5 *',
    headers: { White: 'Alice', Black: 'Bob', Result: '*', Date: '2026.11.01' },
    createdAt,
  } as unknown as GameReview;
}

beforeEach(async () => {
  await clearPositionCache();
  for (const r of await listReviews()) await deleteReview(r.id);
});

describe('position cache (real IndexedDB)', () => {
  it('round-trips a stored position entry', async () => {
    const key = positionKeyV2(FEN_A, 18, 3, 'sf19', 'standard');
    await putCachedPosition(key, [line(18)], 18, 'Stockfish 19');
    const got = await getCachedPosition(key);
    expect(got?.depth).toBe(18);
    expect(got?.lines[0]?.pv).toEqual(['e7e5']);
    expect(got?.engine).toBe('Stockfish 19');
    expect(await getCachedPosition('v2|missing|d18')).toBeUndefined();
  });

  it('serves the shallowest sufficient depth for a request, per profile/engine', async () => {
    await putCachedPosition(positionKeyV2(FEN_A, 12, 3, 'sf19', 'standard'), [line(12)], 12, 'sf');
    await putCachedPosition(positionKeyV2(FEN_A, 18, 3, 'sf19', 'standard'), [line(18)], 18, 'sf');
    await putCachedPosition(positionKeyV2(FEN_A, 22, 3, 'sf19', 'standard'), [line(22)], 22, 'sf');

    // Requested 14 -> the depth-18 entry is the shallowest that serves.
    const served = await getCachedPositionForRequest(FEN_A, 3, 'sf19', 'standard', 14);
    expect(served?.depth).toBe(18);
    // Requested 23 -> nothing is deep enough.
    expect(await getCachedPositionForRequest(FEN_A, 3, 'sf19', 'standard', 23)).toBeUndefined();
    // Different profile or engine version must not hit.
    expect(await getCachedPositionForRequest(FEN_A, 3, 'sf19', 'deep', 10)).toBeUndefined();
    expect(await getCachedPositionForRequest(FEN_A, 3, 'sf18', 'standard', 10)).toBeUndefined();
    // Unknown position -> undefined, not an error.
    expect(await getCachedPositionForRequest(FEN_B, 3, 'sf19', 'standard', 10)).toBeUndefined();
  });

  it('keeps repetition-tagged entries separate from untagged ones', async () => {
    await putCachedPosition(
      positionKeyV2(FEN_A, 18, 3, 'sf19', 'standard', '2'),
      [line(18, 0)],
      18,
      'sf',
    );
    // The untagged request must not see the rep-tagged entry, and vice versa.
    expect(await getCachedPositionForRequest(FEN_A, 3, 'sf19', 'standard', 10)).toBeUndefined();
    const tagged = await getCachedPositionForRequest(FEN_A, 3, 'sf19', 'standard', 10, '2');
    expect(tagged?.lines[0]?.scoreCp).toBe(0);
  });

  it('evicts the oldest entries once the cache exceeds CACHE_MAX_ENTRIES', async () => {
    // Seed CACHE_MAX_ENTRIES + 5 entries directly (bypassing the
    // one-by-one put path), oldest first, then one real put must evict
    // exactly the overflow, oldest first.
    const { CACHE_MAX_ENTRIES } = await import('@/lib/constants');
    const db = await openDB('chess-review', 2);
    const tx = db.transaction('positions', 'readwrite');
    for (let i = 0; i < CACHE_MAX_ENTRIES + 5; i++) {
      void tx.store.put({
        key: `seed-${String(i).padStart(6, '0')}`,
        lines: [line(10)],
        depth: 10,
        engine: 'seed',
        ts: i,
      });
    }
    await tx.done;
    db.close();

    await putCachedPosition(positionKeyV2(FEN_A, 18, 3, 'sf19', 'standard'), [line(18)], 18, 'sf');
    const stats = await getCacheStats();
    expect(stats.count).toBe(CACHE_MAX_ENTRIES);
    expect(await getCachedPosition('seed-000000')).toBeUndefined();
    expect(await getCachedPosition('seed-000005')).toBeUndefined();
    expect(await getCachedPosition('seed-000006')).toBeDefined();
  }, 120_000);

  it('reports cache stats and clears on demand', async () => {
    await putCachedPosition(positionKeyV2(FEN_A, 18, 3, 'sf19', 'standard'), [line(18)], 18, 'sf');
    await putCachedPosition(positionKeyV2(FEN_B, 18, 3, 'sf19', 'standard'), [line(18)], 18, 'sf');
    const stats = await getCacheStats();
    expect(stats.count).toBe(2);
    expect(stats.approxBytes).toBeGreaterThan(0);
    await clearPositionCache();
    expect((await getCacheStats()).count).toBe(0);
  });
});

describe('review storage (real IndexedDB)', () => {
  it('saves, reads, lists (newest first) and deletes reviews', async () => {
    await saveReview(fakeReview('rev-old', 1000));
    await saveReview(fakeReview('rev-new', 2000));

    const got = await getReview('rev-old');
    expect(got?.headers.White).toBe('Alice');
    expect(await getReview('rev-missing')).toBeUndefined();

    const list = await listReviews();
    expect(list.map((r) => r.id)).toEqual(['rev-new', 'rev-old']);
    expect(list[0]).toMatchObject({
      white: 'Alice',
      black: 'Bob',
      result: '*',
      date: '2026.11.01',
    });

    const stats = await getReviewStats();
    expect(stats.count).toBe(2);
    expect(stats.approxBytes).toBeGreaterThan(0);

    await deleteReview('rev-old');
    expect((await listReviews()).map((r) => r.id)).toEqual(['rev-new']);
  });

  it('applies header defaults in summaries when headers are sparse', async () => {
    const sparse = fakeReview('rev-sparse', 500);
    (sparse as { headers: Record<string, string> }).headers = {};
    await saveReview(sparse);
    const list = await listReviews();
    expect(list[0]).toMatchObject({ white: 'White', black: 'Black', result: '*', date: '' });
  });
});
