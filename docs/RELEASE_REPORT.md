# Chess Review — Release Report (Round 2, FINAL — Prompt 11)

**Date:** 2026-11-02 · **Scope executed:** Round 2 Prompts 3–11 of
`~/workspace/user/files/chess-review-round2-fix-prompts.md` (Prompts 1–2 and Fix 0 were
completed before this run; Round 1's program is the history in Part II below). Every number
in Part I comes from a command actually run in this environment; anything not run says so.
**No deployment was made** (deployment is handled separately).

---

# Part I — Final verification (Prompt 11)

## 1. Fresh-checkout verification (clean copy, generated dirs excluded)

Run in a pristine copy of the source tree (no `node_modules`, `.next`, `public/engine`,
`public/sw.js`, coverage or test-results):

| Step | Result |
| --- | --- |
| `npm ci` | **exit 0** — postinstall regenerated `public/engine` (191 MB) from the stockfish package |
| `npm run typecheck` / `lint` / `format:check` / `check:unused` | **all exit 0** (lint zero findings) |
| `npm run i18n:check` | **574 keys × 4 locales**, placeholders aligned |
| `npm run glossary:check` | 21 canonical terms match; Stockfish intact |
| `npm run test:coverage` | **831/831 (79 files)**; global lines **74.6%** (floor 72), branches 80.75%, functions 69.18%; critical modules ≥90% |
| `npm run test:integration` | **exit 0** (real-engine integration) |
| `npm run build` **with network disabled** (`unshare -n`) | **exit 0** — fully offline after install |
| `npm run test:e2e` (all projects) | **41/41, three consecutive runs** (4.8m / 4.9m / 5.0m) |
| `npm run engine:report` | all-profiles 200,180,816 B (190.91 MiB); a visitor downloads ONE build: multi 94.52 MiB, single 94.60 MiB, lite 1.79 MiB |

Full unit suite in the main tree at the Prompt 10 gate: **854/854 (81 files)**.
Bundle budgets enforced in the build: `/` First Load JS **147.8 KB gzip** (budget 170),
`/review` **185.6 KB** (budget 220) — down from 229.1 / 261.9 KB before Round 2 Prompt 6.
CDN-mode and lite-mode e2e passed 1/1 each at the Prompt 9 gate on this code line; re-runs
inside the clone were blocked by this sandbox's filesystem write-denial episodes (EPERM —
see §5), not by test failures. Lighthouse: accessibility / best-practices / SEO are
**1.00** on both routes (asserted as errors in CI); performance medians on this VM are
**0.71 (`/`)** and **0.57 (`/review`)** — below the 0.95/0.90 targets, recorded honestly in
§17 and asserted as warnings, because this shared 4-core VM's CPU throttling dominates
TBT (8.6 s on `/review`); the axe suite passes with zero violations (one documented,
scoped exception).

## 2. Requirements checklist (evidence in Part II sections)

- **Inputs** — PGN **PASS** (§13); FEN **PASS**; chess.com link + username **PASS** (§13,
  official-archives search); chess.com username browsing **PASS** (§13); Lichess link
  **PASS**; image import **PARTIAL** — screenshots 100.00%, rotated+compressed 97.92%,
  physical-board photos 28.65% → Beta label shown (§19).
- **Engine** — Stockfish 19.0.1 version shown in UI **PASS**; multi-threaded **PASS**
  (pool e2e, isolated); single-thread pool **PASS** (chromium-noiso e2e); lite fallback
  **PASS** (lite e2e); adaptive budget with per-move depth reporting **PASS** (§14);
  cancellation **PASS**; position cache **PASS** (incl. the repetition-key bug found and
  fixed in §16).
- **Review** — accuracy **PASS** (Lichess-validated, mean |diff| 0.35 pts, Round 1);
  classifications, all classes **PASS**; runtime-depth calibration **PARTIAL** — label
  agreement with fixed-depth-18 missed its targets (K4 below); openings + theory
  continuations **PASS**; eval bar (meter) + eval graph (slider) **PASS**; engine lines,
  suggestion arrows, move feedback, Retry mode, variations with live analysis, WDL bar,
  clocks, statistics panel — all **PASS**.
- **Game endings** — every ending type **PASS** (28 termination tests + e2e); Chess960
  **PASS as designed** (honestly rejected with a localized screen — chess.js cannot
  generate 960 castling); broken-PGN recovery **PASS**; 400-ply games **PASS**.
- **UI** — five piece sets, six board themes, light + dark, responsive layouts,
  keyboard-operable board, sounds, settings — **PASS**; four languages **PASS** (§21).
- **Platform** — PWA install + offline analysis **PASS** (offline e2e); API hardening
  **PASS**; shared KV rate limiter **PASS** (§20); CSP + security headers **PASS**
  (five-surface drift guard); engine bundle profiles + CDN mode **PASS** (§18).
- **Quality** — coverage thresholds **PASS**; e2e stability **PASS** (3× 41/41 above);
  visual regression **PASS** (8/8 in every full run); axe **PASS**; bundle budgets
  **PASS**; Lighthouse budgets **PARTIAL** (performance on this VM, above).
- **Legal** — GPL notices **PASS**; LICENSES.md complete (engine, openings dataset,
  piece sets, Inter + Noto fonts, sounds, fixture games) **PASS**; footer source link
  **PASS**; no proprietary chess.com assets **PASS** (vision fixtures are lichess
  captures + openly licensed photos, all in `tests/fixtures/vision/SOURCES.md`).

## 3. Known issues, ranked

1. **K4 — Preset↔depth-18 classification agreement below target.** Label-difference
   rates vs fixed d18: Quick 28.7%, Standard 25.9%, Deep 19.6% (targets ≤8%/≤4%).
   Root cause is Stockfish's own depth variance (its best move differs from its d18
   choice on 19.5–26.3% of positions); mean |Δcp| did improve 132.6 → 40.5 vs Round 1.
   No honest fix inside WASM Stockfish; labels are calibrated at runtime depth and the
   UI reports the depth used. *Effort to "fix": not applicable — accept and disclose.*
2. **Image-import photos at 28.65%** (n=3 licensed photos) — below the 85% Beta bar, so
   the Beta label is shown and the review step is mandatory. Causes: detection geometry
   under perspective (2 photos) and an exotic piece set (1). The ML training pipeline
   ships (`scripts/train-piece-classifier.py`) but no model was trained — no PyTorch in
   this environment. *Effort: days (data + training + eval).*
3. **Lighthouse performance on this VM** (0.71 / 0.57 vs 0.95 / 0.90 targets) — TBT is
   dominated by engine WASM parse on a throttled shared CPU. *Effort: hours to
   re-measure on representative hardware; budgets already enforced for the other three
   categories.*
4. **K7 — Hindi/Spanish/Punjabi are machine-assisted and unreviewed.** The glossary,
   consistency check and CSV review round-trip now exist (§21); closing this needs
   native-speaker reviewers, not code. *Effort: external.*
5. **Standard preset takes ~240 s for an 82-ply game on this VM** (60 s target) —
   hardware-bound; Quick and the adaptive budget keep the app responsive, and the UI
   shows live depth so the trade-off is visible. *Effort: none honest on this hardware.*
6. **Chess960 analysis is rejected by design** (chess.js 1.4 generates standard
   castling only). *Effort: days (a 960-capable move generator) if ever wanted.*
7. **`npm audit` cannot run in this sandbox** (the managed registry denies the audit
   endpoint); CI runs `npm audit --omit=dev --audit-level=high` with the policy in
   SECURITY.md. *Effort: none — CI is the enforcing run.*
8. **Docker image build unverified** — `docker-compose.yml` ships, but Docker is not
   available on this VM. *Effort: minutes on a Docker host.*

## 4. Go / No-Go

- Engine & analysis core: **GO** (calibration limits disclosed under K4).
- Review UI & platform (PWA, API, profiles, CDN): **GO**.
- Image import: **GO with Beta label** (screenshots production-ready; photos explicitly
  experimental).
- i18n: **GO** with machine-assisted status disclosed in-product and in the README.
- Performance budgets: **GO** for bundle/a11y/BP/SEO; **NO-GO claim** for the Lighthouse
  performance targets on this hardware — they are neither met nor claimed.
- **Overall: GO** as an incremental release over Round 1, with the disclosures above.

## 5. Environment note (verification integrity)

This sandbox's managed filesystem intermittently denies writes (EPERM) in episodes
lasting minutes to ~an hour; during Prompt 10 one episode truncated installed packages
and a generated file. All gate numbers in this report were taken only after integrity
verification (every `package.json` in the tree parses; zero-length files confirmed
against pristine published tarballs; a service restart cleared the worst episode). Two
Prompt 11 re-runs (CDN/lite e2e inside the clone) were blocked by a recurrence and are
reported as not-run rather than passed; their Prompt 9 passes stand on the same code.
The Prompt 11 short bench re-run and a fresh Lighthouse CI run were blocked by the same
recurrence; the bench comparison therefore rests on the Prompt 3 study (§14, same
harness, same VM class) and the Lighthouse numbers on the Prompt 6 medians (§17) —
both labeled as such wherever they are cited above.

---

# Part II — History: Round 1 release report and Round 2 addenda (§§12–21)

# Chess Review — Release Report

**Date:** 2026-11-01 · **Scope executed:** Prompts 1–11 of the 15-prompt improvement program in
`~/workspace/user/files/chess-review-fix-prompts.md`, plus the Prompt 10 review-fix pass.
**Prompts 12, 13, 14 were not executed** and **Prompt 15 is partial** — the program was cut short
at the user's explicit speed request on 2026-11-01. Everything marked PASS below was actually run;
anything not run says so.

---

## 1. Final verification (Prompt 15, core gates — run by the coordinator, 2026-11-01)

From a clean install in `~/workspace/chess-review/`:

| Gate                 | Result                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| `npm ci`             | ✅ PASS (clean install incl. engine postinstall regeneration)             |
| `npx tsc --noEmit`   | ✅ PASS (strict, zero errors)                                             |
| `npm run lint`       | ✅ PASS (ESLint, zero findings)                                           |
| `npm run i18n:check` | ✅ PASS — 503 keys × 4 locales, placeholders aligned, no empty strings    |
| `npm test`           | ✅ PASS — **687/687 tests, 63 files** (181 at program start)              |
| `npm run build`      | ✅ PASS (production build clean; service worker regenerated by the build) |

**Not re-run in this final pass (trimmed for speed, stated honestly):** the Playwright e2e suite,
Lighthouse CI, axe checks, and the offline-build check. Last full e2e verification was at Prompt 11:
**17/17 Playwright tests passed** under the new security headers (`--workers=1`; see known issue K3).
The Prompt 15 items "real-browser verification of the single-thread pool path with a real WASM
worker" and the full PASS/PARTIAL/FAIL checklist were not performed.

## 2. Per-prompt status

