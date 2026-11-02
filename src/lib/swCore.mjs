// Service-worker core logic — SINGLE SOURCE OF TRUTH (Prompt 9).
//
// This file is plain ESM JavaScript on purpose, following the budgetRules.mjs
// precedent: `scripts/build-sw.mjs` inlines it verbatim (minus the `export`
// keywords) into the generated `public/sw.js`, and the unit tests import it
// directly — so the code the tests exercise is byte-for-byte the code the
// service worker runs. Never copy these functions elsewhere.
//
// It must stay dependency-free and import-free so the inlining works.

/** Bump on any SW/precache change; old app/runtime caches are dropped on activate. */
export const SW_VERSION = '1';

/**
 * Stockfish package version the dedicated engine cache is keyed by. MUST
 * match `version` in public/engine/engine-manifest.json (a unit test guards
 * this) — bump it together with a Stockfish upgrade, alongside SW_VERSION.
 * Chosen over fetching the manifest from inside the SW at install time:
 * one less failure mode during install, and the guard test keeps it honest.
 */
export const ENGINE_VERSION = '19.0.1';

/**
 * Content fingerprint of the engine payload this app build ships
 * (Round 2, Prompt 7 version-mismatch guard). `scripts/build-sw.mjs`
 * REPLACES this literal with a SHA-256-derived fingerprint of
 * public/engine/engine-manifest.json (version + every file's name, size
 * and hash) when generating public/sw.js. Any engine change — a profile
 * switch, different bytes under the same version — therefore changes
 * sw.js itself, which triggers the normal SW update flow, and changes
 * the engine cache name below, so a stale cache can never serve an old
 * engine to a new app: the old cache is simply not a current cache any
 * more and is deleted on activate. 'dev' remains only when the worker
 * was generated without a manifest (unit tests import this file raw).
 */
export const ENGINE_FINGERPRINT = 'dev';

/**
 * File names the current engine manifest lists (Prompt 2 cache purge).
 * `scripts/build-sw.mjs` REPLACES this literal with the manifest's file
 * list when generating public/sw.js, the same way it stamps
 * ENGINE_FINGERPRINT above. On activation the worker deletes every entry
 * in its current engine cache whose file is not in this list (see
 * engineEntriesToPurge), so bytes from an older payload cannot survive
 * inside a cache whose name did not change. Empty only when the worker
 * was generated without a manifest (unit tests import this file raw and
 * pass the list explicitly).
 */
export const ENGINE_FILE_NAMES = [];

export const APP_CACHE = 'chess-review-app-v' + SW_VERSION;
export const RUNTIME_CACHE = 'chess-review-runtime-v' + SW_VERSION;
export const ENGINE_CACHE_PREFIX = 'chess-review-sw-engine-v';
/** The engine loader's own Cache API caches (cross-origin/CDN path only). */
export const LOADER_ENGINE_CACHE_PREFIX = 'chess-review-engine-v';

export function engineSwCacheName(version) {
  const safe = String(version || 'unknown').replace(/[^0-9A-Za-z._-]/g, '') || 'unknown';
  return ENGINE_CACHE_PREFIX + safe;
}

/** The SW's CURRENT engine cache: version + payload fingerprint (Prompt 7). */
export function engineSwCurrentCacheName() {
  const fp = String(ENGINE_FINGERPRINT || 'dev').replace(/[^0-9a-z]/gi, '') || 'dev';
  return engineSwCacheName(ENGINE_VERSION) + '-f' + fp;
}

/** Every cache name the current SW owns (loader caches excluded — not ours). */
export function currentCacheNames() {
  return [APP_CACHE, RUNTIME_CACHE, engineSwCurrentCacheName()];
}

export function isEngineCacheName(name) {
  return (
    typeof name === 'string' &&
    (name.startsWith(ENGINE_CACHE_PREFIX) || name.startsWith(LOADER_ENGINE_CACHE_PREFIX))
  );
}

/** Basename of the engine manifest — the one /engine/ entry that is an index, not a payload file. */
export const ENGINE_MANIFEST_BASENAME = 'engine-manifest.json';

/**
 * File name of a cached /engine/ entry ('/engine/stockfish-19.wasm' or a
 * full URL → 'stockfish-19.wasm'); null for non-engine or unparseable
 * URLs. Query strings never reach the file name (pathname only).
 */
export function engineEntryFileName(rawUrl, origin) {
  try {
    const url = new URL(String(rawUrl), origin || 'http://sw.invalid');
    if (!url.pathname.startsWith('/engine/')) return null;
    const name = url.pathname.slice('/engine/'.length);
    if (!name || name.includes('/')) return null;
    return decodeURIComponent(name);
  } catch {
    return null;
  }
}

/**
 * Engine-cache entries to purge on activate (Prompt 2, pure; unit-tested):
 * given the CURRENT engine cache's entry URLs and the file names the
 * current manifest lists, return the URLs whose file is not listed —
 * stale payload bytes from an older engine build. The manifest itself is
 * always kept (it is the index, and the SW keeps a copy as its offline
 * fallback for the network-first manifest route). An empty/unknown
 * current list purges NOTHING: without a manifest there is no basis for
 * calling an entry stale, and deleting the whole engine cache on a
 * guess would cost a ~95 MB re-download. Non-engine or unparseable
 * entries inside the engine cache are purged (they cannot be current
 * payload by construction).
 */
