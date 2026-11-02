import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  availableModes,
  buildCdnWorkerSource,
  engineCacheName,
  engineFileUrl,
  engineManifestUrl,
  fallbackOrder,
  filterFallbackOrder,
  findManifestFile,
  manifestFingerprint,
  formatFileSize,
  getEngineBaseUrl,
  isCrossOriginEngineBase,
  isMobileUserAgent,
  normalizeEngineBaseUrl,
  parseEngineManifest,
  resolveEngineUrls,
  verifyWasmIntegrity,
  type EngineManifest,
} from '@/engine/engineManifest';

describe('engine base URL resolution', () => {
  it('defaults to /engine for unset/empty values', () => {
    expect(normalizeEngineBaseUrl(undefined)).toBe('/engine');
    expect(normalizeEngineBaseUrl(null)).toBe('/engine');
    expect(normalizeEngineBaseUrl('')).toBe('/engine');
    expect(normalizeEngineBaseUrl('   ')).toBe('/engine');
  });

  it('strips trailing slashes and keeps the rest verbatim', () => {
    expect(normalizeEngineBaseUrl('/engine/')).toBe('/engine');
    expect(normalizeEngineBaseUrl('/static/engine//')).toBe('/static/engine');
    expect(normalizeEngineBaseUrl('https://cdn.example.com/engine/')).toBe(
      'https://cdn.example.com/engine',
    );
  });

  it('getEngineBaseUrl reflects NEXT_PUBLIC_ENGINE_BASE_URL normalization', () => {
    expect(getEngineBaseUrl()).toBe(
      normalizeEngineBaseUrl(process.env.NEXT_PUBLIC_ENGINE_BASE_URL),
    );
  });

  it('builds file and manifest URLs against default and CDN bases', () => {
    expect(engineFileUrl('/engine', 'stockfish-19.js')).toBe('/engine/stockfish-19.js');
    expect(engineManifestUrl('/engine')).toBe('/engine/engine-manifest.json');
    expect(engineManifestUrl('https://cdn.example.com/e')).toBe(
      'https://cdn.example.com/e/engine-manifest.json',
    );
  });

  it('resolves the three runtime builds to their shipped file names', () => {
    expect(resolveEngineUrls('/engine', 'multi')).toMatchObject({
      jsFile: 'stockfish-19.js',
      wasmFile: 'stockfish-19.wasm',
      jsUrl: '/engine/stockfish-19.js',
      wasmUrl: '/engine/stockfish-19.wasm',
    });
    expect(resolveEngineUrls('/engine', 'single')).toMatchObject({
      jsFile: 'stockfish-19-single.js',
      wasmFile: 'stockfish-19-single.wasm',
    });
    expect(resolveEngineUrls('https://cdn.example.com/engine', 'lite')).toMatchObject({
      jsFile: 'stockfish-19-lite-single.js',
      wasmFile: 'stockfish-19-lite-single.wasm',
      jsUrl: 'https://cdn.example.com/engine/stockfish-19-lite-single.js',
      wasmUrl: 'https://cdn.example.com/engine/stockfish-19-lite-single.wasm',
    });
  });
});

describe('fallback order', () => {
  it('multi degrades to single then lite', () => {
    expect(fallbackOrder('multi')).toEqual(['multi', 'single', 'lite']);
  });
  it('single degrades to lite only', () => {
    expect(fallbackOrder('single')).toEqual(['single', 'lite']);
  });
  it('lite is the last resort', () => {
    expect(fallbackOrder('lite')).toEqual(['lite']);
  });
});

