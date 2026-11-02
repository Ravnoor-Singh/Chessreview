// Prompt 11: security headers — one source of truth (next.config.js),
// mirrored in vercel.json / netlify.toml / public/_headers. This test
// fails if any surface drifts, and pins the CSP's required directives
// plus the sha256 of the inline theme script in layout.tsx.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const require = createRequire(join(root, 'package.json'));

// CSP tightening (post-Round-2 Prompt 1): next.config.js adds loopback
// connect-src allowances ONLY outside production. The drift guard pins
// the PRODUCTION policy — the one the static mirrors and the service
// worker carry — so the config must be loaded as a production build
// would load it, regardless of the test runner's own NODE_ENV.
Object.assign(process.env, { NODE_ENV: 'production' });

interface HeaderEntry {
  key: string;
  value: string;
}

async function nextConfigHeaders(): Promise<Map<string, string>> {
  const config = require(join(root, 'next.config.js')) as {
    headers: () => Promise<{ source: string; headers: HeaderEntry[] }[]>;
  };
  const rules = await config.headers();
  const global = rules.find((r) => r.source === '/:path*');
  if (!global) throw new Error('next.config.js has no global header rule');
  return new Map(global.headers.map((h) => [h.key, h.value]));
}

describe('security headers: surfaces in sync', () => {
  it('vercel.json, netlify.toml and public/_headers match next.config.js exactly', async () => {
    const expected = await nextConfigHeaders();
    expect(expected.size).toBe(8);

    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: HeaderEntry[] }[];
    };
    const vercelGlobal = vercel.headers.find((r) => r.source === '/(.*)');
    if (!vercelGlobal) throw new Error('vercel.json has no global header rule');
    expect(new Map(vercelGlobal.headers.map((h) => [h.key, h.value]))).toEqual(expected);

    const netlify = readFileSync(join(root, 'netlify.toml'), 'utf8');
    const headersFile = readFileSync(join(root, 'public/_headers'), 'utf8');
    for (const [key, value] of expected) {
      expect(netlify, `netlify.toml missing ${key}`).toContain(`${key} = "${value}"`);
      expect(headersFile, `public/_headers missing ${key}`).toContain(`${key}: ${value}`);
    }
  });
});

describe('cache headers: engine manifest + sw.js are no-cache (Prompt 2)', () => {
  const IMMUTABLE = 'public, max-age=31536000, immutable';

  async function nextCacheRules(): Promise<{ source: string; cache: string | undefined }[]> {
    const config = require(join(root, 'next.config.js')) as {
      headers: () => Promise<{ source: string; headers: HeaderEntry[] }[]>;
    };
    const rules = await config.headers();
    return rules.map((r) => ({
      source: r.source,
      cache: r.headers.find((h) => h.key === 'Cache-Control')?.value,
    }));
  }

  it('next.config.js: manifest + sw.js are no-cache, listed AFTER the immutable engine rule; payload stays immutable', async () => {
    const rules = await nextCacheRules();
    const manifest = rules.find((r) => r.source === '/engine/engine-manifest.json');
    const sw = rules.find((r) => r.source === '/sw.js');
    const engine = rules.find((r) => r.source === '/engine/:path*');
    expect(manifest?.cache).toBe('no-cache');
    expect(sw?.cache).toBe('no-cache');
    expect(engine?.cache).toBe(IMMUTABLE);
    // Generic-before-specific: when several header rules set the same
    // key, the LAST matching rule wins — verified live against
    // `next start` (bug-fix round, Prompt 2): with the specific rules
    // listed first, /engine/engine-manifest.json was served with the
    // immutable header. The static mirrors carry the same order.
    expect(rules.indexOf(manifest!)).toBeGreaterThan(rules.indexOf(engine!));
    expect(rules.indexOf(sw!)).toBeGreaterThan(rules.indexOf(engine!));
  });

  it('vercel.json mirrors the same cache rules in the same order', async () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: HeaderEntry[] }[];
    };
    const cacheOf = (source: string) =>
      vercel.headers
        .find((r) => r.source === source)
        ?.headers.find((h) => h.key === 'Cache-Control')?.value;
    expect(cacheOf('/engine/engine-manifest.json')).toBe('no-cache');
    expect(cacheOf('/sw.js')).toBe('no-cache');
    expect(cacheOf('/engine/(.*)')).toBe(IMMUTABLE);
    const sources = vercel.headers.map((r) => r.source);
    expect(sources.indexOf('/engine/engine-manifest.json')).toBeGreaterThan(
      sources.indexOf('/engine/(.*)'),
    );
    expect(sources.indexOf('/sw.js')).toBeGreaterThan(sources.indexOf('/engine/(.*)'));
  });

  it('netlify.toml and public/_headers mirror the same cache rules in the same order', () => {
    const netlify = readFileSync(join(root, 'netlify.toml'), 'utf8');
    const headersFile = readFileSync(join(root, 'public/_headers'), 'utf8');
    // netlify.toml blocks: the `for` line is followed by its Cache-Control.
    expect(netlify).toContain('for = "/engine/engine-manifest.json"');
    expect(netlify).toContain('for = "/sw.js"');
    expect(netlify.indexOf('for = "/engine/engine-manifest.json"')).toBeGreaterThan(
      netlify.indexOf('for = "/engine/*"'),
    );
    expect(netlify.indexOf('for = "/sw.js"')).toBeGreaterThan(netlify.indexOf('for = "/engine/*"'));
    // public/_headers blocks: path line followed by the header line.
    expect(headersFile).toContain('/engine/engine-manifest.json\n  Cache-Control: no-cache');
    expect(headersFile).toContain('/sw.js\n  Cache-Control: no-cache');
    expect(headersFile).toContain(`/engine/*\n  Cache-Control: ${IMMUTABLE}`);
    expect(headersFile.indexOf('/engine/engine-manifest.json')).toBeGreaterThan(
      headersFile.indexOf('/engine/*'),
    );
    expect(headersFile.indexOf('/sw.js')).toBeGreaterThan(headersFile.indexOf('/engine/*'));
    // Both static mirrors carry exactly two no-cache rules (manifest + sw.js).
    for (const [name, text] of [
      ['netlify.toml', netlify],
      ['public/_headers', headersFile],
    ] as const) {
      expect(text.match(/no-cache/g)?.length, `${name} must have exactly 2 no-cache rules`).toBe(2);
    }
  });

  it('no surface serves the manifest or sw.js as immutable', async () => {
    const rules = await nextCacheRules();
    for (const r of rules) {
      if (r.source === '/engine/engine-manifest.json' || r.source === '/sw.js') {
        expect(r.cache).not.toContain('immutable');
      }
    }
    const vercelText = readFileSync(join(root, 'vercel.json'), 'utf8');
    expect(vercelText).not.toMatch(/engine-manifest\.json"[^}]*immutable/);
    expect(vercelText).not.toMatch(/\/sw\.js"[^}]*immutable/);
  });
});

