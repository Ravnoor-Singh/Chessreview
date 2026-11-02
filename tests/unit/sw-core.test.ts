import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_CACHE,
  ENGINE_VERSION,
  RUNTIME_CACHE,
  cachesToDelete,
  classifyRequest,
  currentCacheNames,
  engineSwCacheName,
  engineSwCurrentCacheName,
  injectIsolationHeaders,
  isEngineCacheName,
  precacheUrls,
  SW_CONTENT_SECURITY_POLICY,
  withIsolationHeaders,
} from '@/lib/swCore.mjs';

// The SW is generated from swCore.mjs (scripts/build-sw.mjs inlines it into
// public/sw.js), so these tests exercise the exact shipped logic.

const ORIGIN = 'https://chess.example';

describe('sw cache names', () => {
  it('versions the dedicated engine cache by the engine version', () => {
    expect(engineSwCacheName('19.0.1')).toBe('chess-review-sw-engine-v19.0.1');
    expect(engineSwCacheName('19.0.1 beta!')).toBe('chess-review-sw-engine-v19.0.1beta');
    expect(engineSwCacheName('')).toBe('chess-review-sw-engine-vunknown');
  });

  it('ENGINE_VERSION matches the generated engine manifest (bump both together)', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'public', 'engine', 'engine-manifest.json'), 'utf8'),
    ) as { version: string };
    expect(ENGINE_VERSION).toBe(manifest.version);
  });

  it('recognizes both SW and loader engine caches', () => {
    expect(isEngineCacheName('chess-review-sw-engine-v19.0.1')).toBe(true);
    expect(isEngineCacheName('chess-review-engine-v19.0.1')).toBe(true);
    expect(isEngineCacheName(APP_CACHE)).toBe(false);
    expect(isEngineCacheName('other-app-cache')).toBe(false);
  });

  it('activate deletes stale app caches and old engine versions, keeps current + loader caches', () => {
    const existing = [
      APP_CACHE,
      RUNTIME_CACHE,
      engineSwCurrentCacheName(),
      'chess-review-app-v0',
      'chess-review-runtime-v0',
      'chess-review-sw-engine-v18.0.0',
      'chess-review-engine-v19.0.1', // loader-owned: SW must not delete it
      'someone-elses-cache',
    ];
    expect(cachesToDelete(existing).sort()).toEqual(
      ['chess-review-app-v0', 'chess-review-runtime-v0', 'chess-review-sw-engine-v18.0.0'].sort(),
    );
    expect(currentCacheNames()).toContain(APP_CACHE);
  });

  it('the current engine cache name carries the payload fingerprint (Prompt 7)', () => {
    // Raw swCore carries the 'dev' placeholder; build-sw stamps the real
    // manifest fingerprint into the generated worker (asserted below).
    expect(engineSwCurrentCacheName()).toBe('chess-review-sw-engine-v19.0.1-fdev');
    expect(currentCacheNames()).toContain(engineSwCurrentCacheName());
    // The un-fingerprinted name (a previous build's cache) is stale and
    // must be deleted on activate — that is the mismatch guard working.
    expect(cachesToDelete([engineSwCacheName(ENGINE_VERSION)])).toEqual([
      engineSwCacheName(ENGINE_VERSION),
    ]);
  });

  it('the GENERATED public/sw.js carries a real manifest fingerprint, not the placeholder', () => {
    let sw: string;
    try {
      sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    } catch {
      return; // sw.js is a build artifact; nothing to assert pre-build.
    }
    const match = sw.match(/const ENGINE_FINGERPRINT = '([^']+)'/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toBe('dev');
    expect(match![1]).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('precache list', () => {
  const urls = precacheUrls();

  it('covers the app shell, manifest, icons, all piece sets, openings and sounds', () => {
    expect(urls).toContain('/');
    expect(urls).toContain('/review');
    expect(urls).toContain('/manifest.webmanifest');
    expect(urls).toContain('/icons/icon-192.png');
    expect(urls).toContain('/icons/icon-512.png');
    expect(urls).toContain('/icons/icon-maskable-512.png');
    for (const set of ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast']) {
      for (const code of ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']) {
        expect(urls).toContain(`/pieces/${set}/${code}.svg`);
      }
    }
    for (const f of ['a.tsv', 'b.tsv', 'c.tsv', 'c2.tsv', 'd.tsv', 'e.tsv']) {
      expect(urls).toContain(`/openings/${f}`);
    }
    for (const f of [
      'move.wav',
      'capture.wav',
      'check.wav',
      'castle.wav',
      'promote.wav',
      'end.wav',
    ]) {
      expect(urls).toContain(`/sounds/${f}`);
    }
  });

  it('does NOT precache hashed chunks or the engine payload (runtime-cached instead)', () => {
    expect(urls.some((u) => u.includes('_next'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/engine/'))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every precache URL exists under public/ (except the two document routes)', () => {
    for (const url of urls) {
      if (url === '/' || url === '/review') continue;
      const onDisk = readFileSync(join(__dirname, '..', '..', 'public', url));
      expect(onDisk.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyRequest', () => {
  const at = (path: string, opts: Record<string, unknown> = {}) =>
    classifyRequest(`${ORIGIN}${path}`, { origin: ORIGIN, ...opts });

  it('never caches API routes or non-GET requests', () => {
    expect(at('/api/chesscom?user=x')).toBe('network-only');
    expect(at('/api/lichess?id=1')).toBe('network-only');
    expect(at('/pieces/cburnett/wN.svg', { method: 'POST' })).toBe('network-only');
  });

  it('routes engine files to the dedicated cache', () => {
    expect(at('/engine/stockfish-19.wasm')).toBe('engine');
    expect(at('/engine/engine-manifest.json')).toBe('engine');
  });

  it('routes hashed static chunks to the runtime cache', () => {
    expect(at('/_next/static/chunks/main-abc123.js')).toBe('static');
    expect(at('/_next/static/css/def456.css')).toBe('static');
  });

  it('classifies navigations and generic same-origin assets', () => {
    expect(at('/', { mode: 'navigate' })).toBe('navigation');
    expect(at('/review', { mode: 'navigate' })).toBe('navigation');
    expect(at('/pieces/neo/bQ.svg')).toBe('runtime');
    expect(at('/openings/c2.tsv')).toBe('runtime');
    expect(at('/manifest.webmanifest')).toBe('runtime');
  });

  it('passes cross-origin requests through untouched', () => {
    expect(classifyRequest('https://cdn.example.com/engine/x.wasm', { origin: ORIGIN })).toBe(
      'passthrough',
    );
  });
});

describe('isolation header injection', () => {
  it('sets COOP/COEP/CORP without mutating the input headers', () => {
    const input = new Headers({ 'Content-Type': 'text/html' });
    const out = withIsolationHeaders(input);
    expect(out.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(out.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(out.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(out.get('Content-Type')).toBe('text/html');
    expect(input.get('Cross-Origin-Opener-Policy')).toBeNull();
  });

  it('injects into a real Response, preserving status and body', async () => {
    const res = new Response('hello', { status: 200, headers: { 'X-Test': '1' } });
    const injected = injectIsolationHeaders(res);
    expect(injected).not.toBe(res);
    expect(injected.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(injected.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(injected.headers.get('X-Test')).toBe('1');
    await expect(injected.text()).resolves.toBe('hello');
  });

  it('returns opaque / status-0 responses untouched', () => {
    const fake = { type: 'opaque', status: 0 } as unknown as Response;
    expect(injectIsolationHeaders(fake)).toBe(fake);
  });

  it('also injects the Prompt 11 security headers (CSP, nosniff, frame, referrer)', () => {
    const out = withIsolationHeaders(new Headers());
    expect(out.get('Content-Security-Policy')).toBe(SW_CONTENT_SECURITY_POLICY);
    expect(out.get('X-Content-Type-Options')).toBe('nosniff');
    expect(out.get('X-Frame-Options')).toBe('DENY');
    expect(out.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(out.get('Permissions-Policy')).toContain('camera=()');
  });

  it('SW CSP is byte-identical to the next.config.js CSP (single source)', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(join(__dirname, '..', '..', 'package.json'));
    const config = require(join(__dirname, '..', '..', 'next.config.js')) as {
      headers: () => Promise<{ headers: { key: string; value: string }[] }[]>;
    };
    const rules = await config.headers();
    const csp = rules[0].headers.find((h) => h.key === 'Content-Security-Policy');
    expect(csp?.value).toBe(SW_CONTENT_SECURITY_POLICY);
  });
});
