// Storage management for the Settings drawer (Prompt 9): per-area usage
// (engine file caches, saved reviews, position cache), the browser-wide
// estimate, persistent-storage requests, and clearing the downloaded
// engine files. The collecting logic takes injectable dependencies so it
// is unit-testable without a real Cache Storage / IndexedDB.
import { engineSwCacheName, isEngineCacheName, ENGINE_VERSION } from './swCore.mjs';
import { getCacheStats, getReviewStats } from '@/engine/cache';

export interface CacheLike {
  keys(): Promise<readonly Request[]>;
  match(request: Request): Promise<Response | undefined>;
}
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}
export interface StorageManagerLike {
  estimate(): Promise<{ usage?: number; quota?: number }>;
  persist(): Promise<boolean>;
  persisted(): Promise<boolean>;
}

export interface StorageReport {
  /** Bytes held by engine file caches (SW dedicated cache + loader caches). */
  engineBytes: number;
  /** Names of the engine caches that contributed. */
  engineCacheNames: string[];
  reviewsCount: number;
  reviewsApproxBytes: number;
  positionsCount: number;
  positionsApproxBytes: number;
  /** navigator.storage.estimate() totals, when available. */
  totalUsage: number | null;
  totalQuota: number | null;
  persisted: boolean | null;
}

export interface StorageDeps {
  caches?: CacheStorageLike | null;
  storageManager?: StorageManagerLike | null;
  reviewStats: () => Promise<{ count: number; approxBytes: number }>;
  positionStats: () => Promise<{ count: number; approxBytes: number }>;
}

/** Names from a cache-name list that hold downloaded engine files. */
export function engineCacheNames(names: readonly string[]): string[] {
  return names.filter((n) => isEngineCacheName(n));
}

async function sumCacheBytes(cache: CacheLike): Promise<number> {
  let total = 0;
  try {
    for (const request of await cache.keys()) {
      const res = await cache.match(request);
      if (!res) continue;
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 0) {
        total += declared;
        continue;
      }
      try {
        total += (await res.blob()).size;
      } catch {
        // Unreadable entry — skip it rather than failing the whole report.
      }
    }
  } catch {
    // Cache unreadable — report what we have.
  }
  return total;
}

/** Collect the full storage report from injected dependencies (pure I/O glue; unit-tested with fakes). */
export async function collectStorageReport(deps: StorageDeps): Promise<StorageReport> {
  const names = deps.caches ? await deps.caches.keys().catch(() => [] as string[]) : [];
  const engineNames = engineCacheNames(names);
  let engineBytes = 0;
  if (deps.caches) {
    for (const name of engineNames) {
      engineBytes += await sumCacheBytes(await deps.caches.open(name));
    }
  }
  const [reviews, positions] = await Promise.all([deps.reviewStats(), deps.positionStats()]);
  let totalUsage: number | null = null;
  let totalQuota: number | null = null;
  let persisted: boolean | null = null;
  if (deps.storageManager) {
    try {
      const est = await deps.storageManager.estimate();
      totalUsage = typeof est.usage === 'number' ? est.usage : null;
      totalQuota = typeof est.quota === 'number' ? est.quota : null;
    } catch {
      // estimate unsupported — leave nulls.
    }
    try {
      persisted = await deps.storageManager.persisted();
    } catch {
      persisted = null;
    }
  }
  return {
    engineBytes,
    engineCacheNames: engineNames,
    reviewsCount: reviews.count,
    reviewsApproxBytes: reviews.approxBytes,
    positionsCount: positions.count,
    positionsApproxBytes: positions.approxBytes,
    totalUsage,
    totalQuota,
    persisted,
  };
}

/** Delete every engine file cache; returns the names actually deleted. */
export async function clearEngineCaches(caches: CacheStorageLike): Promise<string[]> {
  const deleted: string[] = [];
  for (const name of engineCacheNames(await caches.keys())) {
    if (await caches.delete(name)) deleted.push(name);
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Browser-backed entry points used by the UI.
// ---------------------------------------------------------------------------

function browserDeps(): StorageDeps {
  return {
    caches: typeof caches !== 'undefined' ? (caches as unknown as CacheStorageLike) : null,
    storageManager:
      typeof navigator !== 'undefined' && 'storage' in navigator
        ? (navigator.storage as unknown as StorageManagerLike)
        : null,
    reviewStats: getReviewStats,
    positionStats: getCacheStats,
  };
}

export function getStorageReport(): Promise<StorageReport> {
  return collectStorageReport(browserDeps());
}

export async function clearEngineFileCaches(): Promise<string[]> {
  if (typeof caches === 'undefined') return [];
  return clearEngineCaches(caches as unknown as CacheStorageLike);
}

/** The cache the SW would use for the current engine version (for tests/UI copy). */
export function currentEngineSwCacheName(): string {
  return engineSwCacheName(ENGINE_VERSION);
}

/**
 * Ask the browser to keep this origin's storage from being evicted.
 * Called on the first saved review and from the storage panel. Returns
 * the resulting persisted state (false when the API is unavailable).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
