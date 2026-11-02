# Security policy and notes

## Reporting

This is a personal open-source project; report issues via the GitHub
repository's issue tracker. There is no bug bounty.

## Security headers

`next.config.js` is the single source of truth for the security header
set (CSP, `Permissions-Policy`, `Referrer-Policy`,
`X-Content-Type-Options`, COOP/COEP/CORP, `frame-ancestors`).
`vercel.json`, `netlify.toml`, `public/_headers` and the service
worker's injected response headers (`src/lib/swCore.mjs`) mirror it;
`tests/unit/security-headers.test.ts` imports the config and fails CI
if any surface drifts.

## Why script-src keeps 'unsafe-inline' (nonce evaluation, Round 2 Prompt 9)

Prompt 9 re-evaluated replacing the scoped `'unsafe-inline'` in
`script-src` with per-request nonces via Next.js middleware. **Not
adopted — it is not feasible for this app's delivery model**, for
reasons that are structural rather than configurational:

1. **Nonces require dynamic rendering.** Next.js applies a middleware
   nonce to a page's inline/Flight scripts only when the page is
   rendered per request. This app is statically generated and served
   from CDN/SW caches; switching every page to dynamic rendering to
   carry nonces would remove static generation entirely.
2. **The service worker serves a cached shell.** Offline loads (a core
   feature — the PWA works without network) are answered by the SW from
   its precache with the CSP in `src/lib/swCore.mjs`. A nonce minted by
   middleware on the original response is meaningless for SW-served
   documents, and client-side Flight scripts would still need it.
3. **The hash alternative was already tried and reverted** (Round 1):
   per the CSP spec, browsers ignore `'unsafe-inline'` when a hash or
   nonce is present, so hashing only the hand-written theme bootstrap
   blocked every Next.js Flight script and the app never rendered —
   caught by the Playwright suite at the time.
   `tests/unit/security-headers.test.ts` pins script-src to contain no
   `sha256-` for exactly this reason.

**Residual risk, stated plainly:** `'unsafe-inline'` in script-src
means an attacker who can already inject markup into a page could add
an inline script. The app's mitigations are that React escapes all
interpolated content by default, the codebase's only
`dangerouslySetInnerHTML` is a compile-time-constant theme bootstrap in
`src/app/layout.tsx`, no user content is rendered as HTML, and
`frame-ancestors 'none'`, COOP/COEP and the rest of the header set are
unaffected. The evaluation should be revisited if the app ever moves
off static generation.

## Dependency audit policy

CI runs `npm audit --omit=dev` (production dependencies) on every push.

- **Critical / high** findings in production dependencies: fix before
  the next release — upgrade, replace, or (if no fix exists) document
  the exposure here with a review date.
- **Moderate** findings: triage within a week; fix if a patched version
  exists without a breaking change, otherwise document here.
- **Low** findings and dev-only findings: informational; Dependabot's
  weekly grouped PRs are the routine update channel.

Audit state at Round 2's close (2026-11-01): the sandbox used for this
program blocks the npm audit endpoint (`policy_denied` from the managed
registry), so the audit could not be executed locally; the CI step is
the enforcing run and its result is the record. No audit findings were
fabricated for this document.

## Rate limiting and abuse

See the README's "API & security" section: shared KV-backed token
bucket when configured (fail-open with logging on KV outage),
per-instance in-memory otherwise; client-IP derivation and the
trusted-proxy requirement (`x-forwarded-for` must be edge-controlled)
are documented there.