| #   | Prompt                                                                              | Status                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tooling & pinning                                                                   | ✅ DONE                       | 189 tests; Inter self-hosted via `next/font/local` (real Inter v4.001 variable, woff2 48 KB + 85 KB, OFL in LICENSES.md); offline build proven under `unshare -n`; exact pins (next 15.5.28, react 19.3.1, chess.js 1.4.0, stockfish 19.0.1, TS 5.9.3, vitest 3.2.7, eslint 9.39.5); CI workflow added                                                                                                           |
| 2   | Engine payload                                                                      | ✅ DONE                       | 226 tests; see §3                                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | Analysis speed                                                                      | ✅ DONE                       | 269 tests; adaptive budgets + worker pool; see §4 (targets partially missed, documented)                                                                                                                                                                                                                                                                                                                         |
| 4   | Classification                                                                      | ✅ DONE                       | 358 tests; 12 real games, real-engine snapshots; see §5                                                                                                                                                                                                                                                                                                                                                          |
| 5   | Accuracy & rating                                                                   | ✅ DONE                       | 365 tests; Lichess validation PASS; rating = qualitative option (b); see §6                                                                                                                                                                                                                                                                                                                                      |
| 6   | Missing UI (WDL, clocks, statistics, theory)                                        | ✅ DONE                       | 420 tests; Testing Library component project added                                                                                                                                                                                                                                                                                                                                                               |
| 7   | Piece sets, themes, visual QA                                                       | ✅ DONE                       | 443 tests; 5 sets, 6 themes, coordinate contrast ≥4.5:1 asserted; Playwright visual suite 8/8 against committed baselines                                                                                                                                                                                                                                                                                        |
| 8   | Image import                                                                        | ✅ DONE                       | 479 tests; measured accuracy in §7; mandatory editor review step                                                                                                                                                                                                                                                                                                                                                 |
| 9   | PWA & offline                                                                       | ✅ DONE                       | 517 tests; Playwright 10/10; SW injects COOP/COEP (crossOriginIsolated asserted true before/after SW control and offline); stale `review.spec.ts` locators repaired here (documented in the spec with NOTE comments)                                                                                                                                                                                             |
| 10  | i18n (en/hi/es/pa)                                                                  | ✅ DONE (after fix pass)      | 591 tests; 503 catalogue keys; initial self-review FAILed extraction completeness → fix pass localized the performance tooltip, the engine-failure surface (structured errors), extended pseudo-mode overflow checks (all passing), documented static metadata/manifest as deliberate English exceptions                                                                                                         |
| 11  | API hardening & security                                                            | ✅ DONE                       | 687 tests; MSW suites; Playwright 17/17 under the new CSP/security headers                                                                                                                                                                                                                                                                                                                                       |
| 12  | Game-end taxonomy & PGN edge cases                                                  | ✅ DONE (Round 2, 2026-11-01) | See §12 below: termination resolver + banner, Chess960 honest-rejection screen, truncated-PGN recovery, repetition-aware engine/cache, move-list virtualization. Evidence: `tests/unit/termination.test.ts` (28), `tests/unit/pgn-recovery.test.ts` (16), `tests/unit/analyzer-termination.test.ts` (11), `tests/components/termination-banner.test.tsx` (10), `tests/e2e/termination.spec.ts` (5/5 in Chromium) |
| 13  | Test expansion (coverage thresholds, test:all, CI matrix, @slow engine integration) | ❌ NOT RUN                    | Partial incidental coverage only: component tests exist (Prompts 6–11), e2e suite exists and is green, the stale-locator fix assigned to this prompt was done early in Prompt 9. Coverage thresholds, `test:all`, Node 20+22 CI matrix, axe gate: not implemented                                                                                                                                                |
| 14  | A11y & performance audit (Lighthouse CI, PERFORMANCE.md, ACCESSIBILITY.md)          | ❌ NOT RUN                    | No Lighthouse run, no bundle-analyzer pass, no audit documents. Contrast work from Prompt 7 (board coordinates ≥4.5:1) stands, but no full audit exists                                                                                                                                                                                                                                                          |
| 15  | Final verification + this report                                                    | ⚠️ PARTIAL                    | Core gates re-run from `npm ci` and green (§1). E2E/Lighthouse/axe/offline-build re-verification and the pool-path browser check were trimmed at the user's speed request                                                                                                                                                                                                                                        |

## 3. Prompt 2 — Engine payload, before/after

- **Before:** full stockfish npm package copied wholesale — **205,067,486 B (195.57 MiB)**.
- **After:** default shipped set **200,180,816 B (190.91 MiB)** — only asm.js and the multi-thread
  lite build dropped (−4.66 MiB, −2.4%). The prompt's "one-third" target is **physically impossible**
  and this is documented in the README: the two main WASM binaries (~99 MB each) are distinct builds
  and brotli only reaches ~0.78 on them. A visitor downloads **one** build: ~94.5 MiB (full) or
  ~1.8 MiB (lite). Also delivered: per-file SHA-256 manifest with client-side integrity verification,
  fallback chain multi→single→lite, documented selection rules, settings override, CDN base-URL
  support verified cross-origin in Chromium, streaming load progress, Cache API warm cache.

## 4. Prompt 3 — Benchmarks (this 4-core VM, Node 24, single-thread sequential)

Seconds for Quick / Standard / Deep / fixed-depth-18; fixtures: Opera game (34 positions),
Lichess game (83 positions), Lichess game (172 positions).

| Fixture                | Quick | Standard | Deep  | Fixed d18 |
| ---------------------- | ----- | -------- | ----- | --------- |
| Opera (34 pos)         | 11.6  | 27.0     | 68.5  | 139.6     |
| 41-move game (83 pos)  | 25.0  | 65.1     | 176.4 | 345.8     |
| 86-move game (172 pos) | 51.6  | 168.1    | 376.9 | 661.4     |

- Average achieved depths (Quick/Standard/Deep): ~11.7–12.1 / ~13.5–14.3 / ~15.5–16.0.
- **Agreement target MISSED and documented:** adaptive Standard vs fixed depth 18 — mean |Δcp|
  132.6 over 286 positions (55.6 excluding mate-scored positions). The ≤20 cp target was not met.
- The 45 s / 90 s whole-game laptop targets were **not met on this VM**; any expectation of better
  numbers on real laptop hardware is an expectation, not a measurement.
- The browser pool path (non-cross-origin-isolated → pool of single-thread clients) is covered by
  fake-engine unit tests only; a real-WASM browser verification was scheduled for Prompt 15 and
  was not performed (trimmed).

## 5. Prompt 4 — Classification calibration (12 real games, real Stockfish 19 snapshots, depth 18)

578 plies across Morphy Opera 1858, Anderssen Immortal 1851 + Evergreen 1852, Byrne–Fischer 1956,
Kasparov–Topalov 1999, Légal Trap, Greco 1620, Karpov–Unzicker 1975, and 4 real Lichess games
(sources in `tests/fixtures/games/SOURCES.md`; full detail in `CALIBRATION.md`):

Brilliant 5 (0.9%), Great 41 (7.1%), Best 292 (50.5%), Excellent 81 (14.0%), Good 62 (10.7%),
Inaccuracy 42, Mistake 26, Blunder 14, Miss 3, Forced 12. Master-game rates: **Brilliant 0.51 per
40 moves (target <2 ✅), Great 3.89 per 40 (target 1–4 ✅)**, Best+Excellent+Good 75.4%.
A handful of golden assertions were corrected **with engine evidence** (e.g. Immortal Game 18.Bd6
is a genuine Blunder at depth 18; Byrne–Fischer contains no …Qc3 move); reasons are recorded in
CALIBRATION.md. Exact-recapture detection, robust SEE, sacrifice kinds, three classification
profiles, and per-move `reason` strings were delivered.

## 6. Prompt 5 — Accuracy validation & rating decision

- **Lichess validation: PASS** (coordinator re-ran `node scripts/validate-accuracy.mjs`): 18
  committed reference games / 36 accuracies — **mean |diff| 0.35 (tolerance ≤3), max 1.14
  (tolerance ≤8)**. Dev pool of 263 games: mean 0.26, max 1.14. The pre-fix formula scored
  mean 6.63 / max 23.04 — root causes (weighted harmonic mean, volatility window handling, missing
  ±1000 cp clamp) were fixed from Lichess's published source, in the accuracy path only.
- **Rating: option (b) qualitative, chosen with data.** A real dataset (250 games / 493 samples,
  ratings 949–3362) was fitted; best-fit residual SD ≈430 Elo with an 80% band of ≈±490 — far beyond
  the ±300 meaningfulness bar — so the numeric estimate was removed everywhere and replaced by
  `GameReview.performance` with qualitative bands and a "not a rating" note ("Performance estimate"
  row on the summary screen).

## 7. Prompt 8 — Image import, measured accuracy

Exact shipped pipeline, all 5 piece sets as templates, mandatory BoardEditor review step,
"Images never leave your device" is structural (no network path in the vision code):

| Fixture set                                                                                  | Square accuracy                                                                                                |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Clean renders (80 images, 8 FENs × 5 sets × 2 themes)                                        | **99.96%** (5118/5120), detection 80/80, ~120 ms/image                                                         |
| Realistic phone-style set (16 images, JPEG q80, coords, highlights, legal dot, capture ring) | **100.00%** (1024/1024), ~204 ms/image                                                                         |
| Rotated ±1.5–2° / JPEG q50–q35 (report-only, no target)                                      | **55.47%** (213/384) — mean confidence drops 0.83→0.63, so the low-confidence review warning fires as designed |

Per the program rule (≥95% on the realistic set), the **"Beta" label was dropped**; the README
states the caveat plainly: the realistic fixtures are _rendered_ phone-style screenshots, not
photographs of real devices. The ONNX/ML path was not attempted (documented, no fake model).

## 8. Prompt 11 — API & security summary

Zod validation on both routes with a strict upstream host allowlist (asserted on the initial URL
and every redirect hop); archive URLs rebuilt from validated parts; 8 s timeouts, one jittered
retry on network/5xx only; size caps; stable error taxonomy `{error:{code,message,retryable}}`
(11 codes, localized); `s-maxage` caching backed by a pluggable cache (in-memory default, Upstash/
Vercel-KV REST adapter constructed only when env is present); per-IP rate limit 30/min burst 10 →
429 + `Retry-After`; Lichess client-side direct fallback on retryable proxy failures; chess.com
callback import now behind `CHESSCOM_CALLBACK_ENABLED` (**default off — a deliberate behavior
change**: default deployments return 503 NOT_CONFIGURED plus the paste-PGN fallback panel);
CSP + security headers mirrored across next.config.js / vercel.json / netlify.toml / public/_headers
and injected by the service worker, drift-guarded by tests. CSP `script-src` uses scoped
`'unsafe-inline'` — the sha256-hash approach was attempted and removed because browsers ignore
`'unsafe-inline'` when a hash is present, which broke Next's Flight scripts (caught by e2e);
the reasoning is documented in the README and next.config.js.

## 9. Files added larger than 90 KB (complete list)

| File                                                                                                                    | Size           | From                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| `tests/fixtures/games/kasparov-topalov-1999.json`                                                                       | 117,208 B      | P4 (test fixture)                                         |
| `tests/e2e/visual.spec.ts-snapshots/review-walkthrough-midgame-chromium-linux.png`                                      | 145,924 B      | P7 (baseline)                                             |
| `tests/e2e/visual.spec.ts-snapshots/review-summary-desktop-chromium-linux.png`                                          | 123,046 B      | P7 (baseline)                                             |
| `tests/e2e/visual.spec.ts-snapshots/settings-drawer-chromium-linux.png`                                                 | 122,335 B      | P7 (baseline; regenerated in P10 for the language picker) |
| 10 vision fixture images under `tests/fixtures/vision/` (8 realistic `*.jpg` at 93–98 KB, rotated `*.png` up to 181 KB) | 93–181 KB each | P8 (test fixtures)                                        |

No shipped production asset exceeds 90 KB except the engine WASM builds themselves (~99 MB each,
pre-existing package binaries, of which a visitor downloads one) — the largest new production
files are the Inter latin-ext woff2 (85 KB) and the generated service worker (~12 KB).

## 10. Known issues & honest limitations (ranked)

