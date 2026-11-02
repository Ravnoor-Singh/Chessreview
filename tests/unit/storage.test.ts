import { describe, expect, it, vi } from 'vitest';
import {
  clearEngineCaches,
  collectStorageReport,
  engineCacheNames,
  type CacheLike,
  type CacheStorageLike,
} from '@/lib/storage';

function fakeCache(entries: { url: string; size: number; declared?: number }[]): CacheLike {
  const map = new Map(
    entries.map((e) => [
      e.url,
      new Response(new Uint8Array(e.size), {
        headers: e.declared ? { 'Content-Length': String(e.declared) } : {},
      }),
    ]),
  );
  return {
    keys: async () => [...map.keys()].map((url) => new Request(url)),
    match: async (req: Request) => map.get(req.url),
  };
}

function fakeCaches(caches: Record<string, CacheLike>): CacheStorageLike & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    keys: async () => Object.keys(caches),
    open: async (name: string) => caches[name],
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
  };
}

const stats = {
  reviewStats: async () => ({ count: 3, approxBytes: 12_000 }),
  positionStats: async () => ({ count: 42, approxBytes: 50_000 }),
};

describe('engineCacheNames', () => {
  it('selects SW + loader engine caches only', () => {
    expect(
      engineCacheNames([
        'chess-review-app-v1',
        'chess-review-sw-engine-v19.0.1',
        'chess-review-engine-v19.0.1',
        'chess-review-runtime-v1',
      ]),
    ).toEqual(['chess-review-sw-engine-v19.0.1', 'chess-review-engine-v19.0.1']);
  });
});

describe('collectStorageReport', () => {
  it('sums engine cache bytes (content-length preferred), reviews, positions and totals', async () => {
    const caches = fakeCaches({
      'chess-review-sw-engine-v19.0.1': fakeCache([
        { url: 'https://x/engine/a.wasm', size: 10, declared: 1000 },
        { url: 'https://x/engine/b.js', size: 500 },
      ]),
      'chess-review-app-v1': fakeCache([{ url: 'https://x/', size: 999_999 }]),
    });
    const report = await collectStorageReport({
      caches,
      storageManager: {
        estimate: async () => ({ usage: 2_000_000, quota: 100_000_000 }),
        persist: async () => true,
        persisted: async () => false,
      },
      ...stats,
    });
    expect(report.engineBytes).toBe(1500);
    expect(report.engineCacheNames).toEqual(['chess-review-sw-engine-v19.0.1']);
    expect(report.reviewsCount).toBe(3);
    expect(report.reviewsApproxBytes).toBe(12_000);
    expect(report.positionsCount).toBe(42);
    expect(report.totalUsage).toBe(2_000_000);
    expect(report.totalQuota).toBe(100_000_000);
    expect(report.persisted).toBe(false);
  });

  it('degrades to nulls without Cache Storage / StorageManager', async () => {
    const report = await collectStorageReport({ caches: null, storageManager: null, ...stats });
    expect(report.engineBytes).toBe(0);
    expect(report.totalUsage).toBeNull();
    expect(report.persisted).toBeNull();
    expect(report.reviewsCount).toBe(3);
  });
});

describe('clearEngineCaches', () => {
  it('deletes only engine caches and returns their names', async () => {
    const caches = fakeCaches({
      'chess-review-sw-engine-v19.0.1': fakeCache([]),
      'chess-review-engine-v19.0.1': fakeCache([]),
      'chess-review-app-v1': fakeCache([]),
    });
    const deleted = await clearEngineCaches(caches);
    expect(deleted.sort()).toEqual([
      'chess-review-engine-v19.0.1',
      'chess-review-sw-engine-v19.0.1',
    ]);
    expect(caches.deleted).not.toContain('chess-review-app-v1');
  });
});

describe('getReviewStats wiring', () => {
  it('collectStorageReport calls both stats providers', async () => {
    const reviewStats = vi.fn(async () => ({ count: 1, approxBytes: 2 }));
    const positionStats = vi.fn(async () => ({ count: 3, approxBytes: 4 }));
    await collectStorageReport({ caches: null, storageManager: null, reviewStats, positionStats });
    expect(reviewStats).toHaveBeenCalledOnce();
    expect(positionStats).toHaveBeenCalledOnce();
  });
});
