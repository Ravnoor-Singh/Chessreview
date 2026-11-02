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
    // Client fallbacks (Lichess direct) + engine CDN mode.
    expect(directives.get('connect-src')).toEqual(
      expect.arrayContaining(["'self'", 'https://lichess.org', 'https://api.chess.com', 'https:']),
    );
    // Image previews.
    expect(directives.get('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
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