describe('profile availability (Prompt 7)', () => {
  const file = (name: string) => ({ name, size: 100, sha256: 'd'.repeat(64) });
  const manifestWith = (names: string[]): EngineManifest => ({
    version: '19.0.1',
    generatedAt: '2026-11-01T00:00:00.000Z',
    files: names.map(file),
  });
  const ALL = [
    'stockfish-19.js',
    'stockfish-19.wasm',
    'stockfish-19-single.js',
    'stockfish-19-single.wasm',
    'stockfish-19-lite-single.js',
    'stockfish-19-lite-single.wasm',
  ];

  it('availableModes requires the complete .js + .wasm pair', () => {
    expect(availableModes(manifestWith(ALL)).sort()).toEqual(['lite', 'multi', 'single']);
    expect(
      availableModes(
        manifestWith(['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']),
      ),
    ).toEqual(['lite']);
    // A wasm without its .js (or vice versa) is not an available build.
    expect(availableModes(manifestWith(['stockfish-19.wasm']))).toEqual([]);
  });

  it('filterFallbackOrder drops unshipped builds and keeps the shipped fallback', () => {
    const liteOnly = manifestWith(['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']);
    expect(filterFallbackOrder(['multi', 'single', 'lite'], liteOnly)).toEqual(['lite']);
    const multiLite = manifestWith(
      ALL.filter((n) => n !== 'stockfish-19-single.js' && n !== 'stockfish-19-single.wasm'),
    );
    expect(filterFallbackOrder(['multi', 'single', 'lite'], multiLite)).toEqual(['multi', 'lite']);
    expect(filterFallbackOrder(['single', 'lite'], multiLite)).toEqual(['lite']);
  });

  it('filterFallbackOrder is a no-op for a null or unusable manifest', () => {
    expect(filterFallbackOrder(['multi', 'single', 'lite'], null)).toEqual([
      'multi',
      'single',
      'lite',
    ]);
    // A manifest listing nothing usable must not brick the engine.
    expect(filterFallbackOrder(['multi', 'lite'], manifestWith([]))).toEqual(['multi', 'lite']);
  });

  it('manifestFingerprint is stable and changes with any entry change', () => {
    const base = manifestWith(ALL);
    expect(manifestFingerprint(base)).toBe(manifestFingerprint(manifestWith(ALL)));
    const changed = manifestWith(ALL);
    changed.files[0] = { ...changed.files[0], sha256: 'e'.repeat(64) };
    expect(manifestFingerprint(changed)).not.toBe(manifestFingerprint(base));
    const fewer = manifestWith(ALL.slice(0, 4));
    expect(manifestFingerprint(fewer)).not.toBe(manifestFingerprint(base));
  });

  it('engineCacheName includes the fingerprint when given', () => {
    expect(engineCacheName('19.0.1')).toBe('chess-review-engine-v19.0.1');
    expect(engineCacheName('19.0.1', 'abcdef0123456789')).toBe(
      'chess-review-engine-v19.0.1-fabcdef0123456789',
    );
  });
});

describe('mobile + cross-origin detection', () => {
  it('detects mobile user agents', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe(
      true,
    );
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe(
      false,
    );
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe(false);
  });

  it('relative bases are never cross-origin', () => {
    expect(isCrossOriginEngineBase('/engine', 'https://app.example.com')).toBe(false);
    expect(isCrossOriginEngineBase('engine', 'https://app.example.com')).toBe(false);
  });

  it('absolute bases compare origins', () => {
    expect(
      isCrossOriginEngineBase('https://app.example.com/engine', 'https://app.example.com'),
    ).toBe(false);
    expect(
      isCrossOriginEngineBase('https://cdn.example.com/engine', 'https://app.example.com'),
    ).toBe(true);
  });

  it('CDN wrapper worker source importScripts the engine script', () => {
    const src = buildCdnWorkerSource('https://cdn.example.com/engine/stockfish-19.js');
    expect(src).toContain('importScripts("https://cdn.example.com/engine/stockfish-19.js")');
  });
});