- **K2 — Prompts 13/14 not executed.** No enforced coverage thresholds, no `test:all`, no Node
  20+22 CI matrix, no Lighthouse CI budgets, no PERFORMANCE.md / ACCESSIBILITY.md, no axe gate.
  **Round 2, Prompt 5 update (§16): the TEST half is CLOSED** — coverage thresholds are
  enforced and passing, `test:all` exists and runs green, the CI check job matrices Node
  20 + 22 with integration + coverage steps, and the axe gate runs at zero violations on
  the three primary surfaces. What remains of K2 is the AUDIT half — Lighthouse CI budgets,
  PERFORMANCE.md, ACCESSIBILITY.md — which is Prompt 6's scope.
  **Round 2, Prompt 6 update (§17): K2 is CLOSED.** Lighthouse CI is wired (CI job +
  lighthouserc.cjs) with accessibility / best-practices / SEO asserted as errors and
  measured at 1.00 on both routes; PERFORMANCE.md and ACCESSIBILITY.md are delivered.
  The one honest remainder: Lighthouse _performance_ medians on this VM (0.71 on /,
  0.57 on /review) are below the 0.95 / 0.90 targets and are asserted as `warn` with the
  reason recorded — see §17 and PERFORMANCE.md.
- **K3 — E2E intermittency on this VM.** Under default 2-worker full-suite runs on this 4-core VM,
  `tests/e2e/review.spec.ts` intermittently misses its 60 s progress assertion due to CPU
  contention with the ~95 MB WASM load; it passes standalone and in the full suite at
  `--workers=1` (17/17 at Prompt 11). Not observed on the unit/component suite (687/687 stable).
  **Round 2, Prompt 4 update (§15): CLOSED.** The suite is split into light (`chromium`,
  the CI PR gate) and heavy (`heavy` + `chromium-noiso`, serialized) projects; the final
  tree passed **five consecutive full heavy+noiso runs, 18/18 each**, plus a green light
  run in the Prompt 4 gate.
- **K4 — Adaptive evaluation ≠ fixed-depth evaluation.** The §4 agreement miss (mean |Δcp| 132.6)
  means adaptive-preset labels can differ from a fixed depth-18 analysis more than the prompt
  targeted. Documented in the README; presets are honest about achieved depth.
  **Round 2, Prompt 3 update (§14):** re-measured in a real browser over all three bench
  fixtures (286 moves; the first session's contention-tainted passes were re-run on an idle
  machine), the classification difference vs fixed depth-18 is **25.9% of moves at Standard
  and 19.6% at Deep** — the ≤8% / ≤4% targets are **missed** and are documented as
  unreachable on this 4-core machine: time-boxed presets reach mean depth 14.8 (Standard) /
  16.6 (Deep) at the browser's ~315–440k nodes/sec, Stockfish's own best move differs from
  its depth-18 choice on 19.5–26.3% of positions at those depths, and the fixed pass costs
  843–2,376 s per game. The gap did narrow sharply vs Round 1 (pooled mean |Δcp| 40.5 at
  Standard vs 132.6), ~81% of differing moves shift by a single classification band
  (2+-band shifts: 4.9% Standard, 3.8% Deep), and Brilliant/Great frequencies hold at the
  runtime budget (Brilliant 0/40, Great 1.68–1.96/40 — guarded by
  `tests/unit/preset-agreement-guard.test.ts` against documented regression ceilings).
  Mitigations shipped: stability floors 14/16, critical re-analysis at up to 2× ceiling,
  like-for-like depth matching, achieved-depth display in the review header, and a per-move
  depth-24 re-analysis action. Full study: PERFORMANCE_BASELINE.md.
- **K5 — Pool path unverified with a real WASM worker in a browser** (fake-engine tests only).
  The multi-thread path _was_ verified in Chromium (Prompts 9/11). Manual step: serve the app from
  a non-cross-origin-isolated origin, run a full analysis, confirm completion via the pool.
  **Round 2, Prompt 4 update (§15): CLOSED.** `tests/e2e/pool.spec.ts` now performs that
  exact check automatically in both configurations (isolated → multi-threaded build;
  non-isolated `NOISO=1` build → real worker pool, asserted via the `__engineDebug` hook),
  and it passes as part of the 5× consecutive e2e streak.
- **K6 — CLOSED by Round 2 Prompt 9 (§20).** All three recorded defects are resolved: the
  hydration #418 does not reproduce in any of 14 tested scenarios and is locked by
  `tests/e2e/hydration.spec.ts` (4/4); the orphaned `ReviewHeader.tsx` / `AccuracyCard.tsx` —
  and five further orphans the new reachability check found — are deleted, with
  `npm run check:unused` now failing CI on regressions; the engine-label crowding disappeared
  with `ReviewHeader`'s deletion (the current review UI carries engine identity in the summary
  and settings, not beside the panel title). **Round 2, Prompt 2 adjustment (historical):** the
  chess.com game-link limitation was removed from K6 earlier and closed by the archives search
  in §13.
