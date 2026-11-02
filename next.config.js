/** @type {import('next').NextConfig} */

// Security headers (Prompt 11) — SINGLE SOURCE OF TRUTH is this list.
// vercel.json, netlify.toml and public/_headers mirror the same values by
// hand; tests/unit/security-headers.test.ts imports this config and fails
// if any surface drifts.
//
// CSP design (full justification in README "API & security"):
// - script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'.
//   'wasm-unsafe-eval' is required to compile the Stockfish WASM;
//   'unsafe-inline' is required because Next.js App Router inlines
//   per-render Flight payload scripts that cannot be hashed (nonce-ing
//   them would force every page dynamic and fight the SW precache).
//   A sha256 of the one hand-written inline script (the theme bootstrap
//   in src/app/layout.tsx) was tried first and REMOVED: per the CSP
//   spec, browsers IGNORE 'unsafe-inline' whenever a hash or nonce is
//   present in the source list, so hash + 'unsafe-inline' together
//   blocked every Flight script and the app never rendered (caught by
//   the Playwright suite). tests/unit/security-headers.test.ts pins
//   script-src to contain no 'sha256-' for exactly this reason.
// - worker-src 'self' blob: — Stockfish worker file, or a Blob wrapper
//   for a cross-origin engine CDN base.
// - connect-src 'self' + lichess.org / api.chess.com (client fallbacks)
//   + the configured engine-CDN origin only (NEXT_PUBLIC_ENGINE_BASE_URL
//   is build-time; its origin is added explicitly — there is NO bare
//   https: allowance, so no other host can be contacted; the loader also
//   verifies the WASM SHA-256 against the manifest before running it).
//   Loopback allowances exist only outside production builds (locally
//   served engine bases in dev / the CDN e2e); the static mirrors
//   (vercel.json, netlify.toml, public/_headers) and the SW policy carry
//   the production form with no loopback entries.
// - img-src 'self' blob: — same-origin pieces; blob: covers image-import
//   previews and custom backgrounds (object URLs; no data: URIs are
//   constructed anywhere in src/). font-src 'self' — every font is a
//   self-hosted woff2. media-src 'self' — sounds are same-origin WAV
//   files or Web Audio oscillators. frame-ancestors 'none'
//   (+ X-Frame-Options).
//
// Prompt 7 fix (found by tests/e2e/cdn.spec.ts): the cross-origin engine
// wrapper is a Blob worker that importScripts the engine script from the
// CDN origin — and a worker INHERITS the page's CSP, so with script-src
// limited to 'self' the browser blocked that load before any network
// request, even though connect-src allowed the manifest/WASM fetches.
// When an engine base URL is configured at build time, its origin is
// therefore added to script-src / worker-src / child-src below (worker-src
// also covers the multi build's pthread workers, which load the engine
// script from the same origin). Static-host header files (vercel.json,
// netlify.toml, public/_headers) cannot compute this — the README's CDN
// recipe tells those deployers to add the origin themselves. The service
// worker's injected CSP (src/lib/swCore.mjs) stays static for the same
// reason; a CDN-mode app shell served FROM the SW cache while offline
// keeps the static policy, which is documented in the recipe.
const ENGINE_BASE_RAW =
  process.env.NEXT_PUBLIC_ENGINE_BASE_URL ?? process.env.ENGINE_BASE_URL ?? '';
let ENGINE_ORIGIN = '';
try {
  ENGINE_ORIGIN = new URL(ENGINE_BASE_RAW).origin;
} catch {
  // Relative or unset base (same-origin engine): nothing to add.
}
const ENGINE_ORIGIN_SUFFIX = ENGINE_ORIGIN ? ` ${ENGINE_ORIGIN}` : '';
// Loopback connect-src allowances (Prompt 7) exist ONLY outside
// production: they cover a locally served engine base during development
// and local test servers. A production build (NODE_ENV=production) never
// emits them, and neither do the static mirrors or the SW policy. The
// cross-origin CDN e2e no longer needs them: its engine base is
// configured, so its exact origin arrives via ENGINE_ORIGIN_SUFFIX.
const LOOPBACK_CONNECT_SUFFIX =
  process.env.NODE_ENV === 'production' ? '' : ' http://localhost:* http://127.0.0.1:*';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'${ENGINE_ORIGIN_SUFFIX}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  `worker-src 'self' blob:${ENGINE_ORIGIN_SUFFIX}`,
  `child-src 'self' blob:${ENGINE_ORIGIN_SUFFIX}`,
  // No bare https: — the only cross-origin connect targets are the two
  // named importer fallbacks plus the configured engine origin (if any).
  `connect-src 'self' https://lichess.org https://api.chess.com${ENGINE_ORIGIN_SUFFIX}${LOOPBACK_CONNECT_SUFFIX}`,
  "media-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// NOISO=1 builds/serves a variant WITHOUT the cross-origin isolation
// headers (Round 2, Prompt 4): the Playwright pool spec runs this variant
// on a second port to prove the single-thread pool fallback engages in a
// real browser when crossOriginIsolated is false. Production builds never
// set NOISO, and tests/unit/security-headers.test.ts imports this config
// with the variable unset, so the pinned production header set is exactly
// what it was before this variant existed.
const NOISO = process.env.NOISO === '1';

const isolationHeaders = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  ...(NOISO ? [] : isolationHeaders),
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Prompt 7: ENGINE_BASE_URL is accepted as an alias for the canonical
  // NEXT_PUBLIC_ENGINE_BASE_URL (the Round 2 spec names the short form;
  // the loader reads the NEXT_PUBLIC_ one, inlined at build time).
  env: {
    NEXT_PUBLIC_ENGINE_BASE_URL:
      process.env.NEXT_PUBLIC_ENGINE_BASE_URL ?? process.env.ENGINE_BASE_URL ?? '',
  },
  ...(NOISO ? { distDir: '.next-noiso' } : {}),
  ...(process.env.CDN ? { distDir: '.next-cdn' } : {}),
  ...(process.env.LITE ? { distDir: '.next-lite' } : {}),
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/engine/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Prompt 2 (engine/SW caching): the engine manifest and sw.js must
      // NEVER be cached immutably — their URLs never change, so a stale
      // copy would hide every future engine/SW update behind it. They are
      // `no-cache` (revalidate on every load; the 304 path keeps this
      // cheap). These specific rules come AFTER the generic immutable
      // engine rule above: when several header rules set the same key,
      // the LAST matching rule wins (verified against `next start` —
      // with the opposite order the manifest was served immutable).
      // The static mirrors (vercel.json, netlify.toml, public/_headers)
      // carry the same order, and the drift-guard test pins both the
      // values and this order. The stockfish-19*.js/.wasm payload files
      // keep the immutable rule: their names carry the engine version,
      // and the SW engine cache is additionally keyed by a SHA-256
      // fingerprint of the manifest (see scripts/build-sw.mjs), so
      // changed bytes under the same name still invalidate.
      {
        source: '/engine/engine-manifest.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/pieces/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/openings/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};
// Bundle analysis (Round 2, Prompt 6): ANALYZE=true npm run build writes
// treemap reports to .next/analyze/. No effect on normal builds.
// (This file is CommonJS by Next.js convention, hence the require.)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
