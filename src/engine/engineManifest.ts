// Engine payload configuration: file names, base-URL resolution, fallback
// order, manifest parsing and WASM integrity verification.
//
// Everything in this module is pure / injectable so it can be unit-tested in
// Node without a browser. The browser-side fetching lives in engineLoader.ts.

import type { EngineMode } from '@/lib/types';

/** Settings value for the engine build: 'auto' or a forced build. */
export type EngineBuildPreference = 'auto' | EngineMode;

export interface EngineFilePair {
  js: string;
  wasm: string;
}

/** The three builds the app actually ships and can select at runtime. */
export const ENGINE_FILES: Record<EngineMode, EngineFilePair> = {
  multi: { js: 'stockfish-19.js', wasm: 'stockfish-19.wasm' },
  single: { js: 'stockfish-19-single.js', wasm: 'stockfish-19-single.wasm' },
  lite: { js: 'stockfish-19-lite-single.js', wasm: 'stockfish-19-lite-single.wasm' },
};

export const ENGINE_BUILD_LABEL: Record<EngineMode, string> = {
  multi: 'Full (multi-threaded)',
  single: 'Single-threaded',
  lite: 'Lite',
};

export const DEFAULT_ENGINE_BASE_URL = '/engine';
export const ENGINE_MANIFEST_FILE = 'engine-manifest.json';

/** Trim whitespace and trailing slashes; empty means the default base. */
export function normalizeEngineBaseUrl(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_ENGINE_BASE_URL;
  return value.replace(/\/+$/, '') || DEFAULT_ENGINE_BASE_URL;
}

/**
 * The configured engine base URL. `NEXT_PUBLIC_ENGINE_BASE_URL` is inlined by
 * Next.js at build time; unset means the same-origin `/engine` directory.
 */
export function getEngineBaseUrl(): string {
  return normalizeEngineBaseUrl(process.env.NEXT_PUBLIC_ENGINE_BASE_URL);
}

export function engineFileUrl(baseUrl: string, fileName: string): string {
  return `${normalizeEngineBaseUrl(baseUrl)}/${fileName}`;
}

export interface EngineUrls {
  mode: EngineMode;
  jsFile: string;
  wasmFile: string;
  jsUrl: string;
  wasmUrl: string;
}

export function resolveEngineUrls(baseUrl: string, mode: EngineMode): EngineUrls {
  const pair = ENGINE_FILES[mode];
  return {
    mode,
    jsFile: pair.js,
    wasmFile: pair.wasm,
    jsUrl: engineFileUrl(baseUrl, pair.js),
    wasmUrl: engineFileUrl(baseUrl, pair.wasm),
  };
}

export function engineManifestUrl(baseUrl: string): string {
  return engineFileUrl(baseUrl, ENGINE_MANIFEST_FILE);
}

/**
 * Builds to try, in order, when starting from `start`: multi degrades to
 * single then lite; single degrades to lite; lite is the last resort.
 */
export function fallbackOrder(start: EngineMode): EngineMode[] {
  if (start === 'multi') return ['multi', 'single', 'lite'];
  if (start === 'single') return ['single', 'lite'];
  return ['lite'];
}

/** Coarse mobile check from a user-agent string (pure; caller may override). */
export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

/**
 * True when `baseUrl` is an absolute http(s) URL on a different origin than
 * the page. Relative bases are always same-origin. When `pageOrigin` is not
 * supplied, the current location's origin is used if available.
 */
