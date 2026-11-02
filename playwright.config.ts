import { defineConfig, devices } from '@playwright/test';

// Round 2, Prompt 4 — heavy/light split + the no-isolation project.
//
// Heavy specs run REAL Stockfish analyses end to end (minutes on the
// 4-core reference VM). They live in the `heavy` project (and, for the
// pool spec, in `chromium-noiso`) and run with workers: 1 — K3's root
// cause was two heavy analyses in parallel starving each other of CPU
// until an assertion timed out. Everything else is light (the
// `chromium` project) and is the fast PR gate:
//
//   npm run test:e2e:light   → chromium project only
//   npm run test:e2e:heavy   → heavy + chromium-noiso projects
//   npm run test:e2e         → everything
//
// The `chromium-noiso` project serves a NOISO=1 build (no COOP/COEP
// headers → crossOriginIsolated === false) on port 3101 so the pool spec
// can prove the single-thread fallback engages in a real browser. It is
// only defined when E2E_NOISO=1 (the heavy/all npm scripts set it and
// build the variant first), so light runs never pay for the second build.
const NOISO = process.env.E2E_NOISO === '1';
// Prompt 7: the CDN project serves a build whose engine base URL points
// at a DIFFERENT origin (scripts/serve-engine-cdn.mjs on :3202, app on
// :3103) to prove the external-engine deployment works cross-origin with
// the multi-threaded build. Only defined with E2E_CDN=1; build it first
// with `npm run build:cdn` (which also sets the base URL).
const CDN = process.env.E2E_CDN === '1';
// Prompt 7: the lite project serves an ENGINE_BUNDLE=lite-only build
// (port 3104) to prove profile behavior in a real browser: the settings
// drawer offers only the shipped build, and analysis runs on lite.
// Only defined with E2E_LITE=1; build first with `npm run build:lite`.
const LITE = process.env.E2E_LITE === '1';

const HEAVY_SPECS = [
  '**/review.spec.ts',
  '**/pool.spec.ts',
  '**/termination.spec.ts',
  '**/chesscom-link.spec.ts',
  '**/visual.spec.ts',
  '**/cdn.spec.ts',
  '**/lite.spec.ts',
  // Privacy proof (CSP Prompt 1): a full real analysis, so it is heavy
  // even though it lives next to the light security spec thematically.
  '**/privacy.spec.ts',
];

// The heavy project runs against the STANDARD build on :3100, so it must
// not claim the two specs that need their own deployments: cdn.spec.ts
// belongs only to chromium-cdn (E2E_CDN=1, :3103) and lite.spec.ts only
// to chromium-lite (E2E_LITE=1, :3104). Until Prompt 9 they were in the
// heavy testMatch too, so a full `playwright test` (or the CI heavy job)
// ran them against the wrong build and they failed spuriously — the
// Prompt 8 gate's e2e log shows exactly those failures (see §20).
const HEAVY_CORE_SPECS = HEAVY_SPECS.filter(
  (s) => s !== '**/cdn.spec.ts' && s !== '**/lite.spec.ts',
);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' },
      testIgnore: HEAVY_SPECS,
    },
    {
      name: 'heavy',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' },
      testMatch: HEAVY_CORE_SPECS,
      workers: 1,
    },
    ...(NOISO
      ? [
          {
            name: 'chromium-noiso',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3101' },
            testMatch: ['**/pool.spec.ts'],
            workers: 1,
          },
        ]
      : []),
    ...(CDN
      ? [
          {
            name: 'chromium-cdn',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3103' },
            testMatch: ['**/cdn.spec.ts'],
            workers: 1,
          },
        ]
      : []),
    ...(LITE
      ? [
          {
            name: 'chromium-lite',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3104' },
            testMatch: ['**/lite.spec.ts'],
            workers: 1,
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: 'npm run start',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 120_000,
      // ENABLE_THEME_GALLERY=1 (Post-Round-2 Prompt 3): /theme-gallery
      // is dev/test-only and 404s in production without this flag; the
      // contact-sheet spec (tests/e2e/themes-gallery.spec.ts, in the
      // `chromium` project) screenshots it, so the shared :3100 test
      // server opts in. The flag affects only that one route — every
      // other spec is served exactly as before. (webServer entries are
      // global, not per-project, and the gallery spec shares this
      // server/port with the `heavy` project, so the flag cannot be
      // scoped any narrower than this entry.)
      env: { PORT: '3100', ENABLE_THEME_GALLERY: '1' },
    },
    ...(NOISO
      ? [
          {
            command: 'npm run start:noiso',
            url: 'http://localhost:3101',
            reuseExistingServer: true,
            timeout: 120_000,
            env: { PORT: '3101' },
          },
        ]
      : []),
    ...(CDN
      ? [
          {
            command: 'node scripts/serve-engine-cdn.mjs',
            url: 'http://localhost:3202/engine/engine-manifest.json',
            reuseExistingServer: true,
            timeout: 30_000,
            env: { CDN_PORT: '3202' },
          },
          {
            command: 'npm run start:cdn',
            url: 'http://localhost:3103',
            reuseExistingServer: true,
            timeout: 120_000,
            env: { PORT: '3103' },
          },
        ]
      : []),
    ...(LITE
      ? [
          {
            command: 'npm run start:lite',
            url: 'http://localhost:3104',
            reuseExistingServer: true,
            timeout: 120_000,
            env: { PORT: '3104' },
          },
        ]
      : []),
  ],
});