describe('manifest parsing', () => {
  const valid: EngineManifest = {
    version: '19.0.1',
    generatedAt: '2026-10-31T00:00:00.000Z',
    files: [{ name: 'stockfish-19.wasm', size: 99076105, sha256: 'A'.repeat(64) }],
  };

  it('accepts a valid manifest and lowercases hashes', () => {
    const parsed = parseEngineManifest(valid);
    expect(parsed?.version).toBe('19.0.1');
    expect(parsed?.files[0].sha256).toBe('a'.repeat(64));
    expect(findManifestFile(parsed!, 'stockfish-19.wasm')?.size).toBe(99076105);
    expect(findManifestFile(parsed!, 'nope.wasm')).toBeUndefined();
  });

  it('rejects malformed manifests', () => {
    expect(parseEngineManifest(null)).toBeNull();
    expect(parseEngineManifest('x')).toBeNull();
    expect(parseEngineManifest({ version: 1, generatedAt: 'x', files: [] })).toBeNull();
    expect(parseEngineManifest({ version: '1', generatedAt: 'x', files: 'no' })).toBeNull();
    expect(
      parseEngineManifest({
        version: '1',
        generatedAt: 'x',
        files: [{ name: 'a', size: -1, sha256: 'a'.repeat(64) }],
      }),
    ).toBeNull();
    expect(
      parseEngineManifest({
        version: '1',
        generatedAt: 'x',
        files: [{ name: 'a', size: 1, sha256: 'not-a-hash' }],
      }),
    ).toBeNull();
  });

  it('derives a version-scoped cache name', () => {
    expect(engineCacheName('19.0.1')).toBe('chess-review-engine-v19.0.1');
    expect(engineCacheName('19.0.1 beta!')).toBe('chess-review-engine-v19.0.1beta');
  });

  it('formats file sizes for the footer', () => {
    expect(formatFileSize(99076105)).toBe('94.5 MB');
    expect(formatFileSize(1845971)).toBe('1.8 MB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(500)).toBe('500 B');
  });
});

describe('verifyWasmIntegrity', () => {
  const bytes = new TextEncoder().encode('hello engine');

  it('accepts matching hashes (case-insensitive) with an injected hasher', async () => {
    const fake = async () => 'AB'.repeat(32);
    const result = await verifyWasmIntegrity(bytes, 'ab'.repeat(32), fake);
    expect(result.ok).toBe(true);
    expect(result.actual).toBe('ab'.repeat(32));
    expect(result.expected).toBe('ab'.repeat(32));
  });

  it('reports a mismatch with both hashes', async () => {
    const fake = async () => '00'.repeat(32);
    const result = await verifyWasmIntegrity(bytes, 'ff'.repeat(32), fake);
    expect(result.ok).toBe(false);
    expect(result.actual).toBe('00'.repeat(32));
    expect(result.expected).toBe('ff'.repeat(32));
  });

  it('matches the real WebCrypto SHA-256 of known bytes', async () => {
    // SHA-256("hello") — well-known constant.
    const hello = new TextEncoder().encode('hello');
    const result = await verifyWasmIntegrity(
      hello,
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(result.ok).toBe(true);
  });
});

describe('generated public/engine manifest (postinstall artifact)', () => {
  it('lists exactly the default shipped set with correct sizes and hashes', () => {
    const raw = readFileSync(
      new URL('../../public/engine/engine-manifest.json', import.meta.url),
      'utf8',
    );
    const manifest = parseEngineManifest(JSON.parse(raw) as unknown);
    expect(manifest, 'public/engine/engine-manifest.json must be a valid manifest').not.toBeNull();
    expect(manifest!.version).toBe('19.0.1');
    const names = manifest!.files.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        'stockfish-19-lite-single.js',
        'stockfish-19-lite-single.wasm',
        'stockfish-19-single.js',
        'stockfish-19-single.wasm',
        'stockfish-19.js',
        'stockfish-19.wasm',
      ].sort(),
    );
    // The unused builds must not be in the default set.
    expect(names).not.toContain('stockfish-19-asm.js');
    expect(names).not.toContain('stockfish-19-lite.js');
    expect(names).not.toContain('stockfish-19-lite.wasm');
    for (const file of manifest!.files) {
      const path = new URL(`../../public/engine/${file.name}`, import.meta.url);
      expect(statSync(path).size, `${file.name} size`).toBe(file.size);
      const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(digest, `${file.name} sha256`).toBe(file.sha256);
    }
    // The two full WASMs are different builds (different hashes) — both are
    // needed because multi and single are distinct binaries.
    const multi = findManifestFile(manifest!, 'stockfish-19.wasm')!;
    const single = findManifestFile(manifest!, 'stockfish-19-single.wasm')!;
    expect(multi.sha256).not.toBe(single.sha256);
  });
});
