// Browser-side engine payload loading: manifest fetch, streaming WASM
// download with progress, SHA-256 integrity verification and Cache API
// storage.
//
// Honest design note (see README "Engine loading & caching"): the packaged
// Stockfish builds are worker scripts that fetch and instantiate their own
// .wasm. This module therefore does NOT hand bytes to the worker. Instead it
// downloads the chosen build's .wasm first — reporting progress and verifying
// it against the manifest — which warms the browser HTTP cache (the files are
// served `immutable`). The worker is then constructed exactly as before and
// its own fetch resolves from the warm HTTP cache. An integrity mismatch is
// a hard error: the engine is never started from unverified bytes when a
// manifest entry exists.
//
// Prompt 9 cache reconciliation: same-origin, the SERVICE WORKER already
// caches /engine/* in its dedicated versioned cache, so this loader no
// longer keeps a second Cache API copy of the ~95 MB WASM (that was double
// storage for the same bytes). The loader's own Cache API copy is kept ONLY
// for a cross-origin (CDN) engine base, which the same-origin SW cannot
// intercept — there it is the only offline copy. `fetchWasmBytes` still
// supports a `cacheName` for that path, and its behavior contract
// (streaming progress, cache hit → fromCache) is unchanged.

import { t, detectBrowserLocale } from '@/i18n';
import type { EngineMode } from '@/lib/types';
import {
  availableModes,
  EngineIntegrityError,
  engineCacheName,
  engineManifestUrl,
  findManifestFile,
  manifestFingerprint,
  isCrossOriginEngineBase,
  parseEngineManifest,
  resolveEngineUrls,
  verifyWasmIntegrity,
  type EngineManifest,
} from './engineManifest';

export type LoadProgressFn = (percent: number | null) => void;

/**
 * Thrown when the deployment's manifest does not list a build's complete
 * file pair — the build was not shipped under the active ENGINE_BUNDLE
 * profile (Round 2, Prompt 7). Raised BEFORE any network request for the
 * build's files, so the loader never requests a file that was not
 * deployed. Callers treat it like any other per-build failure and move to
 * the next build in the (manifest-filtered) fallback order.
 */
export class EngineBuildNotShippedError extends Error {
  readonly mode: EngineMode;
  constructor(mode: EngineMode) {
    super(`Engine build "${mode}" is not shipped in this deployment`);
    this.name = 'EngineBuildNotShippedError';
    this.mode = mode;
  }
}

/** Fetch + validate the engine manifest; null when unavailable/malformed. */
export async function loadEngineManifest(baseUrl: string): Promise<EngineManifest | null> {
  try {
    const res = await fetch(engineManifestUrl(baseUrl));
    if (!res.ok) return null;
    return parseEngineManifest((await res.json()) as unknown);
  } catch {
    return null;
  }
}

export interface FetchedWasm {
  bytes: ArrayBuffer;
  fromCache: boolean;
}

/**
 * Fetch a WASM file, streaming progress through `onProgress` (percent 0–100,
 * or null when the total is unknown). A Cache API copy (when available) is
 * served without network and also populated after a network fetch.
 */
export async function fetchWasmBytes(
  url: string,
  opts: { expectedSize?: number; cacheName?: string; onProgress?: LoadProgressFn } = {},
): Promise<FetchedWasm> {
  const cacheApi = typeof caches !== 'undefined' ? caches : null;

  if (cacheApi && opts.cacheName) {
    try {
      const cache = await cacheApi.open(opts.cacheName);
      const hit = await cache.match(url);
      if (hit) {
        const bytes = await hit.arrayBuffer();
        opts.onProgress?.(100);
        return { bytes, fromCache: true };
      }
    } catch {
      // Cache API unavailable (e.g. insecure context) — fall through to network.
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      t(detectBrowserLocale(), 'errors.engineLoadFailed', { status: res.status, url }),
    );
  }

  let bytes: ArrayBuffer;
  const headerTotal = Number(res.headers.get('Content-Length'));
  const total =
    Number.isFinite(headerTotal) && headerTotal > 0 ? headerTotal : (opts.expectedSize ?? 0);

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        opts.onProgress?.(total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : null);
      }
    }
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    bytes = merged.buffer;
  } else {
    bytes = await res.arrayBuffer();
  }
  opts.onProgress?.(100);

  if (cacheApi && opts.cacheName) {
    try {
      const cache = await cacheApi.open(opts.cacheName);
      await cache.put(
        url,
        new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/wasm' } }),
      );
    } catch {
      // Best effort only; the HTTP cache still covers repeat visits.
    }
  }

  return { bytes, fromCache: false };
}

export interface PreparedEngine {
  manifest: EngineManifest | null;
  /** Engine package version from the manifest, e.g. "19.0.1". */
  version: string | null;
  wasmFile: string;
  wasmSize: number;
  fromCache: boolean;
}

/**
 * Download + verify the WASM for one build. Throws on HTTP failure (caller
 * may fall back to the next build) and with `EngineIntegrityError` on a
 * manifest hash mismatch (caller must NOT fall back silently — see header).
 * When no manifest (or no entry for this file) exists, verification is
 * skipped and the download still warms the caches.
 */
export async function prepareEngineBuild(
  baseUrl: string,
  mode: EngineMode,
  onProgress?: LoadProgressFn,
  knownManifest?: EngineManifest | null,
): Promise<PreparedEngine> {
  const urls = resolveEngineUrls(baseUrl, mode);
  const manifest = knownManifest !== undefined ? knownManifest : await loadEngineManifest(baseUrl);
  // Prompt 7: a manifest that does not list this build's complete pair
  // means the deployment did not ship it — fail before any request for
  // its files. (A null manifest means availability is unknown; the fetch
  // below then discovers it the old way.)
  if (manifest && !availableModes(manifest).includes(mode)) {
    throw new EngineBuildNotShippedError(mode);
  }
  const entry = manifest ? findManifestFile(manifest, urls.wasmFile) : undefined;
  const { bytes, fromCache } = await fetchWasmBytes(urls.wasmUrl, {
    expectedSize: entry?.size,
    // Same-origin: the service worker owns the persistent engine copy.
    // Cross-origin (CDN): no SW coverage, so keep the loader's Cache API copy.
    cacheName: isCrossOriginEngineBase(baseUrl)
      ? engineCacheName(
          manifest?.version ?? 'unknown',
          manifest ? manifestFingerprint(manifest) : undefined,
        )
      : undefined,
    onProgress,
  });
  if (entry?.sha256) {
    const result = await verifyWasmIntegrity(new Uint8Array(bytes), entry.sha256);
    if (!result.ok) {
      // Structured error: the English message is composed from the
      // catalogue as a fallback; the UI recomposes it in the active
      // locale from these fields via formatEngineError (engineErrors.ts).
      throw new EngineIntegrityError(
        t('en', 'errors.engineIntegrityFailed', {
          file: urls.wasmFile,
          expected: result.expected,
          actual: result.actual,
        }),
        { file: urls.wasmFile, expected: result.expected, actual: result.actual },
      );
    }
  }
  return {
    manifest,
    version: manifest?.version ?? null,
    wasmFile: urls.wasmFile,
    wasmSize: bytes.byteLength,
    fromCache,
  };
}
