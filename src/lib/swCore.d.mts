// Type declarations for swCore.mjs (the runtime single source of truth for
// service-worker logic, inlined into public/sw.js by scripts/build-sw.mjs).

export const SW_VERSION: string;
export const ENGINE_VERSION: string;
export const APP_CACHE: string;
export const RUNTIME_CACHE: string;
export const ENGINE_CACHE_PREFIX: string;
export const LOADER_ENGINE_CACHE_PREFIX: string;

export function engineSwCacheName(version: string): string;
export const ENGINE_FINGERPRINT: string;
export function engineSwCurrentCacheName(): string;
export function currentCacheNames(): string[];
export function isEngineCacheName(name: string): boolean;
export function cachesToDelete(existingNames: readonly string[]): string[];

export const ENGINE_FILE_NAMES: string[];
export const ENGINE_MANIFEST_BASENAME: string;
export function engineEntryFileName(rawUrl: string, origin?: string): string | null;
export function engineEntriesToPurge(
  cachedUrls: readonly string[],
  currentFileNames: readonly string[],
): string[];

export const PIECE_SET_IDS: string[];
export const PIECE_CODES: string[];
export const SOUND_FILES: string[];
export const OPENING_FILES: string[];
export const ICON_FILES: string[];

export function precacheUrls(): string[];

export type SwRequestKind =
  | 'network-only'
  | 'engine'
  | 'engine-manifest'
  | 'static'
  | 'navigation'
  | 'runtime'
  | 'passthrough';

export function classifyRequest(
  rawUrl: string,
  options?: { method?: string; mode?: string; origin?: string },
): SwRequestKind;

export const SW_CONTENT_SECURITY_POLICY: string;
export const ISOLATION_HEADERS: Record<string, string>;
export function withIsolationHeaders(headers: Headers): Headers;
export function injectIsolationHeaders(response: Response): Response;