- **K7 — Translations are machine-assisted** and pending native-speaker review (stated in the
  README and marked in the settings drawer's language list). The review workflow now exists
  (Round 2 Prompt 10, §21): glossary + `glossary:check`, CSV export/import for native speakers —
  but no locale has been human-reviewed yet, so the status is unchanged. Page metadata and the
  PWA manifest are now localized at runtime by `LocaleSync` (per-locale manifests included);
  the statically generated HTML head and the Apple web-app title remain English, as documented
  in the README.
- **K8 — CLOSED by Round 2 Prompt 9 (§20).** The import rate limiter is now KV-backed and
  shared across instances whenever the same KV env vars as the cache are set (atomic Lua token
  bucket, fail-open with logging), with the in-memory limiter as the documented fallback; see
  the README configuration table.
- **K9 — Image import robustness (updated by Round 2 Prompt 8, §19):** now measured on real
  inputs. Real screenshots (26 lichess captures, DOM-verified ground truth): **100.00%**.
  Rotated/compressed renders: **97.92%** (was 55.47%). Photographs of physical boards (n=3):
  **28.65%** — below the 85% Beta-rule bar, so the **Beta label was restored**; photo failures
  are detection-geometry failures on two Staunton-style photos and a template-family miss on a
  figurine set. The mandatory review step remains the safeguard.

## 11. Go / No-Go

**GO — for the current build as an incremental release over the pre-program version.** The core
gates are green from a clean install (687 tests, tsc, lint, build), every completed prompt was
independently gate-verified by the coordinator after its worker finished, and the app is strictly
more capable and more honest than the version live before the program (no faked data anywhere:
rating is qualitative _because the data said so_, image import publishes its measured numbers,
the engine-payload ceiling is documented rather than disguised).

**NO-GO — as a claim of full 15-prompt completion.** Prompts 12, 13, 14 were not executed and
Prompt 15 was executed in trimmed form, per the user's speed instruction on 2026-11-01. The
remaining work, in order: Prompt 13 (coverage thresholds, `test:all`, CI matrix), Prompt 14
(Lighthouse/a11y audit), then a full Prompt 15 re-verification including e2e and the K5
pool-path browser check. (Prompt 12 was completed in Round 2 — see §12.)

---

## 12. Round 2 addendum — Prompt 12 executed (2026-11-01)

Prompt 12 (game endings, Chess960, PGN recovery, long games) was executed
as a separate Round 2 stage after this report's original cut. Known issue
**K1 is removed**: every gap it listed is closed, with this evidence:

- **Termination taxonomy + banner:** `src/analysis/termination.ts`
  (position → repetition/counters → Termination tags + chess.com/Lichess
  metadata → result-only fallback with `detail: 'result-only-kind-unknown'`),
  wired into `src/parsers/pgn.ts` (`ParsedGame.termination`) and
  `analyzeGame` (`GameReview.termination`); localized banner in the
  review header and on the final position plus result markers on the
  eval bar/graph, all strings in en/hi/es/pa.
  Tests: `termination.test.ts` (28 tests — every kind, both sites'
  phrasings, board-over-tag priority, contradictory-data fallback).
- **Chess960:** chess.js 1.4 castling is standard-only (verified: king
  ±2 generation, KQkq-only FEN), so 960 is honestly REJECTED with a
  localized "not supported yet" screen and never analyzed as standard
  chess; opening book skipped for 960. Two 960 fixtures (one with a
  castling move) in `pgn-recovery.test.ts`; blocked-screen e2e in
  `termination.spec.ts`.
- **PGN recovery:** illegal/truncated movetext keeps the valid prefix
  with `parseError { ply, san, legalMoves }` and an "Analyze up to
  move N" button; fixtures for 0-0 spellings, all four promotions, en
  passant, BOM, mixed line endings, multiple result tokens, nested
  variations/comments, NAGs, [%clk]/[%eval], unusual headers in
  `pgn-recovery.test.ts` (16 tests).
- **Repetition awareness:** repeated positions are searched with
  `position fen <start> moves …` history and cached under
  occurrence-tagged keys (`analyzer-termination.test.ts`, 11 tests —
  including terminal positions never searched, rule-draws at exactly
  0.0/50%, the draw-from-winning EPL test, `maxPlies`, and the 400-ply
  fixture: ≈0.49 s, 8 engine calls, fivefold resolved).
- **Long games:** move list virtualized above 80 rows (aria-rowcount/
  rowindex; <60 of 200 rows mounted, ≈79 ms jsdom render) and an
  "analyze first N moves" option; a 364-ply non-repetitive game
  measured ≈1.14 s pipeline time (fake engine) and ≈+8.8 MB heap —
  details in README "Game endings, Chess960, PGN recovery and long
  games (Round 2)".
- **E2E:** `tests/e2e/termination.spec.ts` — resignation, timeout,
  repetition draw, truncated-PGN recovery, Chess960 block: **5/5 passed**
  in Chromium against the production build (`npx playwright test
tests/e2e/termination.spec.ts --workers=1`).
- **Gates (Round 2, this stage):** `npm ci` (run as part of the gate
  sequence), `npm run typecheck` ✅, `npm run lint` ✅ (zero findings),
  `npm test` ✅ **755/755 tests, 67 files** (690/63 at Round 2 start;
  +65 tests, no existing test deleted or weakened — one analyzer bug
  found and fixed at the root: mate-in-0 win probability ignored which
  side was mated), `npm run build` ✅, `npm run i18n:check` ✅
  (533 keys × 4 locales).
- **Not done in Round 2:** `UCI_Chess960` was NOT enabled (960 games are
  rejected, so no engine ever sees one); Prompts 13/14 remain open (K2).

---

## 13. Round 2 addendum — Prompt 2 executed (2026-11-01): chess.com links via the official public API

Chess.com game links now work in a **default** deployment using **only
the official public API** (`api.chess.com/pub/…`). This closes the
chess.com-link limitation recorded in §8 (and adjusted out of K6 above —
see the K6 note; no other known issue is renumbered or changed).

- **New default flow:** pasting a game link (`/game/live/`, `/game/daily/`,
  `/analysis/game/live/`, `/live/game/`) asks **inline** for one player's
  chess.com username (pre-filled from the last successful import, stored
  only in browser `localStorage`), then walks that player's monthly
  archives newest-first, up to **12 months**, with per-month progress
  ("Searching YYYY-MM…") and a cancel button, stopping at the first
  match. A successful import remembers the username. Daily games are
  matched identically. Older than 12 months → the PGN route (documented
  in the README).
- **Fallback order:** (a) archives search; (b) the callback endpoint
  **only** when `CHESSCOM_CALLBACK_ENABLED` is set (flag kept, default
  off); (c) the "How to get the PGN" help panel (Share → PGN → Copy)
  with a one-click switch to the PGN tab. Failure messages name the
  failed step and the next action.
- **Server:** new `op=archiveMonths` and `op=searchArchives` operations
  on `GET /api/chesscom`, built entirely on the Prompt 11 stack (zod
  validation incl. hostile-username 400s, host allowlist, 8 s timeouts,
  size caps, one jittered retry, pluggable cache, per-IP rate limiter,
  error taxonomy). Descriptive `User-Agent` on upstream requests;
  months fetched sequentially (concurrency 1); upstream 429 passed
  through with `Retry-After`. Cache TTLs: past months 7 days
  (immutable), current month 5 min, found game 24 h.
- **Privacy:** the routes log nothing — no usernames, no PGNs; only
  taxonomy error codes reach any log surface. Documented in the README
  ("Privacy") and in a comment at the search implementation.
- **Username browsing:** unchanged, and the recent-games picker gained
  the missing filters — player-name search box, time-control, result
  and month filters (`RecentGamesPicker`).
- **Tests:** `tests/unit/api-chesscom-search.test.ts` (15 MSW tests:
  current-month match, match 5 months back, not found after exactly 12
  months, empty index, game-less months, player 404, 429 + Retry-After,
  timeout, oversized archive, hostile username / non-numeric id 400s
  with zero upstream calls, daily games, scoped-month hits/misses,
  `archiveMonths` cap, month-cache reuse, descriptive User-Agent);
  `tests/unit/import-api-search.test.ts` (4 client-helper tests);
  `tests/components/chesscom-link-import.test.tsx` (6 tests: inline
  username prompt incl. pre-fill, submit, progress + cancel; picker
  filters); `tests/e2e/chesscom-link.spec.ts` (Playwright, mocked
  `/api/chesscom`: full link → username → month-walk → review flow,
  username remembered in localStorage, pre-fill on the next import).
- **Gates (Round 2, this stage, all run):** `npm ci` ✅ (517 packages),
  `npm run typecheck` ✅, `npm run lint` ✅ (zero findings), `npm test`
  ✅ **780/780 tests, 70 files** (755/67 before this stage; +25 tests,
  no existing test deleted or weakened), `npm run build` ✅,
  `npm run i18n:check` ✅ (556 keys × 4 locales). Playwright:
  `tests/e2e/chesscom-link.spec.ts` **2/2 passed** in Chromium against
  the production build (`--workers=1`). Link-format parsing for
  `/game/live/`, `/game/daily/`, `/analysis/game/live/`, `/live/game/`
  and `/member/<name>` remains covered by `tests/unit/links.test.ts`.
- **Not done in this stage:** nothing in scope was skipped. The callback
  endpoint remains undocumented and opt-in by design; no deployment was
  performed.

## 14. Round 2 addendum — Prompt 3 executed (2026-11-01): runtime depth alignment, measured in a real browser

**What changed.** Stability floors raised (Standard 12→14, Deep 14→16 — the stability stop can
never fire earlier); a third critical trigger (the best move at the minimum depth falling out of
the finished first pass's top-3 earns a full-depth re-analysis); critical re-analyses at Standard
may use 2× the per-position ceiling (3000 ms); **like-for-like depth matching** — a position cut
shallower than its predecessor is extended to the predecessor's depth before classification, in
both the sequential and pool drivers (measured effect: the extension cascades — 45 of 82
positions depth-matched in the 41-move Standard run, 72 of 171 in the 86-move run). The position
cache already keyed entries by achieved depth (schema v2, Prompt 3 of the fix program); a deeper
result is stored under its own depth key and serves shallower requests, so no cache change was
needed. UI: the review header shows the preset name plus **"Analyzed at depth N (avg)"** (the
mean achieved depth, not the target) and an adaptive-presets honesty note for Quick/Standard;
the engine-lines panel shows the current ply's depth and each line's depth (pre-existing), and
each move in the walkthrough now has a **"Re-analyze this position deeper"** action (fixed
depth 24, shown in the engine panel, stored review untouched). All new strings localized
(en/hi/es/pa; catalogue now 564 keys × 4).

**Measurement (PERFORMANCE_BASELINE.md, scripts/bench-browser.mjs + scripts/agreement.mjs).**
Real Chromium 156, cross-origin isolated, 4 cores / 7.7 GB RAM, real WASM builds, budget rules
imported from `src/engine/budgetRules.mjs` verbatim. **Final dataset (this addendum's first
draft carried an interim one):** the 41-move fixture's first passes were measured while other
work shared this VM (94.8–180k nodes/sec, mean depths ~1.8 lower) and were **re-measured
uncontended**; the first bench process also died mid-run and its 86-move passes were re-run —
every number below traces to the final `PERFORMANCE_BASELINE.raw.json`. Multi-thread:
Opera Standard 90.6 s (mean depth 13.73), 41-move Standard 239.9 s (mean 14.80), 86-move
Standard 431.6 s (mean 14.86); fixed depth-18 passes 843.2 s / 1,025.1 s / 2,375.5 s.
Single-thread pool mode is fully measured too — on this 4-core VM its wall time for a full
game is LOWER than multi-thread at Standard/Deep (86-move Standard: 267.4 s wall vs 478.1 s;
three workers search in parallel; 86-move Deep pool mean depth 18.51). Agreement vs fixed d18
(mate capped ±1000 cp; production classifier), pooled over all 286 moves: Standard mean
|Δcp| **40.5**, classification difference **25.9%**; Deep mean |Δcp| **28.8**, classification
difference **19.6%** (Round 1's runtime: 132.6 mean |Δcp|). ~81% of differing moves shift by
one band; 2+-band shifts are 4.9% (Standard) / 3.8% (Deep).

**Targets — honestly missed, with the measured reason.** Classification difference ≤8% (Standard)
/ ≤4% (Deep) and a 40-move Standard game ≤ ~60 s are **not met** on this machine and are
documented as jointly unreachable here: the browser engine sustains ~315–440k nodes/sec
uncontended, so the presets' time ceilings bind at mean depth ~14.8 (Standard) / ~16.6 (Deep),
Stockfish's own best move differs from its depth-18 choice on 19.5–26.3% of positions at those
depths, and uniform depth 18 itself costs 843–2,376 s per game in this browser. Adjusted,
documented guard ceilings (classification difference ≤34% Quick / ≤30% Standard / ≤24% Deep;
2+-band shifts ≤7% / ≤6%; pooled mean |Δcp| ≤50 / ≤38 — measured values plus headroom) are
enforced by `tests/unit/preset-agreement-guard.test.ts` (6 tests). Recalibration: Brilliant/Great
frequencies under the runtime budget stay in the calibrated family (Brilliant 0.00/40 in all
passes; Great 1.68–1.96/40 vs 1.68/40 fixed), so no CLASSIFICATION_PROFILE threshold changed;
the depth-18 snapshot calibration and golden games are untouched and still pass.

**Gate repair (precondition for this stage's gate).** The stage was inherited with the suite
red: 790/791, the classification property tests timing out at 5 s. Root causes found by
profiling, all fixed in production code (no assertion weakened, no timeout raised):
(1) `seeForMove` (src/analysis/sacrifice.ts) validated one capture's legality with an
UNSCOPED `chess.moves({verbose:true})` — a full legal-move generation per call — and
`analyzeSacrifice` replayed the candidate move on a second board; scoping the query to the
from-square and walking the PV on the same board cut classifySnapshot over the 12 snapshot
games from 2,801 ms to 1,201 ms, with `scripts/calibrate.mjs` output byte-identical to the
committed calibration (behavior unchanged). (2) The Fix-0 Halloween regression test timed
out in-suite: `buildOpeningIndex` replayed all 37,700 SAN moves of the 3,865-entry opening
book from scratch (16–21 s); a prefix-trie walk over the 8,801 unique edges builds the
**identical** index (same size, same sorted-content SHA-256) in ~6.5 s — also a real
first-visit saving, since the index is built in the browser. (3) Residual flakiness was
scheduler lottery: co-scheduled CPU-heavy test files inflated wall-clock budgets ~1.9×
(vision mean recognition 921 ms standalone vs 1,703 ms in-suite); vitest `maxWorkers` is
now 2 in both projects, with the reasoning recorded in vitest.config.ts. Suite after
repair: fully green (final counts in the gate line below).

**Tests.** 780 → **797 unit/component tests (72 files; +17 net)**: new budget-rule tests
(floors, critical ceiling, fell-out trigger, depth-match), fake-engine analyzer tests
(like-for-like extension at 2× ceiling, fell-out re-analysis), achieved-depth statistics,
and the agreement guard above (rewritten against the final dataset: 6 tests asserting the
documented ceilings, the far-shift and mean-|Δcp| bounds, and the runtime-budget
Brilliant/Great frequencies). **Gate (after `npm ci`, re-run on the final tree by the
resume coordinator): typecheck ✓, lint ✓, tests 797/797 ✓, build ✓, i18n:check ✓
(564 keys).** No deployment.

## 15. Round 2 addendum — Prompt 4 executed (2026-11-01): e2e stabilization, pool-path verification (K5 closed, K3 closed)

_Executed by the resume coordinator after the Prompt 3 gate._

**Pool path verified in a real browser — K5 is closed.** A read-only debug hook
(`window.__engineDebug()`, added in `src/hooks/useEngine.ts`) exposes the engine
configuration the running page actually selected: mode, build file, thread count, hash,
and — for the single-thread fallback — the live pool's size, client count, and per-worker
thread/hash settings. `tests/e2e/pool.spec.ts` runs a real Quick analysis of the sample
game in two Playwright projects and asserts the configuration in each:

- `heavy` project (the normal, cross-origin-isolated build on :3100):
  `crossOriginIsolated === true`, mode `multi`, threads = `max(1, min(cores − 1, 8))` —
  the multi-threaded build serves the analysis directly and no pool is created.
- `chromium-noiso` project (a second build produced with `NOISO=1`, served on :3101):
  `next.config.js` drops the COOP/COEP headers under `NOISO=1` (every other header,
  including CORP, is unchanged, and the build goes to a separate `.next-noiso` distDir so
  the two builds never collide). In that page `crossOriginIsolated === false`, the engine
  mode is `single`/`lite`, and the worker pool is real: pool size `min(4, cores − 1)`,
  1 thread and 32 MB hash per worker, with at least one live pool client observed through
  the hook while the analysis completed end to end.

Both pool tests pass repeatedly (they are part of the 5× streak below). The manual step
K5 used to prescribe is now an automated, asserted test.

**E2E suite restructured for stability — K3 is closed.** `playwright.config.ts` now
defines three projects: `chromium` (light UI specs — the PR gate in CI), `heavy`
(engine-driven specs — review, pool, termination, chess.com-link, visual — serialized at
1 worker), and `chromium-noiso` (only under `E2E_NOISO=1`). Scripts: `test:e2e:light`,
`test:e2e:heavy` (heavy + noiso), `test:e2e` (everything). CI runs the light project on
pull requests and the heavy projects on pushes/nightly (45-minute budget). **Result:
five consecutive full heavy+noiso runs, 18/18 tests each, no retries** (7.1–7.3 min per
run on this VM), followed by a green light-project run in this prompt's gate. The earlier
streak attempt recorded 4 consecutive passes before the run was interrupted by a
VM-level filesystem fault (repeated EPERM on writes, unrelated to the app or the tests);
the streak was then restarted from zero and completed cleanly, so the "5 in a row" claim
rests only on the final, uninterrupted streak.

**Visual baselines regenerated — causes, per the working rules.** The project rename
(`chromium` → `heavy`) changed Playwright's snapshot file suffixes, which alone forced
regeneration of every baseline. The pixel diffs were inspected before accepting them:
input/settings screenshots differ by ≤0.4% (rendering noise), while the review
screenshots differ by 10–15% — verified visually to be exactly Round 2's intended UI
changes and nothing else: the review header now reports achieved depth ("Standard ·
d18 · Analyzed at depth 18.0 (avg)"), the adaptive-preset honesty note appears under
the controls, and the termination banner names the result ("Paul Morphy won by
checkmate · 1-0"). Accuracies (91.3 / 74.6), classification counts, the eval graph, and
the board are pixel-identical to the old baselines. `visual.spec.ts` then passed 8/8.

**Heavy/light classification note.** Timing the specs showed the termination and
chess.com-link specs are actually fast (seeded flows, ~2–5 s); the genuinely heavy
specs are review, pool, and visual (real engine analysis). The split keeps the PR gate
fast without reducing what the heavy project covers.

**Gate (final tree):** `npm ci` ✓, typecheck ✓, lint ✓ (one fallout fix: `.next-noiso/**`
added to the ESLint ignores next to `.next/**` — the second build directory was being
linted as source), unit/component tests **797/797 (72 files)** ✓, build ✓ (First Load JS
unchanged: / 234 kB, /review 268 kB), build:noiso ✓, i18n:check ✓ (564 keys × 4 locales),
light e2e **8/8** ✓, heavy+noiso e2e **5× 18/18** ✓. No deployment.

## 16. Round 2 addendum — Prompt 5 executed (2026-11-01): coverage thresholds, engine integration tests, axe gate (K2 test half closed)

**Coverage, enforced.** `@vitest/coverage-v8` (3.2.7, matching vitest) with
`vitest.coverage.config.ts` and an `npm run test:coverage` script. The critical
game-logic modules are held to the Prompt 5 bar and now pass it, measured:
`src/analysis/**` ≥90/90/85/80 in aggregate; `src/engine/analyzer.ts` lines 91.65,
functions 100, branches 85; `src/parsers/**` ≥90 in aggregate (fen.ts went from
0% to 92.85). A global floor (lines/statements 72, functions 67, branches 78)
is set ~2 points under this configuration's measured totals (74.28 / 74.28 /
69.92 / 80.70) and documented in the config as ratchet-only. Two honest
configuration notes, both measured and recorded in the config itself: (1) the
two wall-clock-budget test files (vision-fixtures, fixtures-property) are
excluded from the _instrumented_ run — V8 coverage counters inflate hot-path
wall time ~3× (monotonicity 1.9 s → >5 s; vision clean set 119 s → >300 s) —
and their budgets remain enforced by the uninstrumented `npm test` in the
same pipeline; (2) the coverage run is serialized (`maxWorkers: 1`) because
the real-index analyzer test measures 20.6 s instrumented against its 30 s
budget and a co-scheduled heavy worker inflates it past the budget. No
assertion or timeout was changed anywhere.

**Gap tests written (suite 797 → 824).** `tests/unit/parsers-fen.test.ts`
(FEN validation/turn helpers), `tests/unit/engine-cache-idb.test.ts` (the
IndexedDB half of the cache against fake-indexeddb: round trips, the
depth-reuse scan, repetition-tag isolation, stats, review storage, and LRU
eviction at the 50,000-entry cap), and `tests/unit/analyzer-pool-live.test.ts`
(the analyzer's pool driver end-to-end with fake engines — including its
critical-deepen priority submit and cancellation — plus LiveSession,
maxPlies, the headers opening fallback, Chess960 book suppression, and a
black-delivers-mate finish).

**A real bug found by the new tests, and fixed.** The cache's prefix range
scan in `getCachedPositionForRequest` also matched repetition-tagged keys
(`<prefix>|repN|d…` sorts inside the untagged prefix range), so an evaluation
made at a position's second occurrence — searched with game history — could
serve a request for its first occurrence, defeating the Round 2 repetition
isolation the repTag exists for. `src/engine/cache.ts` now accepts only keys
of the exact shape `<prefix>|d<depth>` from the scan; the regression test is
in `engine-cache-idb.test.ts`.

**Engine integration tests.** `tests/integration/engine.integration.test.ts`
(own vitest project, `npm run test:integration`, excluded from the default
run) drives the REAL Stockfish 19 single-thread engine from the `stockfish`
npm package through the app's own `analyzePositionWithBudget` + budget
tracker + UCI parser: the Scholar's-mate position returns Qxf7 with mate 1
at depth 10, and the start position returns a sane depth-10 eval. 2/2 pass
(~7 s of engine time).

**Axe gate.** `tests/e2e/axe.spec.ts` (light project) asserts ZERO axe
violations on the home/import page, the home page with the settings drawer
open, and a seeded completed review. The first run found genuine defects,
all fixed in the app: the settings drawer was a `motion.aside` with
`role="dialog"` (a disallowed role for `aside`) → `motion.div`; the summary
counts container used `role="table"` around toggle buttons
(aria-required-children) → `role="group"`; and white text on the brand
green `#81b64c` measures 2.41:1 contrast — primary buttons and every
accent-green text control now use dark `#1d2b12` text (6.21:1) with the
brand green unchanged, and the "Great" steel blue was lightened
`#5c8bb0` → `#7fb0d8` (3.72:1 → 5.87:1 on the panel) where it carries text.
One scoped exception, documented in the spec: axe's
label-content-name-mismatch is disabled for the review surface only,
because it fires on the 8 coordinate-glyph squares whose accessible name
already leads with the square's own name; the board's full keyboard/ARIA
model in Prompt 6 re-audits that surface. Result: **3/3 pass**, and the
visual baselines still pass unchanged (8/8 — the color fixes stayed within
the 1% pixel tolerance).

**CI / scripts.** The check job now matrices Node 20 + 22 and additionally
runs the integration tests and the coverage gate (report uploaded as an
artifact); `engines.node` is `>=20.11` (as the tooling contract test
requires; `.nvmrc` stays 20). Scripts: `test:unit`, `test:integration`,
`test:coverage`, and `test:all` (unit + integration + coverage + light e2e)
— `test:all` verified end-to-end locally, exit 0.

**Gate (final tree):** `npm ci` ✓, typecheck ✓, lint ✓, i18n:check ✓ (564
keys), build ✓ (First Load JS unchanged: / 234 kB, /review 268 kB),
`npm test` **824/824 (75 files)** ✓, integration 2/2 ✓, coverage 803/803
with all thresholds ✓, light e2e **11/11** ✓ (incl. axe 3/3), visual 8/8 ✓.
No deployment.

## 17. Round 2 addendum — Prompt 6 executed (2026-11-01): bundle budgets, Lighthouse, board keyboard model, mobile (K2 closed)

**Bundle budgets — met and enforced.** `scripts/check-bundle.mjs` computes each
route's First Load JS as the gzip sum of its `.next/app-build-manifest.json`
chunks and runs inside `npm run build` (hence in CI). Before: **229.1 KB (`/`) /
261.9 KB (`/review`)** gzip. After: **147.3 / 183.9 KB** — inside the 170/220
budgets with headroom (Next's own table: 234/268 → 151/188 kB). The two wins,
found with `@next/bundle-analyzer` (wired as `ANALYZE=true npm run build`):
(1) the layout chunk carried the **entire four-locale i18n catalogue** (~48 KB
gzip) — now only English is in First Load and hi/es/pa load lazily via
`ensureDictionary()` with an English fallback and a re-render on arrival
(`src/i18n/dictionaries.ts` keeps the static set for tests/tooling); (2) the
**settings drawer** (and framer-motion, used nowhere else) was statically
imported by both pages — it is now a `next/dynamic` component mounted on first
open. Details + the trade-off note are in PERFORMANCE.md.

**Lighthouse (mobile, median of 3, this VM).** `/`: performance **0.71**,
accessibility **1.00**, best-practices **1.00**, SEO **1.00** (LCP 3,224 ms,
TBT 1,027 ms, CLS 0). `/review`: performance **0.57**, accessibility **1.00**,
best-practices **1.00**, SEO **1.00** (LCP 3,920 ms, TBT 8,625 ms, CLS 0).
Accessibility / best-practices / SEO meet or exceed the Prompt 6 targets on
both routes and are asserted as **errors** in `lighthouserc.cjs` + the new CI
lighthouse job. **Performance does not reach the 0.95 / 0.90 targets on this
shared 4-core VM** under Moto-G/slow-4G throttling (three sessions measured
the same picture; the dominant costs are framework hydration and Stockfish
WASM compilation). It is asserted as `warn` with the reason written in the
config — the numbers above are the real medians, not estimates. The engine
preload was also deferred (idle-or-first-interaction instead of on-mount;
direct engine consumers still start immediately) — a real-user improvement
that the lab window still partially captures, recorded as such in
PERFORMANCE.md.

**Accessibility (see ACCESSIBILITY.md).** The board gained a full **keyboard
model**: single tab stop, arrow-key focus square with a visible ring,
Enter/Space select-or-move through the same click-click plumbing, Escape
clears, and a polite live region announcing focus squares, selections with
their legal-move lists, and played moves in SAN (4 new i18n keys × 4 locales,
568 total). Squares became a real ARIA grid (`grid`/`row`/`gridcell`,
`display: contents` rows — layout pixel-identical, visual baselines pass
unchanged 8/8). Building it exposed a real bug: handled board keys leaked to
the review page's window-level ply navigation (ArrowRight both moved the
focus square and advanced the game) — the handler now stops propagation,
locked in by `tests/e2e/board-keyboard.spec.ts`. Also: the eval bar is now a
`role="meter"` with a numeric value; the settings drawer's JS animation
honors `prefers-reduced-motion` via `useReducedMotion` (the global CSS
kill-switch already covered CSS animation); the eval graph's classification
dots are decimated to one per pixel column on long games (`decimateDots`,
unit-tested).

**Mobile.** A coarse-pointer rule raises all buttons to a 44px minimum
height; `tests/e2e/mobile.spec.ts` (360px, touch) asserts no horizontal
scrolling and ≥44px primary targets on both routes — 2/2 pass.

**Runtime.** Dev-only INP instrumentation (`src/lib/inp.ts`,
PerformanceObserver over `event` entries, console logging, never installed
in production, nothing sent anywhere); engine-load progress UI unchanged.

**Gate (final tree):** `npm ci` ✓, typecheck ✓, lint ✓, i18n:check ✓ (568
keys), `npm test` **830/830 (78 files)** ✓, build ✓ with bundle check
(147.4 / 184.8 KB), coverage 809/809 with thresholds ✓, integration 2/2 ✓,
light e2e **14/14** ✓ (axe 3/3, board-keyboard 1/1, mobile 2/2, offline SW),
visual **8/8** ✓ (one spec locator re-scoped by content because the board's
new live region made the bare selector ambiguous — not a rendering change).
No deployment.

## 18. Round 2 addendum — Prompt 7 executed (2026-11-01): engine profiles, manifest-driven loading, CDN recipe tested, SW mismatch guard

**Profiles are real and verified.** `ENGINE_BUNDLE` (`all` default /
`multi+lite` / `lite-only` / `external`) was already implemented in
`scripts/copy-engine.mjs`; this stage exported its profile tables for reuse,
made `npm run engine:report` print the per-profile deploy sizes from the real
files (all **200,180,816 B**, multi+lite **100,983,632 B**, lite-only
**1,874,201 B**, external **0 B** shipped / full payload hosted), added
`npm run test:profiles` (per profile: shipped file list + manifest contents +
SHA-256 of every entry, all passing, wired into CI), and built every profile
(`all`, `multi+lite`, `lite-only`, `external` production builds all exit 0).

**The loader is now manifest-driven (the audit's core gap).** The client's
fallback walk is filtered by the manifest (`filterFallbackOrder` +
`availableModes` in engineManifest.ts; `StockfishClient.init` fetches the
manifest once and passes it down), and `prepareEngineBuild` throws
`EngineBuildNotShippedError` **before any file request** for a build the
manifest does not list as a complete pair. Previously an unshipped build was
discovered via a failed fetch — or, on SPA-fallback hosts answering 200 HTML,
only via the 90 s UCI timeout. Unit tests pin the no-request behavior;
`tests/e2e/lite.spec.ts` proves it in a real browser (below). A null/broken
manifest deliberately degrades to the old failure-driven walk rather than
bricking the engine.

**Settings show only what shipped.** The drawer fetches the manifest
(`useEngineAvailability`) and filters the engine-build options to shipped
builds, with per-build WASM sizes in the labels; a saved preference for an
unshipped build displays as Auto without rewriting the setting. A lite-only
deployment shows a plainly-worded note that the deployment ships only the
smaller, weaker Lite engine (new i18n key × 4 locales, 572 total;
component tests cover lite-only / multi+lite / unknown-manifest shapes).

**A real cross-origin bug was found and fixed.** The CDN acceptance test
failed in a way documentation alone never caught: the Blob wrapper worker
**inherits the page CSP**, and `script-src 'self'` blocked its
`importScripts(<CDN engine js>)` before any network request — while the
manifest/WASM fetches (connect-src) succeeded, making it look like a CORS
failure. (Bisected empirically: plain page OK, COEP-only page OK, app page
blocked; CSP confirmed.) Fix: `next.config.js` adds the configured engine
origin to `script-src` / `worker-src` / `child-src` at build time, plus
loopback allowances in `connect-src` for local engine bases; the README
recipe documents the same step for static hosts (whose header files cannot
compute it) and the residual offline-SW-shell caveat. The Round 1 README
claim that cross-origin loading was "verified" had no test behind it — now
it does: `npm run test:e2e:cdn` (`tests/e2e/cdn.spec.ts`, CI heavy job)
serves the engine from a different origin (`scripts/serve-engine-cdn.mjs`,
recipe headers) and asserts isolation, CDN-only engine requests, the
multi-threaded build starting, and a completed real analysis — **passing**.
`npm run test:e2e:lite` likewise verifies the lite-only build in a browser
(drawer shows Auto+Lite with the note, Quick analysis completes on lite,
unshipped builds never requested) — **passing**.

**Version-mismatch guard (R3).** `scripts/build-sw.mjs` now stamps a SHA-256
fingerprint of the engine manifest (version + every file's name/size/hash)
into the generated service worker; the SW engine cache name carries it
(`chess-review-sw-engine-v19.0.1-f<16 hex>`), and the loader's cross-origin
Cache API name carries the runtime manifest fingerprint too. Any payload
change — including a profile switch under the same Stockfish version —
changes sw.js (triggering the update flow) and orphans the old engine cache,
which activate then deletes. Verified directly: `all` → fingerprint
`3ceda91bae3ddbd8`, `lite-only` → `ff76817ae7b3caf8`, back to `all` →
`3ceda91bae3ddbd8`. The offline e2e's cache-name assertion was updated to the
fingerprinted form.

**Docs and deployment.** README gained the profile table with trade-offs and
a platform-limits table sourced from official documentation read 2026-11-01
(Vercel CLI upload 100 MB Hobby / 1 GB Pro, no documented per-file static
limit; Netlify no documented hard limit, CLI/Git advised; **Cloudflare Pages
25 MiB per file — full builds cannot be Pages assets**, use lite-only or
external+R2; Docker/nginx disk-only), a rewritten CDN recipe (uploader usage
with `ENGINE_CDN_PUBLIC_BASE_URL` + `engine-cdn-url.txt`, R2 CORS JSON,
second-host `_headers`, the CSP step, honest Brotli note), `ENGINE_BASE_URL`
documented as an alias of the canonical `NEXT_PUBLIC_ENGINE_BASE_URL`
(bridged in next.config.js), `docker-compose.yml` added (build-arg profile +
CDN base; headers come from the Next server), and `engine:upload` /
`test:profiles` npm aliases. **Docker itself is unavailable on this VM, so
the image build remains unverified here** — the Dockerfile/compose were
reviewed and the compose file parses, nothing more is claimed.

**Gate (final tree):** `npm ci` ✓, typecheck ✓, lint ✓, i18n:check ✓ (572
keys), test:profiles ✓, `npm test` **842/842 (79 files)** ✓, build ✓ (bundle
147.5 / 185.4 KB), light e2e **14/14** ✓, visual **8/8** ✓ (baselines
unchanged), CDN e2e 1/1 ✓, lite e2e 1/1 ✓. No deployment.

## 19. Round 2 addendum — Prompt 8 executed (2026-11-01): real-screenshot & photo proof for vision, deskew/quad/normalize retries, Beta label restored (K9 updated)

**Tooling.** `npm run vision:eval -- <folder>` (new: `scripts/vision-eval.mjs` +
`scripts/vision-eval-entry.ts`) evaluates ANY folder of images against
`<image>.fen` sidecars or a `manifest.json`, using the exact shipped
pipeline — the supported way to measure e.g. a chess.com board locally
without committing proprietary imagery. Baseline reproduced the recorded
Round 1 numbers exactly before any change (clean 99.96%, realistic 100%,
rotated 55.47%).

**Fixture corpus: 102 → 131** (`tests/fixtures/vision/SOURCES.md` has
per-fixture source, licence and ground-truth method).

- **26 genuine lichess screenshots** (`scripts/capture-lichess-fixtures.mjs`):
  the public analysis board (cburnett pieces, brown theme), ground truth
  extracted from the chessground DOM and asserted before capture. Matrix:
  10 positions as element shots, 4 flipped, 4 mobile-viewport, 2 with
  played moves (highlights), 6 full-page. Two capture bugs were found and
  fixed along the way: lichess flips the board for black-to-move FENs
  (the pawn-endgame captures' ground truth is now recorded image-oriented,
  matching the recognizer's contract — the UI owns flipping), and capture
  scripts must rotate the recorded FEN whenever the board renders
  orientation-black.
- **3 photographs** (Wikimedia Commons: CC0 Staunton startpos top view;
  CC BY-SA 4.0 figurine set rotated 90°; CC BY-SA 3.0 startpos from
  Black's side), ground truth transcribed and verified square-by-square.
  Six further licensed candidates were inspected and **rejected** for
  transcription uncertainty (documented per file in SOURCES.md) — the
  spec's "≥10 photos if properly licensed ones can be found" was pursued;
  ground-truth certainty won over count (n=3, reported as such).

**Detector fixes (each found by a measured failure):**

1. Candidate generation never proposed the board edge one period _before_
   the phase residue — boards filling the frame (all lichess element
   shots) produced zero candidates and went undetected. Starts now
   include phase − period and the image boundaries; cell sizes period±1
   are swept. Screenshots went 4/26 → 26/26 detected.
2. Period selection took any lag ≥ 80% of the autocorrelation peak; on a
   full lichess page a coincidental 27 px alignment (⅔ of the true 41 px
   cell) won and the detector chased a phantom 460 px board. Periods now
   come from up to three autocorrelation local maxima (≥55% of peak) with
   exact-multiple harmonic protection; checkerboard evidence decides.
3. Grid-line snap ranges widened (±5/±7 → ±10/±14) after an endgame shot's
   refined rect missed by (−6, +8) — just outside the old ranges.

**Pipeline retry ladder** (`src/vision/pipeline.ts`, new
`src/vision/geometry.ts`): confident first passes return untouched;
low-confidence ones try a **perspective quad** (multi-start corner
descent; homography sampling in `recognizeSquaresQuad`), a **deskew**
(edge-profile-energy tilt estimate; rotate, re-detect, re-recognize), and
**CLAHE-like local contrast normalization** — a retry is adopted only
when it beats the incumbent mean confidence by ≥ 0.03.

**Final measured accuracy** (131 images, `npm run vision:eval`, also
asserted in `tests/unit/vision-fixtures.test.ts`):

| Category                   | Detected |         Square accuracy | Perfect |
| -------------------------- | -------: | ----------------------: | ------: |
| Clean renders              |    80/80 | **100.00%** (5120/5120) |      80 |
| Realistic renders          |    16/16 | **100.00%** (1024/1024) |      16 |
| Real screenshots (lichess) |    26/26 | **100.00%** (1664/1664) |      26 |
| Rotated + compressed       |      6/6 |    **97.92%** (376/384) |       5 |
| Photographs                |      3/3 |     **28.65%** (55/192) |       0 |

The rotated acceptance (≥90% at ≤5°/q50) is **met** (97.92%). Overall
98.27%, mean 244 ms/image in Node; worst lichess rect error 8.1 px.
Confidence reliability over the corpus: ≥0.95 → 99.65% actual, 0.90–0.95
→ 100%, 0.80–0.90 → 100%, 0.70–0.80 → 98.99%, 0.60–0.70 → 99.35%,
<0.60 → 74.83% (published in the README).

**Beta label: RESTORED.** The rule (screenshots ≥95% AND photos ≥85%)
fails on photographs (28.65%), so the Image tab again shows "Beta"
(new i18n key ×4 locales; the component test's old absence assertion was
updated to assert presence with the reason recorded), and the
no-board help copy no longer claims rotation is unsupported. Photo
failures by cause: two Staunton-style photos — the detected rectangle
lands on frame/shadow under perspective; one figurine photo — pieces
outside the template family. The mandatory review step remains the
safeguard for exactly these inputs.

**Privacy:** `tests/unit/vision-privacy.test.ts` fails if any
`src/vision` module references a network API; the single pinned exception
is client.ts fetching the app's own same-origin piece-set SVGs (it sends
nothing; the user's image never enters a network path).

**ML:** `scripts/train-piece-classifier.py` defines the full training
pipeline (fixture-derived patches, held-out real-input split, ONNX
export) but was **not run** — no PyTorch in this environment — and no
model ships. Template matching remains the only path; this is stated in
the script header and the README, not hidden.

**Timing vs the <1.5 s/1080p target:** Node-side means: screenshots
~250 ms, rotated (deskew path, 800×800) ~590 ms, photos (all retries,
1600 px) ~1.18 s. The client caps inputs at 1600 px, so the worst
retry-heavy path stays in the ~1.2 s class; the target is met on every
measured category in this environment, with photos closest to the line.

**i18n count note:** the checker reports **570 keys** on the final tree
(§17's 568 + Prompt 7's engine-bundle key + this prompt's betaLabel);
§18's "572" was a miscount in that addendum and is corrected here.

**Gate (final tree):** npm ci ✓, typecheck ✓, lint ✓, i18n:check ✓ (570
keys), `npm test` **848/848 (80 files)** ✓ (vision-fixtures incl. new
screenshot/photo describes, vision-privacy 2/2, image-input with the
restored Beta assertion), build ✓ (147.5 / 185.5 KB), light e2e **14/14**
✓, visual **8/8** ✓. No deployment.

**ERRATA (found in Prompt 9, detailed in §20):** the "light e2e 14/14,
visual 8/8" figures above came from the light project only. A full
`npm run test:e2e` run made during this prompt's gate actually contained
19 failures (a stale reused dev server plus a Playwright project defect
that ran the CDN/lite specs against the wrong build), and its result was
misread as green from partial output. The heavy project — including
`review.spec.ts`, which Prompt 6's accessibility role changes had
silently broken — was not verified green at this gate. All of it is
repaired and re-verified in §20 (full e2e 36/36, CDN 1/1, lite 1/1).

---

## 20. Round 2 — Prompt 9: cleanup & hardening (K6 and K8 CLOSED)

**Hydration #418 (K6 item 1) — not reproducible; locked by a regression
suite.** The error does not occur on the current tree in any of 14
scenarios tried (production + dev servers; dark/light OS scheme; stored
settings with the opposite theme; all four locales via persisted
settings AND via browser language hi-IN/pa-IN/es-ES; first visit and
reload). Root-cause account: Prompt 6's restructure made the first
render deterministic — server and first client render both use the
default settings snapshot; the pre-paint theme script touches only
`<html data-theme>` (the one attribute covered by the long-standing
`suppressHydrationWarning` on `<html>`); locale, dictionary and settings
apply in effects after hydration (`LocaleSync`, lazy `ensureDictionary`,
deferred zustand-persist rehydration). No `suppressHydrationWarning`
was added anywhere. The lock-in: `tests/e2e/hydration.spec.ts` sweeps
dark/light × en/hi/es/pa under opposite-theme seeds plus first-visit
browser-locale cases and fails on any console/page error matching
React's hydration signatures — **4/4 pass**, and a settle test proves
theme + `lang` actually apply afterwards (the sweep is not vacuous).

**Orphaned components (K6 item 2) — deleted, with a permanent check.**
Deleted: `ReviewHeader.tsx` and `AccuracyCard.tsx` (the spec's named
pair; zero imports — their functionality lives inline in
`src/app/review/page.tsx`), plus five further orphans the new check
found: `MoveFeedback.tsx`, `OpeningCard.tsx`, `KeyMoments.tsx`,
`ui/Modal.tsx`, `ui/Tooltip.tsx` (each verified unreferenced in src and
tests first). The engine-label crowding (K6 item 3) died with
`ReviewHeader`. New: `scripts/check-unused.mjs` — an import-graph
reachability check from the app entries (`npm run check:unused`, wired
into CI); 115 source files, all reachable except three allowlisted
entries with stated reasons (`src/i18n/dictionaries.ts` — the test
facade for the lazily-loaded production dictionaries;
`budgetRules.d.mts` / `swCore.d.mts` — declaration siblings).

**Tooling.** ESLint: the registry was checked (2026-11-01) — the latest
ESLint is 10.14.0, but `eslint-config-next@15.5.28` (the latest Next
15.5.x) declares peer support only up to ESLint 9, and **9.39.5 is
already the latest 9.x**, so the toolchain is at the newest compatible
versions; no unsupported-version warning reproduces. Dependabot
(weekly, grouped) will move ESLint when Next 16 lands. Prettier now
runs repo-wide (`format`/`format:check`, with `.prettierignore`
excluding build output, engine files, the SW, openings data and
fixtures); a one-time format touched 173 files with typecheck green
throughout, and `format:check` is a CI step. **All 32 dependencies are
pinned to exact versions** (21 `^` ranges replaced with the lockfile's
resolved versions; the installed tree is unchanged). `.github/dependabot.yml`
added (npm grouped production/development/@types + github-actions).

**Shared rate limiter (K8) — CLOSED.** `src/server/rateLimit.ts` now
defines one async `RateLimiter` interface with two implementations:
`KvTokenBucketRateLimiter` (the burst-10 / refill-0.5·s⁻¹ bucket math
executed atomically in a Lua script over the same KV REST env as the
cache; key TTL = full-refill + 60 s; 1.5 s timeout) selected
automatically by `getImportRateLimiter()` when KV is configured, and
the in-memory bucket otherwise. The KV limiter **fails open** — any
store error allows the request and logs `[rate-limit] KV store
unavailable…` — because the limiter guards free public APIs, not
payments. Both API routes now await the async check. Tests (with an
in-memory fake implementing the EVAL bucket semantics): burst/block/
refill parity with the in-memory limiter, fail-open on throw and on
HTTP 500, and env-based selection. The README documents the
configuration table and the trusted-proxy contract (`x-forwarded-for`
must be edge-controlled; self-hosted proxies must overwrite, not
append).

**Security pass.** Header consistency: the drift-guard suite
(`tests/unit/security-headers.test.ts`) passes across all five surfaces
(next.config.js, vercel.json, netlify.toml, `public/_headers`, swCore).
Nonce-based CSP was evaluated in full and is **not feasible** for this
app's delivery model — nonces require per-request dynamic rendering
(this app is statically generated), the SW serves a cached shell whose
CSP cannot carry a per-request nonce, and the hash variant was already
tried in Round 1 and reverted with evidence (browsers ignore
`'unsafe-inline'` next to a hash, which blocked every Flight script).
The full argument and the residual-risk statement are in the new
`SECURITY.md`. CI now runs `npm audit --omit=dev --audit-level=high`
with the fix/triage policy written in SECURITY.md; note honestly that
the audit endpoint is blocked by this sandbox's managed-registry
policy (`policy_denied`), so the audit itself runs in GitHub Actions,
not here — no local findings are claimed.

**Test-infrastructure defects found and repaired during this prompt
(candid).** (1) The Playwright `heavy` project's testMatch included
`cdn.spec.ts` and `lite.spec.ts`, which need their own builds/servers —
any full `playwright test` ran them against the standard build and they
failed spuriously (visible in the Prompt 8 gate's e2e log: 19 failed /
15 passed, alongside mass fast failures caused by a stale reused server
under `reuseExistingServer`). The config now excludes them from heavy
(`HEAVY_CORE_SPECS`); they run in their dedicated projects/CI steps.
(2) `review.spec.ts` had been failing since **Prompt 6**: the eval bar
became `role="meter"` and the eval graph `role="slider"` (accessibility
improvements), while the spec still located `role="img"`; Prompt 6 also
added the board's own `aria-live` region, making the spec's announcer
locator ambiguous. The spec now asserts the current contract — meter
visible, slider named "Evaluation graph" visible, announcer scoped by
its "Move N:" pattern — which is stronger than the original checks.
Prompt 6/7 gates ran only the light project, and this prompt's first
full run exposed all of it; §19 carries an errata note.

**Gate (final tree):** npm ci ✓, typecheck ✓, lint ✓ (zero findings —
one unused import in a Prompt 8 script removed), format:check ✓,
check:unused ✓, i18n:check ✓ (570 keys), `npm test` **849/849
(80 files)** ✓ (+3 rate-limiter tests), build ✓ (147.5 / 185.5 KB) +
engine profile tests ✓, **full e2e 36/36** ✓ (light 18 + heavy core 17

- noiso pool 1, incl. hydration 4/4 and the repaired review.spec),
  CDN e2e 1/1 ✓, lite e2e 1/1 ✓. No deployment.

---

## 21. Round 2 — Prompt 10: i18n depth (K7 wording updated, not closed)

**Glossary.** `src/i18n/GLOSSARY.md` records the canonical rendering of
21 recurring terms (all classification labels, piece names, Accuracy,
Game Review, Engine lines, Retry) across the four locales, plus the
policies: Stockfish and Beta are never translated; opening names stay
English (proper nouns from the dataset); Hindi/Punjabi use the
respectful आप/तुसीं forms and the traditional Indian piece names
(ऊंट/ਊਠ, हाथी/ਹਾਥੀ, वज़ीर/ਵਜ਼ੀਰ). `npm run glossary:check` (new, in CI)
parses the table from the Markdown and fails if any catalogue value
drifts from it, and separately verifies Stockfish survives in every
locale for every key whose English mentions it. **Passes.**

**Review workflow.** `npm run i18n:export-review` writes
`i18n/review/<locale>.csv` (579 rows per locale: key, English, current
translation, context note, length budget ≈1.3× English for short UI
strings, reviewer, status — starting at `machine-assisted` / `source`).
`npm run i18n:import-review -- <locale>` validates (exact placeholder
match, non-empty, budgets, known keys, no duplicates) and merges only
`reviewed` rows into the catalogue by located leaf replacement, then
re-verifies the compiled catalogue (restoring the original on any
failure). Verified end to end: unchanged CSVs import as no-ops for all
four locales; a synthetic reviewed edit merged exactly one leaf; a
placeholder-dropping CSV was rejected with the catalogue untouched.
Unit tests cover the CSV round-trip (quotes/commas/newlines/
Devanagari) and every validation rule. **No locale has been
human-reviewed** — the settings drawer's language list now says so
next to हिन्दी / Español / ਪੰਜਾਬੀ (`settings.machineAssistedShort`),
and the README states it plainly.

**Quality pass.** The whole-sentence-template rule was audited: no
code concatenates translated fragments (grep-verified), feedback was
already whole-sentence per locale, and plural selection through
`Intl.PluralRules` already existed. The count-bearing keys were
audited one by one and three genuinely count-sensitive strings were
converted to plural entries in all four locales —
`input.parseErrorBody` (a readable prefix can be one move),
`board.kbSelected` (one legal move), `settings.cacheCurrently` (one
cached position) — joining `input.multiGames`. The others were left
with documented reasons in GLOSSARY.md (parenthetical "(found N)"
counts are grammar-neutral; the too-many-pieces/pawns errors only
occur at plural counts; progress frames substitute numerals).
Numbers/dates already flow through `Intl.NumberFormat` /
`Intl.DateTimeFormat` per locale.

**Localized metadata.** `meta.title` / `meta.description` catalogue
keys (574 keys total now) are applied by `LocaleSync` once the
dictionary loads: document title, meta description, and the manifest
link (per-locale `manifest.hi/es/pa.webmanifest` with localized name,
short_name, description and shortcuts). Two honest limits remain:
the statically generated HTML head is English (per-user
`generateMetadata` would require giving up static generation), and
the Apple web-app title has no runtime handle. One real defect was
found and fixed on the way: React 19 re-asserts the metadata `<title>`
when the tree re-renders, silently reverting the localized title on
the data-heavy review page (probed: description and manifest stuck,
title reverted) — `LocaleSync` now defends the title with a
divergence-only MutationObserver.

**Fonts.** Inter ships only Latin/Latin-ext subsets and contains no
Devanagari or Gurmukhi glyphs at all (verified: the vendored files are
the latin subsets; the scripts are outside Inter's charset), so
Hindi/Punjabi previously fell back to arbitrary system fonts. Added
self-hosted **Noto Sans Devanagari (121 KB) and Noto Sans Gurmukhi
(34 KB)** variable fonts (Fontsource 5.3.0, SIL OFL 1.1, LICENSES.md
updated) declared with `unicode-range` in globals.css — browsers
download them only when those scripts render. The new per-locale e2e
tests assert the faces actually load (`document.fonts.check` with
script sample text).

**Per-locale screenshot tests.** `tests/e2e/i18n.spec.ts` grows from
6 to 11 tests: Hindi desktop (summary + move feedback + font + title +
manifest), Spanish desktop (summary + the drawer's machine-assisted
marking), Punjabi desktop (summary + font), Spanish and Punjabi
summaries at mobile width — all with the no-horizontal-overflow
assertion, joining the existing Hindi/Punjabi mobile and pseudo-locale
coverage.

**Gate (final tree):** typecheck ✓, lint ✓, format:check ✓,
check:unused ✓, i18n:check ✓ (574 keys), glossary:check ✓,
`npm test` **854/854 (81 files)** ✓ (+5 review-workflow tests; one
drawer component test updated to assert the new marked option labels),
build ✓ (147.8 / 185.6 KB), **full e2e 41/41** ✓. npm ci note: this
sandbox's filesystem went through a prolonged write-denial episode
during this prompt (extraction files truncated/zeroed; a service
restart eventually cleared it) — the installed tree was completed and
verified by integrity scans (every package.json parses; remaining
zero-length files confirmed as legitimately-empty published files,
e.g. `client-only/index.js`, resolve test fixtures) before the gate
numbers above were taken. No deployment.


---

## Addendum — Themes & Presets, Stage A (2026-11-02)

**Data-driven theme registry** in `src/themes/` (ids centralized in
`ids.ts` so lightweight importers never drag in definition modules):
boards, piece sets, backgrounds, sound themes, animation styles and
presets are all typed definitions with categories, flags, provenance
and license fields; legacy modules (`src/lib/boardThemes.ts`,
`src/lib/pieces.ts`) became shims over the registry. Every asset is
logged in `src/themes/PROVENANCE.md`.

**`/settings` page** (`src/app/settings/` + `src/components/settings/`):
left section navigation with search, a Boards / Pieces / Background /
Presets tab group for Board & Pieces, a live MiniPreview (4×4 board
rendered from the real definitions), and a draft model — nothing
persists until **Save**; Cancel, Esc, Ctrl+S and beforeunload guards
protect unsaved changes. Board options shipped: highlight style
(solid/ring), move-hint style (dots/rings/none), animation style.
The quick drawer gained an "Open the full settings page →" link.
**Preset engine:** curated presets apply as settings patches; user
presets (create/rename/duplicate/delete) with Zod-validated JSON
import/export, favorites (`<kind>:<id>` keys), "Surprise me" random
combinations (low-readability and animated assets excluded), and
randomize-after-game on the review page (fresh games only). Three
sample presets shipped (Classic Green, Warm Wood, High Contrast).
**Settings schema v2** with full migration/normalization (unknown ids
fall back to registry defaults). **`npm run themes:check`** validates
unique ids, labels in all 4 locales, piece folders (exactly 12 SVGs,
matching viewBox, no external references, per-set size budget,
LICENSE.txt), board coordinate contrast ≥ 4.5, highlight ΔE rules,
background readability, preset references and PROVENANCE coverage.

**Gate (Stage A tree):** npm ci ✓ (825 packages) · typecheck ✓ ·
lint ✓ (0 errors) · `npm test` **941/941 (85 files)** ✓ (854 baseline
+ 87) · build ✓ — First Load JS **/** 152.6 KB gzip, **/review**
191.8 KB · e2e: settings 5/5, axe on /settings (see the Stage B note —
the zero-violations claim for the full page was later found
incomplete and fixed in Stage B) · `themes:check` ✓ · `i18n:check` ✓
(693 keys × 4) · `glossary:check` ✓ · `format:check` ✓ ·
`check:unused` ✓. Screenshots of the new page were captured for
layout review (`~/workspace/themes-screenshots/`).

---

## Addendum — Themes & Presets, Stage B (2026-11-02)

**34 boards** (6 legacy + 28 new): additional flat colors, three wood
finishes, stone/marble/metal/glass/ice/translucent materials via
original CSS gradients and four hand-written SVG turbulence filters
(`ThemeFilterDefs`: grain, wood, burl, marble), plus paper, blueprint,
neon, bubblegum, glitter, 8-bit, checkers and overlay styles. The
settings drawer quick-picks stay at the original six boards.
**28 backgrounds** (7 + 21): CSS textures (wood, marble, stone,
metal, newspaper, felt) and scenic pages (space and cosmos animated,
ocean, icy sea, nature, gothic, graffiti, neon grid, 8-bit,
bubblegum, confetti, glass), plus three **custom** backgrounds — a
user color, a two-stop gradient with angle, and a user image
(≤ 5 MiB, downscaled to ≤ 2560 px, stored only in a dedicated
IndexedDB database on the device; validated by tests asserting zero
network calls). Scrim/readability is verified by `themes:check`;
animated backgrounds pause on hidden tabs and honor a
`lowPowerBackgrounds` setting and reduced motion. **Picker UX:**
search + category chips + favorites-only filter and star toggles on
the Boards and Background tabs. **Gallery:** unlinked
`/theme-gallery` page rendering every board/background from the
registry, with Playwright contact-sheet tests (dark + light).

**Axe debt found and fixed.** Stage A's settings-page axe claim
covered only the landing view; a full tab-by-tab probe found the real
issues and they are fixed in the app: white text on the brand green
(`#81b64c`, 2.4:1) in selected tabs/chips/buttons now uses dark
`#1c2b0d` text (8.4:1); heading order corrected; preview heading
color follows the draft background's theme; the header back-link is
ink-colored. Verified by direct axe probe: **zero violations on
every settings tab and section, both UI themes.** One documented
exception is carried: `label-content-name-mismatch` on preset cards
(axe counts the cards' aria-hidden MiniPreview coordinate glyphs as
visible text; the card's accessible name is its visible name — the
same class as the Round-2 review-board exception). `themes:check`
also caught real board contrast defects (Icy Sea / Sky / Orange dark
squares, Dark Green / Teal coordinate colors, Checkers legal-dot,
Translucent coordinates), all fixed in the token data.

**Gate (Stage B tree):** typecheck ✓ · lint ✓ (0 errors, 1
pre-existing warning in scripts/i18n-review-lib.mjs) ·
`npm test` **961/961 (85 files)** ✓ (+20) · build ✓ — First Load JS
**/** 158.2 KB gzip (budget 170), **/review** 196.6 KB (budget 220).
Against the Round-2 baselines (147.8/185.6) that is +10.4/+11.0 KB:
the +10 KB program guideline is marginally exceeded (≈1 KB) — the
delta is the 28 new boards' token data itself (feature data, not
code); both hard budgets pass with headroom · `themes:check` ✓
(34 boards, 28 backgrounds; the checker also learned to tolerate
markdown table padding and to skip `custom` background placeholders,
whose rendered colors come from user settings) · `i18n:check` ✓
(758 keys × 4) · `glossary:check` ✓ · `format:check` ✓ ·
`check:unused` ✓ · e2e: settings + axe + gallery 12/12 ✓. npm ci was
not re-run for Stage B: no dependency changed since the clean
Stage A install.

---

## Addendum — Themes & Presets, Stage C (2026-11-02)

**Piece sets — 31 new sets, 36 total.** Nine hand-authored base
silhouettes were drawn for this stage (Staunton, Modern Soft,
Figurine, Gothic, Pixel, Token, Letter, Cases, Animal — coordinates
written from scratch in the generator; the letter bases include
per-side geometry so Cases renders UPPERCASE glyphs for White and
lowercase for Black). `scripts/make-piece-sets.mjs` — the Prompt 7
generator, extended, not replaced; its four legacy outputs regenerate
byte-identically — combines the bases with style recipes (flat,
gradients, SVG-pattern fills, a glow filter, ghost fills, per-piece
patterns) into 31 sets: Staunton, Outline, Glass, Marble, Metal,
Wood, 3D Look, Newspaper, Symbols, Large, Colorblind Safe, Modern
Soft, Club, Icy, Neon, Bubblegum, Space, Figurine, Nature, Lolz,
Gothic, Medieval, Graffiti, 8-Bit, Arcade, Dash, Bases, Letters,
Cases, Animals, Tigers. Every set is 4.4–11.3 KB total (budget
40 KB), every SVG < 6 KB; all 36 sets together are 323 KB on disk
and only the active set ever loads. `themes:check` now also runs
the generator in --check mode, so a hand-edited or stale SVG fails
the gate. Contact sheets were eyeballed for every set on two boards;
three readability flaws were found and fixed from the sheets: letter
glyphs got backing tiles (light-ink glyphs vanished on light
squares), the Outline black-side fill was deepened, and the Gothic
pawn was shortened so it cannot be confused with the Gothic bishop.
The Pieces tab gained the same search/category/favorites filter bar
as Boards/Background; the quick drawer keeps the original five sets.

**Sound themes — Web Audio synthesis.** `src/themes/soundEngine.ts`
(new, lazily imported) renders six synth themes — Soft, Marble,
Glass, Metal, Arcade, Playful — from per-event voice tables (tones
with frequency glides and noise bursts through biquad filters); no
audio files. `useSound` now routes through the registry (Stage A
registered `soundThemeId` but playback stayed on the WAV set):
engine 'none' is silent, 'wav' keeps the original files, 'synth'
plays the recipes. A master `soundVolume` setting (0–1, default
0.5 = the previous hardcoded WAV volume) was added with migration
clamping, a slider in Settings → Sounds, and the Test button now
auditions the *draft* theme at the draft volume before saving. Unit
tests drive the scheduler through a structural fake AudioContext.

**Blindfold mode.** New boolean setting (schema stays v2) in Board
options: the board renders no piece images at all; squares,
coordinates, hints, arrows and the move list are untouched, and
every square keeps its accessible name ("e4, white pawn"), so
screen-reader play is unaffected. Covered by an e2e test (64
squares, zero board piece images; the only piece images left on the
review page are the two static White/Black player chips in the
header).

**Presets — 22 curated.** 19 new combinations (Dark Tournament,
Burled Study, Walnut Library, Marble Hall, Glass Night, Icy Sea,
Neon Arcade, 8-Bit Arcade, Bubblegum, Newspaper Print, Parchment,
Space Voyage, Cosmos, Ocean Breeze, Midnight Blue, Gothic Castle,
Colorblind Safe, Minimal Light, Focus), each referencing only
registered ids (validated by unit tests + themes:check) and rendered
on the gallery presets contact sheet.

**Quality gates.** Axe now runs over `/settings` in all four locales
across every Board & Pieces tab plus the Sounds and Accessibility
sections (the presets tab keeps the documented Stage B
`label-content-name-mismatch` exception); gallery e2e covers pieces
(36) and presets (22) contact sheets in dark + light UI with
committed baselines. Theme switching measured on the settings page:
median 32 ms, max 78 ms per switch (gate: < 100 ms). README's
"Adding a theme" section and LICENSES.md were updated for the
generated-piece workflow and the 31 new sets.

**Gate (Stage C tree):** npm ci ✓ (see environment note below) ·
typecheck ✓ · lint ✓ (0 errors, 1 pre-existing warning in
scripts/i18n-review-lib.mjs) · `npm test` **1001/1001 (86 files)** ✓
(961 + 40: sound-engine recipes/scheduler/migration, registry
updates, per-set asset loops) · build ✓ — First Load JS **/**
161.3 KB gzip (budget 170), **/review** 199.8 KB (budget 220).
Cumulative growth vs the Round-2 baselines (147.8/185.6) is
+13.5/+14.2 KB: the program's +10 KB guideline is exceeded by
≈3.5 KB — the delta is theme catalogue data (34 boards' tokens from
Stage B, 36 piece-set and 22 preset definitions in Stage C), not
code; the sound engine is lazy-loaded and piece artwork is static
files. Both hard budgets pass · `themes:check` ✓ (34 boards,
36 piece sets, 28 backgrounds, 8 sound themes, 4 animation styles,
22 presets; labels in 4 locales, contrast + provenance + generator
freshness verified) · `i18n:check` ✓ (817 keys × 4) ·
`glossary:check` ✓ · `check:unused` ✓ · `format:check` ✓ except
`deploy-manifest.json` (machine-generated by the deploy script;
regenerated on every deploy, left untouched) · e2e (production
build, this session): themes-gallery 8/8 ✓ (boards, backgrounds,
pieces, presets × dark/light — pieces and presets baselines newly
committed); a combined settings+axe+gallery batch ran 21/22, the
one failure being this stage's new blindfold test pointing at the
wrong surface (it asserted on the home page, which mounts no board)
— fixed to the seeded review surface and re-run green standalone;
theme-switch latency measured separately (median 32 ms). **Not
re-run before this report:** the remaining light specs
(board-keyboard, hydration, i18n, mobile, offline, security), a
full settings-spec re-run, and the new axe-in-4-locales tests — the
shared host's memory was exhausted by other work (125 MB free of
8 GB with no process in this cell accounting for it), so Chromium
could not launch at all (every attempt failing at
browserType.launch in ~2 ms, before any app code; the browser
binary runs standalone and disk is 3% used). These specs should be
re-run on a quiet host; nothing in them touches Stage C behavior
except the axe-locale tests, whose English-tab equivalents passed
in the batch above.

**Environment note.** This sandbox's intermittent EPERM write
episodes (documented in §5 of Part I) were active throughout this
stage's final gate. Three `npm ci` runs landed with hundreds of
zero-byte files scattered through node_modules (each run corrupting
different packages — @testing-library/jest-dom type files, then
@types/node) before a fourth run installed cleanly; all gate numbers
above come from the verified-clean install. The episodes also
truncated this RELEASE_REPORT.md to zero bytes twice during
formatting passes; the Round-2 report was restored from the
delivery zip (`~/workspace/your_files/chess-review.zip`) and the
restore was verified **byte-identical** with `cmp` before the three
Themes & Presets addenda were re-appended (the Stage A and B
addenda are faithful reconstructions from the program's recorded
gate results; the Stage C addendum is original). All restores were
written through the reliable file channel only — shell-channel
writes remained EPERM-blocked throughout the incident.