export function engineEntriesToPurge(cachedUrls, currentFileNames) {
  if (!Array.isArray(currentFileNames) || currentFileNames.length === 0) return [];
  const allowed = new Set(currentFileNames);
  allowed.add(ENGINE_MANIFEST_BASENAME);
  const purge = [];
  const seen = new Set();
  for (const raw of cachedUrls || []) {
    const url = String(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    const name = engineEntryFileName(url);
    if (name === null || !allowed.has(name)) purge.push(url);
  }
  return purge;
}

/**
 * Cache names to delete on activate: anything in our `chess-review-`
 * namespace that is not a current cache and not a loader engine cache
 * (the loader manages those itself; the Settings storage panel can clear
 * them explicitly). Stale SW engine caches for old versions ARE deleted.
 */
export function cachesToDelete(existingNames) {
  const keep = new Set(currentCacheNames());
  return (existingNames || []).filter(
    (name) =>
      typeof name === 'string' &&
      name.startsWith('chess-review-') &&
      !keep.has(name) &&
      !name.startsWith(LOADER_ENGINE_CACHE_PREFIX),
  );
}

export const PIECE_SET_IDS = [
  'cburnett',
  'neo',
  'staunton-wood',
  'minimal',
  'high-contrast',
  'staunton',
  'outline',
  'glass',
  'marble',
  'metal',
  'wood',
  '3d-look',
  'newspaper',
  'symbols',
  'large',
  'colorblind-safe',
  'modern-soft',
  'club',
  'icy',
  'neon',
  'bubblegum',
  'space',
  'figurine',
  'nature',
  'lolz',
  'gothic',
  'medieval',
  'graffiti',
  '8bit',
  'arcade',
  'dash',
  'bases',
  'letters',
  'cases',
  'animals',
  'tigers',
];
export const PIECE_CODES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
export const SOUND_FILES = [
  'move.wav',
  'capture.wav',
  'check.wav',
  'castle.wav',
  'promote.wav',
  'illegal.wav',
  'start.wav',
  'end.wav',
];
export const OPENING_FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'c2.tsv', 'd.tsv', 'e.tsv'];
export const ICON_FILES = [
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
];

/**
 * URLs precached on install. The hashed /_next/static/* chunks are NOT
 * listed here (their names change every build) — the install handler in
 * build-sw.mjs discovers them from the served / and /review documents and
 * precaches those too; anything still missed is runtime-cached cache-first
 * on first use. The ~95 MB engine WASM is NOT precached either (runtime-
 * cached in the dedicated engine cache on first analysis).
 */
export function precacheUrls() {
  const urls = ['/', '/review', '/manifest.webmanifest'];
  for (const file of ICON_FILES) urls.push('/icons/' + file);
  for (const set of PIECE_SET_IDS) {
    for (const code of PIECE_CODES) urls.push('/pieces/' + set + '/' + code + '.svg');
  }
  for (const file of OPENING_FILES) urls.push('/openings/' + file);
  for (const file of SOUND_FILES) urls.push('/sounds/' + file);
  return urls;
}

/**
 * Request classification for the fetch handler (pure; unit-tested):
 * - 'network-only': /api/* and non-GET — never cached, never intercepted.
 * - 'engine-manifest': /engine/engine-manifest.json — network-FIRST
 *   (Prompt 2): the manifest's URL never changes, so cache-first would
 *   serve a stale manifest (and with it stale SHA-256 expectations)
 *   forever; the cached copy is only the offline fallback.
 * - 'engine': other /engine/* — cache-first in the dedicated versioned cache.
 * - 'static': /_next/static/* — cache-first in the runtime cache.
 * - 'navigation': document navigations — network-first, cache fallback.
 * - 'runtime': any other same-origin GET — cache-first (precache hits land
 *   here too), network fallback that populates the runtime cache.
 * - 'passthrough': cross-origin or unparseable — the SW does not respond.
 */
export function classifyRequest(rawUrl, options) {
  const opts = options || {};
  const method = String(opts.method || 'GET').toUpperCase();
  if (method !== 'GET') return 'network-only';
  let url;
  let origin = opts.origin || '';
  try {
    url = new URL(String(rawUrl), origin || 'http://sw.invalid');
    if (origin && new URL(origin).origin !== url.origin) return 'passthrough';
  } catch {
    return 'passthrough';
  }
  const path = url.pathname;
  if (path === '/api' || path.startsWith('/api/')) return 'network-only';
  if (path === '/engine/engine-manifest.json') return 'engine-manifest';
  if (path.startsWith('/engine/')) return 'engine';
  if (path.startsWith('/_next/static/')) return 'static';
  if (opts.mode === 'navigate') return 'navigation';
  return 'runtime';
}

/**
 * Content-Security-Policy for SW-served responses (Prompt 11). MUST stay
 * byte-identical to the PRODUCTION CSP in next.config.js (the single
 * source of truth; dev builds additionally allow loopback connect-src,
 * which a shipped service worker must never carry) —
 * tests/unit/sw-core.test.ts asserts the two are equal.
 */
export const SW_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' https://lichess.org https://api.chess.com; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/** Isolation headers every SW-served response must carry (see sw.js header). */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Prompt 11: SW-served responses also lose the server's CSP and the
  // other static security headers, so they are injected the same way.
  'Content-Security-Policy': SW_CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Return a copy of `headers` with the isolation headers set (pure-ish: no mutation of the input). */
export function withIsolationHeaders(headers) {
  const next = new Headers(headers);
  for (const key of Object.keys(ISOLATION_HEADERS)) next.set(key, ISOLATION_HEADERS[key]);
  return next;
}

/**
 * Clone `response` with COOP/COEP/CORP injected. Responses served by a
 * service worker do NOT inherit the server's headers — without this the
 * page stops being cross-origin isolated once the SW controls it and the
 * multi-threaded engine silently degrades. Opaque / status-0 responses
 * cannot be rebuilt and are returned untouched.
 */
export function injectIsolationHeaders(response) {
  if (!response || response.type === 'opaque' || response.status === 0) return response;
  try {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: withIsolationHeaders(response.headers),
    });
  } catch {
    return response;
  }
}