export function isCrossOriginEngineBase(baseUrl: string, pageOrigin?: string): boolean {
  const base = normalizeEngineBaseUrl(baseUrl);
  if (!/^https?:\/\//i.test(base)) return false;
  const origin = pageOrigin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  if (!origin) return false;
  try {
    return new URL(base).origin !== new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * Source of the same-origin wrapper worker used for cross-origin engine
 * hosting. A Worker cannot be constructed directly from another origin, so
 * the client creates a Blob worker from this source; the wrapper
 * `importScripts` the real engine script (allowed cross-origin with CORS —
 * and, since Prompt 7, with the page CSP: a worker inherits the page's
 * policy, so next.config.js adds the configured engine origin to
 * script-src / worker-src; see the README's CDN recipe for static hosts),
 * and the engine finds its .wasm via the wrapper worker's location hash,
 * which the client sets to the encoded WASM URL (that is how the packaged
 * Stockfish builds resolve their WASM: `location.hash` wins over the
 * script-path derivation).
 */
export function buildCdnWorkerSource(jsUrl: string): string {
  return `'use strict';\nimportScripts(${JSON.stringify(jsUrl)});\n`;
}

// ---------------------------------------------------------------------------
// Manifest (written by scripts/copy-engine.mjs as engine-manifest.json)
// ---------------------------------------------------------------------------

export interface EngineManifestFile {
  name: string;
  size: number;
  sha256: string;
}

export interface EngineManifest {
  version: string;
  generatedAt: string;
  files: EngineManifestFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validate unknown JSON as an engine manifest; null when malformed. */
export function parseEngineManifest(value: unknown): EngineManifest | null {
  if (!isRecord(value)) return null;
  if (typeof value.version !== 'string' || typeof value.generatedAt !== 'string') return null;
  if (!Array.isArray(value.files)) return null;
  const files: EngineManifestFile[] = [];
  for (const entry of value.files as unknown[]) {
    if (!isRecord(entry)) return null;
    if (typeof entry.name !== 'string') return null;
    if (typeof entry.size !== 'number' || !Number.isFinite(entry.size) || entry.size < 0)
      return null;
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.sha256)) return null;
    files.push({ name: entry.name, size: entry.size, sha256: entry.sha256.toLowerCase() });
  }
  return { version: value.version, generatedAt: value.generatedAt, files };
}

export function findManifestFile(
  manifest: EngineManifest,
  name: string,
): EngineManifestFile | undefined {
  return manifest.files.find((f) => f.name === name);
}

/**
 * Modes whose COMPLETE file pair (.js + .wasm) is listed in the manifest —
 * i.e. the builds this deployment actually ships (Round 2, Prompt 7: the
 * manifest is generated per ENGINE_BUNDLE profile, so it is the source of
 * truth for availability).
 */
export function availableModes(manifest: EngineManifest): EngineMode[] {
  const modes: EngineMode[] = [];
  for (const mode of Object.keys(ENGINE_FILES) as EngineMode[]) {
    const pair = ENGINE_FILES[mode];
    if (findManifestFile(manifest, pair.js) && findManifestFile(manifest, pair.wasm)) {
      modes.push(mode);
    }
  }
  return modes;
}

/**
 * Restrict a fallback order to builds the manifest says were shipped, so
 * the loader never requests a file that was not deployed. A null manifest
 * (unreachable/malformed) leaves the order untouched — availability is
 * then discovered the old way, by fetch failure. A manifest that would
 * filter the order down to nothing is likewise ignored: a broken manifest
 * must not brick the engine when the files may still be there.
 */
export function filterFallbackOrder(
  order: EngineMode[],
  manifest: EngineManifest | null,
): EngineMode[] {
  if (!manifest) return order;
  const available = new Set(availableModes(manifest));
  const filtered = order.filter((mode) => available.has(mode));
  return filtered.length > 0 ? filtered : order;
}

/**
 * Short content fingerprint of a manifest (version + every file's name,
 * size and SHA-256), used ONLY as a cache-key component so an engine
 * payload change under an unchanged Stockfish version still produces a
 * fresh cache (Prompt 7 version-mismatch guard). This is a cache-naming
 * hash, not a security check — integrity is enforced separately by the
 * real SHA-256 verification in verifyWasmIntegrity. cyrb53, hex-encoded.
 */
export function manifestFingerprint(manifest: EngineManifest): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const input = `${manifest.version}|${manifest.files
    .map((f) => `${f.name}:${f.size}:${f.sha256}`)
    .sort()
    .join('|')}`;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cache API cache name for one engine payload, e.g.
 * `chess-review-engine-v19.0.1` or, with a manifest fingerprint,
 * `chess-review-engine-v19.0.1-f0123abcd…` (Prompt 7: a payload change
 * under the same version must not reuse the old cache).
 */
export function engineCacheName(version: string, fingerprint?: string): string {
  const safe = version.replace(/[^0-9A-Za-z._-]/g, '') || 'unknown';
  const fp = fingerprint ? fingerprint.replace(/[^0-9a-f]/gi, '') : '';
  return fp ? `chess-review-engine-v${safe}-f${fp}` : `chess-review-engine-v${safe}`;
}

/** Human-readable size, 1024-based: 99076105 → "94.5 MB", 1845971 → "1.8 MB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------

/**
 * Raised when a downloaded WASM does not match the manifest SHA-256.
 *
 * Carries the structured diagnostic fields (`file` / `expected` /
 * `actual`) alongside the English `message`, so the UI layer can
 * recompose the sentence in the active locale at render time via
 * `formatEngineError` (src/engine/engineErrors.ts) — the loader that
 * throws this does not know the user's chosen locale. The English
 * message is kept as the fallback for non-localizing consumers.
 */
export class EngineIntegrityError extends Error {
  readonly code = 'engine-integrity-failed' as const;
  readonly file?: string;
  readonly expected?: string;
  readonly actual?: string;

  constructor(message: string, detail?: { file: string; expected: string; actual: string }) {
    super(message);
    this.name = 'EngineIntegrityError';
    if (detail) {
      this.file = detail.file;
      this.expected = detail.expected;
      this.actual = detail.actual;
    }
  }
}

export type Sha256Hasher = (bytes: Uint8Array) => Promise<string>;

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Default hasher backed by WebCrypto (`crypto.subtle`). */
export const subtleSha256Hasher: Sha256Hasher = async (bytes) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto (crypto.subtle) is not available in this context');
  // Copy into a fresh ArrayBuffer so the digest input type is exact.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return bytesToHex(await subtle.digest('SHA-256', copy.buffer));
};

export interface IntegrityResult {
  ok: boolean;
  actual: string;
  expected: string;
}

/**
 * Verify `bytes` against an expected SHA-256 hex digest. Pure apart from the
 * (injectable) hasher, so tests can supply a fake.
 */
export async function verifyWasmIntegrity(
  bytes: Uint8Array,
  expectedSha256: string,
  hasher: Sha256Hasher = subtleSha256Hasher,
): Promise<IntegrityResult> {
  const expected = expectedSha256.trim().toLowerCase();
  const actual = (await hasher(bytes)).trim().toLowerCase();
  return { ok: actual === expected, actual, expected };
}