describe('Content-Security-Policy', () => {
  it('carries every directive the app needs (engine, workers, fallbacks, images)', async () => {
    const headers = await nextConfigHeaders();
    const csp = headers.get('Content-Security-Policy') ?? '';
    const directives = new Map(
      csp.split(';').map((d) => {
        const [name, ...rest] = d.trim().split(/\s+/);
        return [name, rest] as const;
      }),
    );
    expect(directives.get('default-src')).toEqual(["'self'"]);
    // WASM compilation + engine workers.
    expect(directives.get('script-src')).toContain("'wasm-unsafe-eval'");
    expect(directives.get('worker-src')).toEqual(expect.arrayContaining(["'self'", 'blob:']));
    // Client fallbacks (Lichess direct) + engine CDN mode. CSP tightening:
    // connect-src is EXACTLY these three in production — no bare https:
    // (any other host is unreachable, matching "all analysis is local")
    // and no loopback entries; a configured engine CDN contributes its
    // exact origin only (unset in this test environment).
    expect(directives.get('connect-src')).toEqual([
      "'self'",
      'https://lichess.org',
      'https://api.chess.com',
    ]);
    expect(directives.get('connect-src')).not.toContain('https:');
    expect(csp).not.toContain('http://localhost');
    expect(csp).not.toContain('http://127.0.0.1');
    // Image previews use blob: object URLs only — no data: anywhere, and
    // fonts are all self-hosted woff2 (no data:), sounds are same-origin
    // WAV files / Web Audio (media-src 'self' only).
    expect(directives.get('img-src')).toEqual(["'self'", 'blob:']);
    expect(directives.get('font-src')).toEqual(["'self'"]);
    expect(directives.get('media-src')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
  });

  it('no production surface carries a bare https: or a loopback connect-src entry', async () => {
    // The static mirrors cannot be conditional, so they must carry the
    // production policy verbatim: a bare `https:` token (followed by a
    // space, ';' or end — not the '//' of a named host) or any loopback
    // allowance in any of them would silently reopen the network.
    const surfaces: Record<string, string> = {
      'vercel.json': readFileSync(join(root, 'vercel.json'), 'utf8'),
      'netlify.toml': readFileSync(join(root, 'netlify.toml'), 'utf8'),
      'public/_headers': readFileSync(join(root, 'public/_headers'), 'utf8'),
      'src/lib/swCore.mjs': readFileSync(join(root, 'src/lib/swCore.mjs'), 'utf8'),
      'public/sw.js': readFileSync(join(root, 'public/sw.js'), 'utf8'),
    };
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text, `${name} must not contain a bare https: source`).not.toMatch(
        /(?:^|[\s;])https:(?=\s|;|$)/,
      );
      expect(text, `${name} must not allow localhost connect-src`).not.toContain(
        'http://localhost',
      );
      expect(text, `${name} must not allow 127.0.0.1 connect-src`).not.toContain(
        'http://127.0.0.1',
      );
    }
  });

  it('the standard header set is present', async () => {
    const headers = await nextConfigHeaders();
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });

  it("script-src has NO sha256 (a hash makes browsers ignore 'unsafe-inline')", async () => {
    // The theme bootstrap in layout.tsx is a static inline script; its
    // sha256 was originally added to script-src — and Chromium then
    // ignored 'unsafe-inline' (CSP spec: a hash/nonce in the source list
    // disables 'unsafe-inline'), which blocked Next.js's per-render
    // Flight scripts and left every page blank (caught by Playwright).
    // This test pins the lesson: never re-add a hash here.
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
    const m = /const themeScript = `([^`]*)`;/.exec(layout);
    if (!m) throw new Error('themeScript template literal not found in layout.tsx');
    const hash = createHash('sha256').update(m[1]).digest('base64');
    const headers = await nextConfigHeaders();
    const csp = headers.get('Content-Security-Policy') ?? '';
    expect(csp).not.toContain('sha256-');
    expect(csp).not.toContain(hash);
    expect(csp).toContain("'unsafe-inline'");
  });
});
