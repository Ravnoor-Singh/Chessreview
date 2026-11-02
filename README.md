# Chess Review — Stockfish-powered game review (chess.com-style)

A production-quality **Chess Game Review** web app in the style of chess.com's
Game Review, powered by the real **Stockfish 19** engine running entirely in
your browser via WebAssembly. Paste a PGN, enter a FEN, or import a game from
**chess.com** or **Lichess**, and get accuracy scores, move classifications
(Brilliant `!!` … Blunder `??`), opening identification, engine lines, an
evaluation bar/graph, coach feedback with Retry mode, and explorable
variations — all computed locally. Nothing is uploaded; analysis never leaves
your device.

> Not affiliated with chess.com. The look is "chess.com-style"; no chess.com
> trademarks, logos, or proprietary artwork are used. Pieces are the
> open-licensed **cburnett** set. The engine is GPLv3 — see `LICENSES.md`.

## Quick start

```bash
npm install     # also copies the Stockfish builds into /public/engine
npm run dev     # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Tests:

```bash
npm test                    # Vitest suite (854 tests: unit + component + integration)
npm run test:coverage       # same suite with enforced coverage thresholds
npm run i18n:check          # i18n catalogue parity / placeholder / empty-string check
npm run glossary:check      # canonical-term consistency (src/i18n/GLOSSARY.md)
npm run check:unused        # fails if a source file is unreachable from the app entries
npm run format:check        # Prettier over the whole repo
npm run bench               # analysis-speed benchmark (scripts/bench.mjs, needs the engine from npm install)
npx playwright install chromium
npm run test:e2e            # full Playwright suite: light + heavy + no-isolation projects (41 tests)
npm run test:e2e:cdn        # engine-from-CDN deployment test (own build + servers)
npm run test:e2e:lite       # lite-only engine profile test (own build + server)
npm run lint                # ESLint CLI (eslint .)
npm run typecheck           # tsc --noEmit
npm run check               # typecheck + lint + test + build, in order
```

### Offline build smoke test

Inter is **self-hosted** (`next/font/local`, variable WOFF2 files committed
under `src/assets/fonts/` — latin + latin-ext, SIL OFL 1.1, see
`LICENSES.md`), so no font — and nothing else — is fetched at build time.
After the one online install, the production build works with the network
fully disabled:

```bash
npm ci                      # online, once: installs deps + copies the engine
# …now disconnect / disable networking…
npm run build               # must succeed offline
npm run start               # app runs offline; analysis is fully local
```

Verify the font really is local in the build output:

```bash
grep -rn "next/font/google" src/            # → no matches
ls .next/static/media/*.woff2               # → the two Inter subset files
grep -o "font-family:[^;]*" .next/static/css/*.css | grep -i inter
# → the built CSS declares @font-face for the local files above
```

`npm run format:check` is intentionally scoped to the tooling/config files
(`package.json`, `eslint.config.mjs`, `src/app/layout.tsx`, the CI workflow):
most of `src/` predates Prettier enforcement (40+ files differ), and
reformatting the whole tree would bury real changes in a cosmetic mega-diff.
New and edited files should be kept Prettier-clean; widen the scope in
`package.json` as files are cleaned up.

CI (`.github/workflows/ci.yml`) runs on every push and pull request: a
`check` job (`npm ci` → typecheck → lint → unit tests → build, Node from
`.nvmrc`) and a separate Playwright `e2e` job (15-minute timeout) that
uploads its HTML report as an artifact when it fails.

## How it works

### Engine (Stockfish in a Web Worker)

- The `stockfish` npm package (Stockfish.js, **Stockfish 19.0.1**) ships
  engine builds that _are_ Web Worker scripts. A `postinstall` script
  (`scripts/copy-engine.mjs`) copies them to `public/engine/`; the loader
  resolves its `.wasm` next to the `.js`, so file names are preserved.
  `public/engine/` is git-ignored and re-created by every `npm install`.
- `src/engine/stockfish.worker.ts` wraps the worker in a typed API
  (`init / analyze / stop / setOption` → `ready / info / done / error`),
  handling the UCI handshake (`id name …` is shown in the UI footer),
  `Threads` (≤ `hardwareConcurrency − 1`, max 8), `Hash` (128 MB desktop /
  32 MB mobile), `MultiPV = 3`, `UCI_AnalyseMode`, `UCI_ShowWDL`.
- **Threading & fallback (spec §2.1):** when the page is cross-origin isolated
  (`crossOriginIsolated` + `SharedArrayBuffer`), the multi-threaded build
  (`stockfish-19.js`) is used. Otherwise it automatically falls back to the
  single-threaded build (`stockfish-19-single.js`), or the lite single build
  (`stockfish-19-lite-single.js`) on low-memory devices — surfaced only as a
  small "Engine: single-thread mode" badge, never a crash. Settings can
  override Threads/Hash.

### Engine payload (what ships, and why it is the size it is)

Run the audit yourself with `npm run engine:report`
(`scripts/engine-report.mjs`). Measured on Stockfish 19.0.1:

| File                          | Size (bytes) |      Size | Runtime mode | Ships by default |
| ----------------------------- | -----------: | --------: | ------------ | ---------------- |
| stockfish-19.js               |       33,326 |  32.5 KiB | multi        | yes              |
| stockfish-19.wasm             |   99,076,105 | 94.49 MiB | multi        | yes              |
| stockfish-19-single.js        |       28,130 |  27.5 KiB | single       | yes              |
| stockfish-19-single.wasm      |   99,169,054 | 94.57 MiB | single       | yes              |
| stockfish-19-lite-single.js   |       28,230 |  27.6 KiB | lite         | yes              |
| stockfish-19-lite-single.wasm |    1,845,971 |  1.76 MiB | lite         | yes              |
| stockfish-19-asm.js           |    3,155,627 |  3.01 MiB | unused       | no               |
| stockfish-19-lite.js          |       33,426 |  32.6 KiB | unused       | no               |
| stockfish-19-lite.wasm        |    1,697,617 |  1.62 MiB | unused       | no               |

- **Full package: 205,067,486 B (195.57 MiB). Default shipped set:
  200,180,816 B (190.91 MiB)** — the unused asm.js fallback and the
  multi-threaded lite build (4,886,670 B) are no longer copied. Opt back in
  with `ENGINE_INCLUDE_ASM=1` / `ENGINE_INCLUDE_LITE_MULTI=1` when running
  `node scripts/copy-engine.mjs`.
- **Why the shipped set cannot shrink much further:** the two full WASM
  builds are _different binaries_ (different SHA-256 in the manifest) and
  both are required — multi is the fast path on isolated desktops, single
  is the universal fallback — and WASM compresses poorly (brotli ratio
  ≈ 0.78). Dropping either one would remove either the fast path or the
  fallback. What a visitor actually downloads is **one** build:
  ~94.5 MiB (full) or ~1.8 MiB (lite), served `immutable` and cached.

#### Deployment profiles (`ENGINE_BUNDLE`)

What ships is selectable at install/build time (Round 2, Prompt 7) via
`ENGINE_BUNDLE` — set it before `npm ci` (the postinstall copy step) or
run `ENGINE_BUNDLE=<profile> node scripts/copy-engine.mjs` explicitly,
like the Dockerfile does. `npm run engine:report` prints this table from
the real files; `npm run test:profiles` verifies the shipped file list
and manifest hashes per profile.

| `ENGINE_BUNDLE` | Ships                   |                Deploy size | Trade-off                                                                                                                                                                                               |
| --------------- | ----------------------- | -------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all` (default) | multi + single + lite   | 200,180,816 B (190.91 MiB) | Every device gets its best build; the largest deploy.                                                                                                                                                   |
| `multi+lite`    | multi + lite            |  100,983,632 B (96.31 MiB) | Non-isolated devices use lite instead of the full single-thread build (weaker analysis there); isolated desktops unaffected. Fits under a 100 MB upload cap.                                            |
| `lite-only`     | lite                    |     1,874,201 B (1.79 MiB) | Tiny deploy for size-capped hosts; **every** analysis uses the weaker lite engine. The settings UI labels this plainly, and only offers the shipped build.                                              |
| `external`      | nothing (manifest only) |      0 B in the app deploy | The full payload (200,180,816 B) is hosted at `NEXT_PUBLIC_ENGINE_BASE_URL` instead — see "Hosting the engine on a CDN". The manifest still ships with the app so SHA-256 verification works unchanged. |

The loader is **manifest-driven**: `engine-manifest.json` lists exactly
the shipped files, and the client walks its fallback order only across
listed builds — it never requests a file the profile did not ship (a
non-isolated device on `multi+lite` goes straight to lite; nothing waits
on a 404). The settings drawer likewise offers only shipped builds.

**Platform limits** (checked against official documentation on
2026-11-01):

| Platform                   | Limit that matters here                                                                                                                                                                                | Consequence                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel                     | CLI source upload: 100 MB (Hobby) / 1 GB (Pro) total ([limits](https://vercel.com/docs/limits)); no per-file static-asset maximum documented                                                           | `all` (190.91 MiB) exceeds the Hobby CLI upload limit; `multi+lite` (96.31 MiB) fits it. Git-based deploys build from source, where the payload is produced during the build. |
| Netlify                    | No hard per-file or total limit documented for static deploys ([project docs](https://docs.netlify.com/manage/projects/add-new-project/)); drag-and-drop is advised against above ~50 MB — use Git/CLI | Any profile works on paper; prefer CLI/Git deploys at these sizes.                                                                                                            |
| Cloudflare Pages           | **25 MiB maximum per file** ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/))                                                                                                 | The full builds (~94.5 MiB each) **cannot** be Pages assets. Use `lite-only`, or `external` with the payload on R2.                                                           |
| Self-hosted Docker / nginx | No platform-imposed file limit (host disk only)                                                                                                                                                        | Any profile; `docker compose up --build` serves everything with the right headers (see `docker-compose.yml`).                                                                 |

- **Selection rules** (`selectEngineBuild`, unit-tested): lite when the
  device reports ≤ 2 GB memory (always); multi only when cross-origin
  isolated **and** `SharedArrayBuffer` **and** reported memory ≥ 4 GB (or
  unreported) **and** not a mobile user agent; otherwise single. Settings →
  _Engine build_ (Auto / Full / Single / Lite) overrides auto, except multi
  can never be forced when its requirements are missing — it falls back
  with an explanation. If the chosen build fails to load, startup degrades
  **multi → single → lite** and only errors when every build fails.
- **Manifest + integrity:** `copy-engine.mjs` also writes
  `public/engine/engine-manifest.json` (`{version, generatedAt, files:
[{name, size, sha256}]}`). Before starting, the client downloads the
  chosen build's WASM with progress, computes its SHA-256
  (`crypto.subtle`) and compares it to the manifest; a mismatch is a hard
  error and the engine is **not** started. The review page shows
  "Loading engine… N%" during this, and the footer shows the engine name,
  build, file and WASM size.
- **Loading & caching (honest version):** the packaged builds are worker
  scripts that fetch and instantiate _their own_ WASM, so the client does
  not hand bytes to the worker. The pre-download above warms the browser
  HTTP cache (the files are served `Cache-Control: public,
max-age=31536000, immutable` from `next.config.js`, `vercel.json`,
  `netlify.toml` and `public/_headers` alike); the worker is then
  constructed exactly as before and its own fetch resolves from the warm
  HTTP cache. Since Prompt 9 the persistent offline copy is the service
  worker's dedicated engine cache (see "PWA & offline" below); the
  loader's own Cache API copy (`chess-review-engine-v<version>`) is kept
  only for a cross-origin CDN engine base, which the SW cannot intercept.
  Verified end-to-end in Chromium
  (Playwright): a full sample-game analysis completes through this path
  with the multi-threaded build and no console errors.
- **Isolation headers are required for multi-threading** and are configured in
  `next.config.js` (`headers()`), `vercel.json`, `netlify.toml`, and
  `public/_headers`:
  `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp`. With COEP on, any third-party
  iframe/image you add later must send CORP/CORS headers or it will be
  blocked — the app itself loads only same-origin assets.
- **Pipeline (`src/engine/analyzer.ts`):** positions are evaluated under an
  **adaptive budget** (`src/engine/budget.ts`, rules in
  `src/engine/budgetRules.mjs`). A preset is a _target_ depth plus a _hard
  time ceiling_ — Quick: target 14 / 600 ms, Standard: target 18 / 1500 ms,
  Deep: target 22 / 4000 ms — not a fixed depth. Search stops early on
  **stability**: once past the preset's minimum depth (10/14/16), if the
  best move is unchanged for 4 consecutive depths and the score moved
  < 15 cp across that window, the position is done. **Critical positions**
  — a first pass whose eval swings by more than 12 win-% points versus the
  previous position, whose best move changed within the final 2 depths, or
  whose minimum-depth best move fell out of the finished pass's top-3 —
  are re-analyzed at the full target depth (at Standard with up to 2× the
  time ceiling). **Like-for-like depths:** a position cut shallower than
  its predecessor is extended to the predecessor's depth before its move
  is classified, so the played move's eval and the best move's eval always
  come from the same depth. **Terminal** positions
  (mate/stalemate/draw) get exact scores without an engine call;
  **one-legal-move** positions get a depth-1 evaluation only. **Book**
  positions use the same stability rules with a lower minimum depth
  (6/8/10); there is no flat shortcut depth — the last book position and
  the first non-book position are always analyzed at the full budget (the
  book extent is known from the opening index before analysis starts, so
  the boundary verification is folded into their initial pass).
- **Parallel pool (`src/engine/pool.ts`):** in multi-thread mode exactly
  one multi-threaded client is used, as before. In single/lite mode a pool
  of up to `min(4, hardwareConcurrency − 1)` single-thread clients
  (Hash 32 MB each) analyzes different positions concurrently; results are
  buffered and delivered to the review strictly in ply order, the board
  stays interactive, progress updates are throttled to at most 10/second
  with an estimated-time-remaining readout, and cancelling stops every
  worker immediately.
- **Cache (schema v2):** positions are cached in IndexedDB (`idb`), keyed
  by EPD-normalized FEN (halfmove/fullmove dropped) as
  `v2|${fen}|pv${n}|eng${engineVersion}|prof${preset}|d${achievedDepth}`,
  with LRU eviction at 50,000 entries. A cached result may serve a request
  when its achieved depth is at least the requesting profile's minimum
  depth (the shallowest sufficient entry wins); the v2 bump invalidates
  v1 entries, which carried no depth guarantees. Settings shows the cache
  size (position count + approximate bytes) next to the Clear button.
  Full reviews are persisted per PGN hash, so reopening a past review is
  instant.

### Evaluation math (spec §6, §8 — implemented exactly)

- **Win probability:** `winProb(cp) = 50 + 50 · (2/(1 + e^(−0.00368208·cp)) − 1)`;
  mate ⇒ 100/0. Stockfish scores (side-to-move) are normalized to White's
  perspective for storage; mates are encoded as `±(100000 − |mateIn|)`.
- **Expected-points loss (EPL):** `bestBefore − afterPlayed` in win% ÷ 100,
  preferring the played move's own MultiPV line when it appears there.
- **Move accuracy:** `103.1668 · e^(−0.04354·Δwin%) − 3.1669 + 1`, clamped 0–100.
- **Game accuracy:** per player, the mean of (a) a volatility-weighted
  arithmetic mean (weights = std-dev of win% over a sliding window of
  `clamp(floor(plies/10), 2, 8)`, clamped [0.5, 12]) and (b) the
  **unweighted** harmonic mean. Sides with < 6 moves show
  "Not enough moves". See "How accuracy is computed" below — the
  aggregation replicates Lichess's published method and is validated
  against Lichess's own stored accuracies.
- **Performance estimate** (labelled exactly that, never "rating"): a
  qualitative band (Beginner / Club / Strong club / Expert /
  Master-level play) from accuracy + ACPL. There is deliberately **no
  numeric rating estimate** — see the rating decision below.

### How accuracy is computed (Prompt 5)

The accuracy pipeline (`src/analysis/accuracy.ts`) replicates
**Lichess's published method** (lichess.org/page/accuracy; source:
lila `AccuracyPercent` + scalalib `Maths`), step for step:

1. **Win% per position.** Each position's eval (White's perspective)
   is clamped to **±1000 cp** — mates included (Lichess converts mate
   scores through the same ceiling, `WinPercent.fromCentiPawns` on a
   `Cp.ceiled` value) — then mapped through the logistic
   `win% = 50 + 50 · (2/(1 + e^(−0.00368208·cp)) − 1)`. Accuracy win%
   therefore lives in **[≈2.46, ≈97.54]**, never 0/100. (The eval bar
   and move classification keep using the unclamped `winProb`; only
   the accuracy path clamps.)
2. **Move accuracy.** From the mover's win% before/after:
   `103.1668 · e^(−0.04354·Δ) − 3.1669 + 1` with `Δ = max(0, before −
after)`, clamped to 0–100. A move that improves the mover's win%
   scores 100.
3. **Game accuracy.** Per player, the average of (a) the
   **volatility-weighted arithmetic mean** of their move accuracies —
   weights are the standard deviation of the win% series over a
   sliding window of `clamp(floor(plies/10), 2, 8)` positions ending
   at the move's resulting position (the first window is shared by
   the moves before the first full window), clamped to [0.5, 12] —
   and (b) the **unweighted harmonic mean** of the same accuracies
   (floored at 1 per move inside the mean, exactly like scalalib's
   `Maths.harmonicMean`). A side with < 6 moves shows
   "Not enough moves".

**Mate handling.** A delivered mate and a missed mate are both
scored through the ceiling: keeping a mate (or any ≥ +10.00
position) costs nothing, missing a mate-in-1 for a level position
costs ≈47 win% points (move accuracy ≈ 10.9), and a checkmated final
position is worth ≈97.54/2.46 — never a hard 100/0. Games ending by
resignation or timeout simply end: the eval series stops, only moves
actually played are charged, and no terminal eval is invented.
Edge cases are pinned in `tests/unit/accuracy-edge-cases.test.ts`
(mate series, < 6-move sides, resignation stop, forced stalemate,
blundering away a won position).

**Validation against Lichess.** `node scripts/validate-accuracy.mjs`
runs **offline** against 18 real games in
`tests/fixtures/lichess-reference/` whose per-position evaluations
_and_ per-player reference accuracies both come from Lichess's API
(provenance: `SOURCES.md` + the raw responses in `raw.ndjson`; the
fixtures' initial-position eval is Lichess's documented +15 cp
legacy initial value, the one approximation involved, worth
< 0.2 win% on White's first move only). Result over the fixture set:
**mean |diff| 0.35 points, max |diff| 1.14** (tolerances: ≤ 3 / ≤ 8;
±0.5 of any diff is Lichess's own integer rounding). Over the wider
263-game development pool (526 player accuracies, fetched the same
way): mean 0.26, max 1.14. The **pre-Prompt-5 aggregation scored
mean 6.63 / max 23.04 on that pool** — a systematic ≈7-point
underestimate. Cause, isolated by ablation: the old code used a
volatility-**weighted** harmonic mean (Lichess's is unweighted),
which double-punishes blunders — they cluster in volatile windows,
so they were weighted heavily in the arithmetic mean _and_ again in
the harmonic mean. Window alignment (centred vs trailing/floored)
was a second-order effect; the ±1000 ceiling matters chiefly in
mate-heavy and decided games.

**Rating decision: qualitative (option b).** The old numeric
"Est. rating" (invented anchors 50 % → 400 … 97 % → 2500 ± an ACPL
nudge, no data behind it) is **removed**. A calibrated replacement
was attempted first: 250 real analysed Lichess games (493 player
samples, ratings 949–3362; dataset in
`tests/fixtures/rating-dataset/`, regeneration:
`node scripts/make-rating-dataset.mjs`) were fit with accuracy
binned medians, ACPL binned medians, 2-D bins and OLS on
(accuracy, ACPL, accuracy²). The best fit still leaves a **residual
SD of ≈430 Elo and an 80% band of ≈ ±490 Elo** (correlations:
accuracy r ≈ 0.20, ACPL r ≈ −0.28; a larger regeneration of the same
script — 565 games, 1116 samples — is worse still: SD ≈ 500, band
≈ ±700) — a single game's accuracy is
dominated by the opponent, the opening and the position types, so
no honest point estimate exists (the pre-set bar was ≈ ±300). The
summary therefore shows a **"Performance estimate"**: a qualitative
band (Beginner-level / Club-level / Strong club / Expert-level /
Master-level play) chosen by accuracy and demoted while ACPL exceeds
the band's ceiling, with a note that it is a rough single-game band,
not a rating (`src/analysis/rating.ts`). Player bars still show the
real Elo from PGN headers (`WhiteElo`/`BlackElo`) where present —
those are facts from the game record, not estimates.

### Move classification (spec §7, `src/analysis/classify.ts`)

Decision order: **Forced** (one legal move) → **Book** (position in the
lichess opening dataset, continuous from move 1) → **Brilliant** → **Great** →
EPL bands (**Best** ≤ 0.005 or the engine's top move, **Excellent** ≤ 0.02,
**Good** ≤ 0.05, **Inaccuracy** ≤ 0.10, **Mistake** ≤ 0.20, **Blunder** above)
→ **Miss** post-pass (opponent just erred, you were ≥ 65 % to win, and the
reply throws it back to ≈ equal).

- **Brilliant:** top-3 engine move with EPL ≤ 0.02, a _genuine_ sacrifice —
  the moved piece (≥ 3 pts, or a rook-for-minor exchange sac) is captured
  within 4 plies of the PV leaving the mover ≥ 2 pts down in that window, or
  SEE on the destination is negative with the piece really en prise — not a
  promotion/recapture/mate-in-1, the mover wasn't already ≥ 90 % winning,
  isn't left losing, soft-capped at 1 per 10 moves. SEE is a full swap
  evaluation on a board array with x-ray attackers (`src/analysis/sacrifice.ts`).
- **Great:** the engine's best move and an only-move (2nd line ≥ 0.15 EPL
  worse in the balanced profile — tuned from 0.10 by the Prompt 4
  calibration, see `tests/fixtures/games/CALIBRATION.md`), a turning
  point (band crossing in win%), or a critical defense/mate-finding
  move — never when the position is already decided (≥ 95 % / ≤ 5 %)
  or a trivial recapture.
- **Book/openings (spec §9):** the CC0 lichess `chess-openings` TSVs (a–e,
  ~3,900 lines) are served from `/openings/` and indexed by EPD at first use;
  the deepest matching entry names the opening live as you navigate
  ("Left book at move N").

#### Why these labels will not match chess.com exactly (Prompt 4)

They are not supposed to. Chess.com's classification is a proprietary,
undocumented system (it uses its own engine settings, its own
win-probability model, CAPS-style accuracy shaping, and thresholds that
have changed over time and differ by context). This app implements a
_documented approximation in the same spirit_: the decision order and
bands above, a win-probability logistic fitted to the same shape, and
sacrifice/great detection based on a local SEE + PV material analysis
rather than cloud analysis. Expect individual moves to differ — a move
that is "Great" here may be merely "Best" there, especially near band
boundaries, where a few centipawns of engine depth flip the label. What
this app guarantees instead: every label is reproducible from the code
in `src/analysis/`, every label carries a machine-readable _reason_
(hover a badge for "Why this label?", or read it in the coach feedback),
and the aggregate rates are calibrated against real games (below).

#### Classification profiles

All thresholds live in ONE typed object, `CLASSIFICATION_PROFILES` in
`src/lib/constants.ts`. Settings → _Classification_ switches profiles
(persisted); the analyzer classifies with the selected one.

| Threshold                                  | Strict         | Balanced (default) | Generous       |
| ------------------------------------------ | -------------- | ------------------ | -------------- |
| Best EPL ≤                                 | 0.002          | 0.005              | 0.010          |
| Excellent EPL ≤                            | 0.010          | 0.020              | 0.035          |
| Good EPL ≤                                 | 0.030          | 0.050              | 0.080          |
| Inaccuracy EPL ≤                           | 0.070          | 0.100              | 0.150          |
| Mistake EPL ≤ (above = Blunder)            | 0.150          | 0.200              | 0.280          |
| Brilliant: max EPL                         | 0.010          | 0.020              | 0.035          |
| Brilliant: must be in top N lines          | 2              | 3                  | 3              |
| Brilliant: not if already winning ≥        | 85%            | 90%                | 92%            |
| Brilliant: must keep win% ≥                | 50%            | 45%                | 40%            |
| Brilliant: soft cap per 10 moves           | 1              | 1                  | 2              |
| Great: only-move gap EPL ≥                 | 0.18           | 0.15               | 0.06           |
| Great: decided-position band               | 92% / 8%       | 95% / 5%           | 97% / 3%       |
| Miss: win% before ≥ / EPL > / win% after ≤ | 70 / 0.12 / 55 | 65 / 0.10 / 60     | 60 / 0.08 / 62 |

Calibration of the balanced defaults against 12 real games (Stockfish
depth-18 snapshots) is committed at
`tests/fixtures/games/CALIBRATION.md` (regenerate with
`node scripts/make-fixtures.mjs` then `node scripts/calibrate.mjs --write`);
the fixture list and sources are in `tests/fixtures/games/SOURCES.md`.

#### Recaptures and SEE — exact vs approximate

- **Exact recaptures.** The analyzer knows the previous move, so it
  passes `lastMove` to the classifier for every main-line ply. A move
  that captures the piece that just moved, _on the square it landed on_,
  is then known to be a recapture exactly: recaptures are never
  sacrifices and a pure recapture (equal-or-better material, no check,
  non-losing exchange) is never labelled Great/Brilliant. (The forced
  rule still precedes everything: a recapture that is the only legal
  move classifies as Forced.) Where there
  is no game history (live analysis / board-editor positions), the
  classifier falls back to the older FEN-only approximation — any
  capture of material worth at least the moved piece, giving no check,
  counts as "trivial" — which can misfire in both directions (it also
  blocks fresh equal captures, and misses recaptures that win the
  exchange). The two paths are commented as such in
  `src/analysis/classify.ts`.
- **SEE (`src/analysis/sacrifice.ts`)** is a swap evaluation on a board
  array with: x-ray attackers and discovered attacks (attacker lists are
  recomputed after every capture), absolute pins to the king (a pinned
  piece may only recapture along the pin ray; the first capture is
  validated with chess.js legal move generation), the king-capture rule
  (a king captures only into an undefended square), promotions (the
  promoted queen is priced, with the promotion bonus credited) and en
  passant (the victim pawn is removed from its own square). Sacrifice
  detection evaluates the material balance along the engine PV for
  4 plies — not just on the destination square. Sacrifices are:
  piece-for-pawn(s), an unrecovered exchange sacrifice, a queen
  sacrifice, or a sacrifice leading to forced mate inside the window.
  Not sacrifices: equal trades, recaptures, pawn gambits (unless a piece
  is also offered), and promotions.

### Importers

- **PGN:** chess.js-based; tolerates comments, `[%clk]`/`[%eval]`, NAGs,
  nested variations (main line imported), missing results, custom `SetUp/FEN`
  starts; multi-game files get a picker; clocks are extracted per move.
- **FEN:** validated, plus a full board editor (palette, castling rights,
  side to move). Single-position mode shows eval + live engine lines.
- **Chess.com:** `GET /api/chesscom?user=` reads the public archive API
  (latest 2 months, normalized). **Game links work by default using only
  the official public API** (Round 2, Prompt 2 — see "Chess.com game
  links" below): the link tab asks inline for one player's username and
  searches that player's monthly archives for the game.
  `GET /api/chesscom?id=&type=live|daily` uses
  the public callback endpoint and **decodes the compressed `moveList`**.
  The encoding was reverse-engineered and _verified against live games_: a
  move is 2 chars; char value = square index (`a1=0`, rank-major) in
  `a–z A–Z 0–9 ! ?`; promotions use dedicated chars (`~` queen push,
  `{`/`}` queen captures, `^` knight push, `[`/`]` knight captures) and any
  other promotion char is resolved by a legality-checked backtracking
  search, so decoding can never silently corrupt a game. Since Prompt 11
  the callback path is behind `CHESSCOM_CALLBACK_ENABLED` (default off);
  caching and errors follow "API & security" below.
- **Lichess:** `GET /api/lichess?id=` proxies
  `lichess.org/game/export/{id}` (clocks + opening on). If the proxy
  fails with a retryable error, the client retries directly against
  lichess.org (CORS-enabled) through the same parsing path.
- **Image import:** real on-device screenshot recognition (template
  matching, no ML, no uploads) with a mandatory review step — measured
  accuracy and limits in the next section.

### Image import: screenshot → FEN (Prompt 8)

Upload a board screenshot in the **Image** tab and the position is
recognized **entirely on your device** — the image is decoded locally,
processed in a same-origin Web Worker (`src/vision/`), and never uploaded
or sent anywhere. "Images never leave your device" is structural: the
vision code has no network path at all.

**Method (deterministic template matching — no ML):**

1. **Detection** (`src/vision/detectBoard.ts`): grayscale → summed
   horizontal/vertical edge profiles → candidate square sizes from the
   strongest autocorrelation periods of both profiles (up to three, so
   competing periodicities like a photo frame's text lose to the board's
   own grid) and the grid phase from aligning them. Candidate rectangles
   are scored by sampling each square's background from its corner
   patches (summed-area table) and measuring light/dark parity contrast,
   then refined by coordinate descent and snapped onto the grid lines
   (max edge mass on the 9 grid lines). Weak evidence returns _no board_ —
   never a guessed rectangle.
2. **Recognition** (`src/vision/recognize.ts`): templates are built from
   the app's **own five piece-set SVGs**, rasterized and composited over
   the board's _measured_ light/dark background grays (estimated per
   square from its corner ring, so last-move highlight tints and any
   square-color theme work), at three glyph scales. Each square is scored
   by grayscale NCC + gradient (outline) NCC + an absolute-intensity term
   (which is what separates identical shapes of different colors, e.g.
   wood-tone sets). Empty squares are decided on deviation evidence; a
   legal-move dot (compact, low-range) is classified empty; a capture ring
   sits where match weights are lowest and does not flip the piece.
3. **Retry ladder** (`src/vision/pipeline.ts`, Round 2): a confident
   first pass is returned as-is; a low-confidence one tries, in order, a
   **perspective quad** (the rectangle refined into a quadrilateral,
   sampled through its homography — `src/vision/geometry.ts`), a
   **deskew** (tilt estimated from edge-profile energy, the image rotated
   level, detection and recognition re-run), and **local contrast
   normalization** (CLAHE-like). A retry is adopted only when it beats
   the incumbent's mean confidence by a clear margin, so retries can
   never make a good result worse.
4. **Review step (mandatory):** the detected position opens in the board
   editor beside the screenshot, with low-confidence squares ringed
   (orange < 60%, yellow < 80%), the overall _Recognition confidence_
   (mean of the 64 square confidences — a match-quality score, not a
   measured probability), a warning banner under 90%, a one-click
   **Swap orientation** (screenshots are assumed White-at-bottom; there is
   no fake OCR orientation detection), side-to-move and castling controls
   (castling is inferred from king/rook home squares and editable), and
   position-validity messages (one king per side, no pawns on ranks 1/8,
   sane counts, kings not adjacent, the side not to move must not be in
   check). **Analyze this position** is the only path into analysis. If
   detection fails, the tab says so plainly and opens an empty editor with
   the screenshot beside it.

**Measured accuracy** (Round 2, 2026-11-01; `tests/unit/vision-fixtures.test.ts`
and `npm run vision:eval -- tests/fixtures/vision` — 131 fixtures, sources
and licences in `tests/fixtures/vision/SOURCES.md`). Square accuracy =
correctly classified squares / 64 per board, pipeline run with all five
piece sets as templates, exactly as in the browser:

| Fixture set                                                                                                                                                  | Images | Detected |         Square accuracy | Perfect boards |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----: | -------: | ----------------------: | -------------: |
| Clean renders (8 FENs × 5 sets × 2 themes, coordinate labels on half)                                                                                        |     80 |       80 | **100.00%** (5120/5120) |             80 |
| Realistic phone screenshots (rendered, app chrome, highlights, JPEG q80)                                                                                     |     16 |       16 | **100.00%** (1024/1024) |             16 |
| **Real screenshots — lichess.org analysis board** (cburnett pieces, brown theme: element, flipped, mobile and full-page captures, DOM-verified ground truth) |     26 |       26 | **100.00%** (1664/1664) |             26 |
| Rotated ±1.5–2° and heavy JPEG q50/q35                                                                                                                       |      6 |        6 |    **97.92%** (376/384) |              5 |
| **Photographs of physical boards** (Wikimedia Commons, CC0 / CC BY-SA)                                                                                       |      3 |        3 |     **28.65%** (55/192) |              0 |

Overall: 98.27% across 131 images, 244 ms/image mean in Node (the
browser worker measures the same code path; confident screenshots take
the fast path at ~150–250 ms, retry-heavy photos up to ~1.2 s at the
client's 1600 px cap). Worst board-rectangle error on the lichess set:
8.1 px. To measure your own screenshots (e.g. a chess.com board — never
commit those, the imagery is proprietary) run
`npm run vision:eval -- <folder>` with `<image>.fen` sidecar files.

**Confidence calibration** (all 131 fixtures): squares reported at
0.95–1.00 confidence were right 99.65% of the time; 0.90–0.95 → 100%;
0.80–0.90 → 100%; 0.70–0.80 → 98.99%; 0.60–0.70 → 99.35%; below 0.60 →
74.83%. Confidence ≥ 0.6 is effectively trustworthy on this corpus; the
sub-0.6 band is exactly what the review step rings for checking.

**Beta decision (Round 2 rule):** the label stays off only if real
screenshots reach ≥95% **and** photographs reach ≥85%. Screenshots
measure 100.00% — but photographs measure 28.65%, so **the Beta label
has been restored** to the Image tab. The photo failures split by cause:
on the two Staunton-style photographs the detected rectangle lands on
frame/shadow regions (the periodicity detector loses to the frame's own
patterns under perspective), while the third photo's exotic figurine
pieces are simply outside the template family. The review step's
square-by-square correction is the supported path for photos.

**Known limits:** photographs of physical boards are experimental (see
above); exotic/figurine piece sets (one photo fixture uses a samurai
figurine set) are outside the template family; photographs of _screens_
(moiré, glare) and 3D-rendered boards will score lower than flat
screenshots. Screenshot imports — the primary use — measure 100% on
every screenshot corpus we have, including a competing site's board.

**ML status (honest):** a per-square CNN was considered again in Round 2.
`scripts/train-piece-classifier.py` defines the full training pipeline
(synthetic + fixture-derived patches, held-out screenshot/photo split,
ONNX export), but it was **not run**: the build environment has no
PyTorch, and no trained model is committed or shipped. Template matching
remains the only recognition path.

### Features (spec §10–11)

Eval bar (win% fill, flips with the board), eval graph with critical-moment
dots and scrubbing, 3 (1–5 selectable) engine lines with clickable PVs and
position preview, suggestion arrows (plus right-click arrows/circles on the
board), move list with classification badges/eval chips and class filtering,
summary table that cycles through a class's moves, coach feedback with
reasons ("wins a piece", "avoids mate in 3"…), **Retry mode** for weak moves,
**variations** (play any move to branch; promote/delete branches; live engine
inside variations), keyboard shortcuts (←/→, Home/End, F flip, Space engine,
B best arrow, J/K critical moments, R retry, M mute, Esc), sounds (move,
capture, check, castle, promote, end), annotated PGN export (`[%eval]`,
`[%clk]`, NAGs), copy FEN/PGN, shareable `/review#pgn=…` links (lz-string),
recent reviews from IndexedDB, settings drawer (theme, board theme, sounds,
coordinates, arrows, animation speed, depth, engine build, MultiPV, threads,
hash, cache clear), light + dark themes, PWA manifest. Layout is responsive: on mobile
the eval bar goes horizontal above the board and the panel stacks.

### Review extras: WDL, clocks, statistics, theory (Prompt 6)

**WDL display.** Stockfish reports win/draw/loss per mille from the
_side-to-move_ perspective (`UCI_ShowWDL`, parsed in `src/engine/uci.ts`).
The UI always shows WDL from **White's perspective**: when Black is to
move, the win and loss shares swap (`src/lib/wdl.ts`). Percentages are
integers rounded by the largest-remainder method so W + D + L sums to
exactly 100. The compact bar (`W 38% · D 52% · L 10%`) appears at the top
of the engine-lines panel (inside Explain) only when the current top line
actually carries WDL; the eval bar's tooltip/aria text includes the same
label under the same condition. No WDL → neither element renders.

**Clocks and time spent.** A PGN `[%clk]` comment records the mover's
_remaining_ clock after that move. Per-move time spent is derived in
`src/lib/clocks.ts` (`computeTimeSpentMs`) as

```
timeSpent = previousClock(same player) − clockAfterThisMove + increment
```

where the "previous clock" for a player's first move is the base time
from the `TimeControl` header (`600+5` → 600 s base, 5 s increment;
multi-stage controls use their last stage). A move whose own clock or
whose same-player predecessor clock is missing gets no spent value —
never a guess — and PGN files without clocks show no time labels at all.
The player-bar clock uses `formatPlayerClock`: `h:mm:ss` at an hour or
more, `m:ss` down to 20 seconds, and `m:ss.t` (tenths) under 20 seconds —
tenths appear earlier than chess.com's under-10-seconds rule so the
precise time is visible while it can still be acted on. The bar shows
the clock _after that player's last move at the current ply_. The move
list shows each move's spent time as a small muted label, and marks
**time trouble** — the mover's remaining clock under 30 s, or under 10%
of the game's base time — with a small clock glyph (inline SVG) and an
accessible "Time trouble" label.

**Statistics panel.** The summary screen has a collapsible _Statistics_
section (pure computation in `src/analysis/statistics.ts`): per player,
ACPL; the longest streak of _best-or-better_ moves — consecutive own
moves classified brilliant, great, best or excellent (any other class,
including book, breaks the run); the biggest single-move eval swing
(the maximum-EPL move, with a button that jumps to that ply); time spent
by phase; and the time-trouble move count. Phases: the **opening** runs
through the last book ply (`opening.leftBookAtPly − 1`), or the first 10
full moves (20 plies) when the review has no book information. The
**endgame** starts with the first move after which both sides have
≤ 13 points of non-pawn material (Q=9, R=5, B=3, N=3), or the queens are
off and both sides have ≤ 10 points; the onset is fixed once reached (a
later promotion does not move the game back). Everything between is the
middlegame. Phase times render only when the game carries clock data.
Below the eval graph, an _EPL-per-move bar chart_ (one bar per ply,
height ∝ expected-points loss, coloured by the mover) jumps to a ply on
click and is fully keyboard accessible.

**Theory suggestions.** When a game leaves the book, the summary's
opening block states "Left book at move N", names the move actually
played, and lists up to three book continuations for that position from
the lichess opening dataset (`bookContinuations` in
`src/analysis/openings.ts`): dataset lines extending the game's book
sequence, grouped by their next move and ranked by how many lines play
it. When the dataset has no continuation, the block says so explicitly
("No book continuations in the dataset for this position.").

**Component tests.** `npm test` runs two Vitest projects: the existing
node unit suite (`tests/unit`) and a jsdom component suite
(`tests/components`, @testing-library/react) covering the WDL bar
(render/hide, perspective flip), the statistics panel and EPL chart
(fixture values, jump buttons), and the move-list time labels (present
with clocks, absent without).

### Piece sets, board themes and design tokens (Prompt 7)

**Piece sets.** Five selectable sets live in `public/pieces/<set>/`, each
with the 12 lichess-named SVGs (`wP`…`bK`, viewBox `0 0 45 45`, every file
< 6 KB). Every piece image in the app is built by the single helper
`pieceSrc` / `PieceImage` (`src/lib/pieces.ts`), driven by the persisted
`pieceSet` setting, so the board, promotion picker, board editor,
captured-piece bars and settings swatches all switch together; the active
set is preloaded on board mount (other sets stay lazy).

| Set                             | Name          | Author / license                    |
| ------------------------------- | ------------- | ----------------------------------- |
| `cburnett` (default, “Classic”) | Classic       | Colin M.L. Burnett — GFDL / BSD     |
| `neo`                           | Neo           | Original for this project — CC0 1.0 |
| `staunton-wood`                 | Staunton Wood | Original for this project — CC0 1.0 |
| `minimal`                       | Minimal       | Original for this project — CC0 1.0 |
| `high-contrast`                 | High Contrast | Original for this project — CC0 1.0 |

The default stays `cburnett` so existing users, screenshots and tests see
no surprise change; the four new sets are original artwork generated by
`scripts/make-piece-sets.mjs` (generic public-domain Staunton silhouettes;
see `LICENSES.md`). The settings drawer picks sets from a visual grid
(white knight + black queen of each set on a two-square swatch) and shows
the selected set's author/license line.

**Board themes.** `src/lib/boardThemes.ts` defines a full token set per
theme: `light`, `dark`, `lastMove`, `selected`, `check`, `legalDot`,
`arrowDefault/Shift/Alt/Ctrl`, `coordOnLight`, `coordOnDark`, plus an
optional CSS-only `texture*` (wood grain via layered repeating gradients —
no image files). Themes: **green, brown, blue, grey** (the historical
spelling; `gray` is accepted as an alias), **purple**, **wood**.
Coordinate colors are chosen for WCAG contrast ≥ 4.5:1 against the square
they sit on (ratios are tabulated in the `boardThemes.ts` header and
asserted by `tests/unit/board-themes.test.ts`). Coordinates can render
`inside` the board, in an `outside` gutter, or `off` — the setting
replaces the old boolean (persisted `showCoordinates: true/false`
migrates to `inside`/`off` in `migrateSettings`). A board-size slider
(320–760 px, persisted as `boardSizePx`) sets the max-width of the review
and input board containers.

**Design tokens.** UI colors/radius/shadows live in
`src/styles/tokens.css` as CSS variables (`--bg-page`, `--bg-panel`,
`--bg-panel-2`, `--bg-hover`, `--border`, `--text`, `--text-muted`,
`--accent` `#81b64c`, `--accent-shadow` `#5d8a35`, `--radius` 8px), mapped
to Tailwind utilities in `tailwind.config.ts` (`bg-panel`, `text-ink`,
`ring-line`, `rounded-base`, …). Primary buttons use the 3D style
`bg-accent` + `shadow-[0_4px_0_var(--accent-shadow)]` with a pressed
`active:translate-y-0.5`; panels are `bg-panel rounded-base shadow-lg`;
badges/pills are `rounded-md` with tabular numerals for scores.

**Visual screenshot tests.** `tests/e2e/visual.spec.ts` (Playwright,
`toHaveScreenshot`, `maxDiffPixelRatio` 0.01, reduced-motion emulation)
covers the input page (desktop + mobile), the review summary, a mid-game
walkthrough, the settings drawer, the light theme, and tablet/mobile
review layouts. Review screenshots are **deterministic**: they seed a
completed review into IndexedDB (`reviews` store, id = PGN hash) plus the
sessionStorage pending hand-off, from the committed fixture
`tests/fixtures/visual-review.json` (built from the bundled Opera Game
PGN by `scripts/make-visual-fixture.mjs`), so no engine run is involved.
Baselines live in `tests/e2e/visual.spec.ts-snapshots/` and are generated
in-environment with `npx playwright test tests/e2e/visual.spec.ts -u`.

### PWA & offline (Prompt 9)

Chess Review is an installable PWA. After **one online visit**, the whole
app — shell, saved reviews, the board editor and Stockfish analysis — works
fully offline, because everything it needs already lives on the device
(engine WASM under `/engine/`, opening TSVs, reviews in IndexedDB, settings
in localStorage).

**Service worker (hand-rolled, no framework).** `public/sw.js` is
_generated_ by `scripts/build-sw.mjs` (runs as part of `npm run build`)
from `src/lib/swCore.mjs` — the same plain-JS module the unit tests import
(the `budgetRules.mjs` pattern), so the shipped logic is the tested logic.
A build framework (Serwist/Workbox) was not adopted: the app needs exactly
four routes and one custom behaviour (below), and a plugin would add a
build dependency to reimplement ~120 lines. Strategies:

| Requests                                                                                      | Strategy                                                                                                                                                                                                                                                                                        | Cache                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| App shell (`/`, `/review`), manifest, icons, all 60 piece SVGs (5 sets), opening TSVs, sounds | Precached on install                                                                                                                                                                                                                                                                            | `chess-review-app-v<SW_VERSION>`           |
| `/_next/static/*` chunks, other static assets                                                 | Chunk names are hashed per build, so the install handler _discovers_ them from the served `/` and `/review` documents (plus `url()` assets such as the fonts inside their CSS) and precaches those; anything still missed (lazily loaded chunks) is runtime cache-first, populated on first use | `chess-review-runtime-v<SW_VERSION>`       |
| `/engine/*`                                                                                   | Runtime cache-first, dedicated cache keyed by the Stockfish version                                                                                                                                                                                                                             | `chess-review-sw-engine-v<ENGINE_VERSION>` |
| `/api/*`                                                                                      | Network only, never cached                                                                                                                                                                                                                                                                      | —                                          |
| Navigations                                                                                   | Network-first, cache fallback (offline reloads work)                                                                                                                                                                                                                                            | app cache                                  |

**The COOP/COEP trap, handled:** responses served by a service worker do
_not_ inherit the server headers from `next.config.js`/`vercel.json`, so
the SW clones every response it serves and injects
`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp` (and CORP) into it. The
offline e2e asserts `self.crossOriginIsolated === true` before SW control,
after SW control, and offline — without the injection the page loses
isolation and the multi-threaded engine silently degrades to single-thread.

**Engine-cache reconciliation:** the SW's dedicated engine cache is now
the persistent copy for same-origin hosting, so the engine loader no
longer _also_ stores the ~95 MB WASM in its own Cache API cache (that was
double storage). The loader keeps its Cache API copy only for a
cross-origin CDN engine base (`NEXT_PUBLIC_ENGINE_BASE_URL`), which the
same-origin SW cannot intercept. The engine cache version is a constant
in `swCore.mjs` that must match `engine-manifest.json` — a unit test
guards the pair.

**Cache inventory (approximate):** precache ≈ 0.53 MB (pieces 49 KB,
openings 395 KB, sounds 49 KB, icons 35 KB, `sw.js` 10 KB, plus the two
HTML documents); runtime cache grows with the hashed JS/CSS chunks of one
build (a few hundred KB); engine cache ≈ 95 MB with the full build or
≈ 1.8 MB with lite (only the build actually used is downloaded); reviews
and the position cache live in IndexedDB (see Settings → Storage for live
numbers).

**Updates:** a new SW waits instead of taking over; the page shows
“A new version is available” with a **Reload** button, which posts
`SKIP_WAITING` and reloads once on `controllerchange`. In development the
SW is never registered (and any old registration is removed) to avoid
stale-chunk pain.

**Install:** Chromium's `beforeinstallprompt` is captured and surfaced as
an **Install app** button in Settings → App; on iOS Safari the same place
shows the Share → “Add to Home Screen” instructions. Dismissal is
remembered in localStorage. Manifest shortcuts: “New review” (`/`) and
“My reviews” (`/#recent`, the Recent reviews section on the home page).
Icons (192/512/maskable, 4–15 KB each) are generated from the cburnett
white knight on the app background by `npm run icons`
(`scripts/make-icons.mjs`, sharp).

**Offline behaviour:** a slim banner appears while offline; the
link-import tab states “You're offline — link import needs internet;
paste a PGN or use the editor instead”. Analysis, saved reviews and the
editor need no network. Settings → **Storage** shows per-area usage
(engine files, saved reviews, position cache, browser total via
`navigator.storage.estimate()`), can request persistent storage (also
requested automatically on the first saved review), and can clear the
downloaded engine files — with a confirmation and the honest note that
the engine will re-download (~95 MB) on the next analysis. The offline
behaviour is proven end-to-end by `tests/e2e/offline.spec.ts` (production
server, seeded saved review, `context.setOffline(true)`).

### API & security (Prompt 11)

The two import routes (`GET /api/chesscom`, `GET /api/lichess`) are
hardened; all server code lives in `src/server/` and is covered by MSW
route tests (`tests/unit/api-*.test.ts`, `import-api.test.ts`).

**Validation & SSRF defense.** Every input is validated with zod
(`src/server/validation.ts`) before anything else runs: chess.com
usernames (2–25 chars, `[A-Za-z0-9_-]`, no leading `-`/`_`), numeric
game ids (1–20 digits), Lichess ids (exactly 8 or 12 alphanumerics),
`type ∈ {live, daily}`, archive `year ∈ [2000, 2100]` / `month ∈ [1, 12]`
(given together), `locale ∈ {en, hi, es, pa}`. Invalid input is a 400
`INVALID_INPUT` and never reaches the network (fuzz-tested: SQL-ish
strings, path traversal, unicode, 10k-char values). Upstream URLs are
**constructed from validated parts only** — monthly archive URLs are
rebuilt from the parsed `{user}/{yyyy}/{mm}` of archive-index entries,
never taken from the client or used raw — and `src/server/upstream.ts`
additionally enforces a host allowlist (`api.chess.com`, `www.chess.com`,
`lichess.org`, https only) on the initial URL **and every redirect hop**
(redirects are followed manually, max 3). No user input can influence
the upstream host.

**Upstream resilience** (`src/server/upstream.ts`). Per attempt: **8 s**
timeout (AbortController). **One retry** with jittered **300–700 ms**
backoff, only on network errors and 5xx (never 4xx, timeouts, oversize
bodies or blocked redirects). Response size caps, enforced via
`content-length` when present **and** streamed byte counting when not:
archive index **5 MB**, monthly archive **10 MB**, callback **5 MB**,
Lichess export **2 MB**. A 200 with a non-JSON body where JSON is
expected is a clean `UPSTREAM_ERROR`, never a parse crash. Worst-case
route latency is therefore bounded: ≈ 2 attempts × 8 s + ≤ 0.7 s backoff
per upstream call (the username path makes at most 3 sequential upstream
calls: index + 2 months).

**Error taxonomy.** Every error from both routes is
`{ error: { code, message, retryable } }`. `message` stays localized via
the existing `?locale=` mechanism; clients branch on `code`, never on
text. The client helpers in `src/lib/importApi.ts` read this shape.

| Code                    | HTTP | Retryable | Meaning                                                                                  |
| ----------------------- | ---: | --------- | ---------------------------------------------------------------------------------------- |
| `INVALID_INPUT`         |  400 | no        | zod validation failed (bad username/id/month/locale/…)                                   |
| `USER_NOT_FOUND`        |  404 | no        | chess.com user does not exist                                                            |
| `GAME_NOT_FOUND`        |  404 | no        | game id does not exist (either upstream)                                                 |
| `GAME_PRIVATE`          |  403 | no        | chess.com game is private                                                                |
| `UPSTREAM_TIMEOUT`      |  504 | yes       | upstream exceeded the 8 s attempt timeout                                                |
| `UPSTREAM_ERROR`        |  502 | yes       | upstream 5xx (after the one retry), network failure, non-JSON, empty or undecodable game |
| `UPSTREAM_RATE_LIMITED` |  429 | yes       | the upstream itself rate-limited us                                                      |
| `RESPONSE_TOO_LARGE`    |  502 | no        | upstream body exceeded the route's size cap                                              |
| `RATE_LIMITED`          |  429 | yes       | our per-IP limiter; see `Retry-After`                                                    |
| `NOT_CONFIGURED`        |  503 | no        | chess.com callback import disabled (`CHESSCOM_CALLBACK_ENABLED` off)                     |
| `INTERNAL`              |  500 | yes       | unexpected route error                                                                   |

**Caching (serverless-safe).** The primary mechanism is HTTP caching:
success responses carry `Cache-Control: public, s-maxage=…, stale-while-revalidate=…`
— username archive lists **300 s / 3600 s** while the current month is
included (it can still gain games) and **3600 s / 86400 s** for
past-month-only results (immutable), a finished chess.com game
**86400 s / 604800 s** (immutable), a Lichess export **3600 s / 86400 s**
(finished games never change). Behind that sits a pluggable server
cache (`src/server/cache.ts`, `get`/`set` with TTL): an **in-memory
adapter** (default) and a **KV adapter** speaking the standard
Upstash/Vercel-KV REST protocol with plain `fetch` (no SDK), constructed
only when `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or the `UPSTASH_*`
aliases) are set. **Caveat:** the in-memory adapter is per-instance —
on serverless each warm instance has its own copy, entries are not
shared and vanish on cold start; the `Cache-Control` headers above are
what actually deduplicates across instances (shared CDN cache), and the
KV adapter removes the caveat where configured.

**Rate limiting** (`src/server/rateLimit.ts`). Per-client-IP token
bucket, burst **10**, refill **0.5 tokens/s** (30 requests/min
sustained), applied to both routes before validation. Excess → 429
`RATE_LIMITED` + `Retry-After` (seconds until a token is available).
Two implementations sit behind one async interface, selected by
environment — the limiter is **shared across instances** when a KV
store is configured (the bucket math runs atomically in a Lua script
on the store), and per-instance in-memory otherwise:

| Configuration                                                                    | Limiter                                            | Behavior on KV failure                                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` set (or the `UPSTASH_REDIS_REST_*` pair) | `KvTokenBucketRateLimiter` (shared)                | **Fail open**: request allowed, warning logged (`[rate-limit] KV store unavailable…`) |
| Neither set                                                                      | `TokenBucketRateLimiter` (in-memory, per instance) | n/a                                                                                   |

Client IP and trusted proxies: the bucket key is the first
`x-forwarded-for` entry, else `x-real-ip`, else a shared `unknown`
bucket (fail-closed). This trusts the platform's edge to set/append
`x-forwarded-for` honestly — on Vercel/Netlify the header is
edge-controlled; if you self-host behind your own proxy, make sure the
proxy **overwrites** (not appends to) inbound `x-forwarded-for`, or
clients can spoof their bucket key. The same KV variables also select
the shared cache adapter above, so one configuration hardens both.

**Client fallbacks.** Lichess: on a _retryable_ proxy failure the client
retries **directly against lichess.org** (CORS-enabled) through the same
PGN parsing path; on 400/404 it does not (tested both ways). Chess.com:
see "Chess.com game links" below — archives search first, the
flag-gated callback second, the paste-PGN panel last.

### Chess.com game links (Round 2, Prompt 2)

Pasting a chess.com game link (`/game/live/<id>`, `/game/daily/<id>`,
`/analysis/game/live/<id>`, `/live/game/<id>`) works in a **default**
deployment, using **only the official public API**
(`https://api.chess.com/pub/…`). The public API is organized by player,
not by game id, so the flow is:

1. The Link tab asks **inline** (not a modal) for the chess.com username
   of one of the two players. The field is pre-filled from the last
   username that imported successfully — it is stored only in the
   browser's `localStorage` (`chess-review:chesscom-username`), never
   sent anywhere except to the archive API as part of the search.
2. The client walks that player's monthly archives **newest first, up
   to 12 months back**, one month at a time, showing progress
   ("Searching 2026-10…") with a **Cancel** button, and stops at the
   first month containing the game's id (live and daily games are
   matched the same way, by the id in their archive URL). A successful
   import remembers the username, so the next link import is one click.
3. **Fallback order:** (a) the archives search above; (b) the legacy
   callback endpoint — **only** when `CHESSCOM_CALLBACK_ENABLED` is set
   on the server (default off; it is an undocumented endpoint, which is
   why it stays opt-in); (c) the "How to get the PGN" help panel
   (on chess.com: **Share → PGN → Copy**) with a one-click switch to the
   PGN tab. Every failure message names the step that failed (archive
   index, a specific month, the callback) and what to do next.

**The 12-month limit is real:** games older than 12 months are not
searched (each month is a separate archive document, and unbounded
walks would hammer the public API). For an older game the honest route
is the PGN: open the game on chess.com, **Share → PGN → Copy**, and
paste it in the PGN tab — the review works exactly the same.

**Server operations** (both reuse the Prompt 11 stack — zod validation,
host allowlist, 8 s timeouts, size caps, one jittered retry, pluggable
cache, per-IP rate limiter, error taxonomy):

- `GET /api/chesscom?op=archiveMonths&user=<name>` → the player's
  archive months, newest first, max 12.
- `GET /api/chesscom?op=searchArchives&user=<name>&id=<id>&type=live|daily`
  → searches up to 12 months server-side, stopping at the first match:
  `200 { found: true, pgn, month }`, or `404 GAME_NOT_FOUND` whose
  message distinguishes "no public archived games" from "not in the
  last 12 months" and names the next step. With `&year=&month=` it
  searches only that month and a miss is a normal `200 { found: false }`
  (this is what the client's progress/cancel walk uses).

**Etiquette & caching.** Every upstream request carries a descriptive
`User-Agent` (`chess-review/1.0 …`). Months are fetched **sequentially**
(concurrency 1, serialized per user) and the search stops at the first
match. An upstream `429` is passed through with its `Retry-After`
header. Monthly archives are cached server-side through the pluggable
cache: **past months are immutable → 7-day TTL**; the **current month
→ 5-minute TTL** (it can still gain games); a found game → 24 h.

**Privacy.** The server never logs usernames or PGNs — the routes
contain no logging at all; failures surface only as taxonomy error
codes. If operational logging is added later it may carry only an error
code and a duration, never a username or PGN text. The remembered
username lives in the browser's `localStorage` only.

Username browsing (paste a bare username or a `/member/<name>` link)
is unchanged, and the recent-games picker now has filters: a player-name
search box plus time-control, result and month filters.

**Security headers + CSP.** `next.config.js` `headers()` is the single
source of truth; `vercel.json`, `netlify.toml` and `public/_headers`
mirror it, and `tests/unit/security-headers.test.ts` fails on drift.
Because service-worker-served responses do not inherit server headers
(the Prompt 9 COOP/COEP trap), the SW now injects the CSP and the other
static security headers the same way (`SW_CONTENT_SECURITY_POLICY` in
`src/lib/swCore.mjs`, asserted byte-identical to the config value).
Playwright proof: `tests/e2e/security.spec.ts` asserts the headers on
the production server, and the review + offline + visual specs pass
under them.

| Header / directive        | Value                                                          | Why                                                       |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `Content-Security-Policy` | see below                                                      | XSS / injection containment                               |
| `X-Content-Type-Options`  | `nosniff`                                                      | no MIME sniffing of engine/piece files                    |
| `Referrer-Policy`         | `strict-origin-when-cross-origin`                              | don't leak review URLs (they can embed PGNs) cross-origin |
| `X-Frame-Options`         | `DENY` (+ CSP `frame-ancestors 'none'`)                        | clickjacking                                              |
| `Permissions-Policy`      | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | the app needs none of these                               |
| COOP/COEP/CORP            | unchanged from Prompt 9                                        | cross-origin isolation for the multi-threaded engine      |

CSP directives, one by one: `default-src 'self'` (baseline);
`script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'`
— `'wasm-unsafe-eval'` is required to compile Stockfish's WASM;
`'unsafe-inline'` is honestly required because Next.js App Router
inlines per-render Flight payload scripts whose bytes differ per page
and cannot be hashed — nonce-ing them would force every page dynamic
and break the SW's precached HTML — and it is scoped to `script-src`
only (the app has no user-HTML injection surface: React escapes all
rendered content and the only `dangerouslySetInnerHTML` is the static
theme bootstrap in `layout.tsx`, which contains no user data). A
sha256 hash of that theme script was tried first and **removed**: per
the CSP spec, browsers _ignore_ `'unsafe-inline'` whenever a hash or
nonce appears in the same source list, so hash + `'unsafe-inline'`
blocked every Flight script and left every page blank — the Playwright
suite caught it, and `tests/unit/security-headers.test.ts` now pins
`script-src` to contain no `sha256-` so the combination cannot creep
back;
`style-src 'self' 'unsafe-inline'` (Tailwind/framer-motion inline
styles); `img-src 'self' data: blob:` (same-origin pieces; `data:`/`blob:`
for image-import previews); `font-src 'self' data:` (self-hosted Inter);
`worker-src 'self' blob:` and `child-src 'self' blob:` (Stockfish worker
file, or the Blob wrapper used for a cross-origin engine CDN);
`connect-src 'self' https://lichess.org https://api.chess.com https:`
— the two named hosts are the client's direct fallbacks, and `https:`
covers the engine CDN mode (`NEXT_PUBLIC_ENGINE_BASE_URL` is inlined at
build time and may be any https CDN; integrity is preserved because the
loader verifies the WASM SHA-256 against the manifest before running
it); `media-src 'self' blob:` (move sounds); `manifest-src 'self'`;
`object-src 'none'`; `base-uri 'self'`; `form-action 'self'`;
`frame-ancestors 'none'`.

**Environment variables** (all optional; see `.env.example`):
`CHESSCOM_CALLBACK_ENABLED` (`1`/`true` enables the chess.com callback
import), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) for the shared KV
cache.

### Project layout

See spec §3 — `src/app` (pages + API routes), `src/components`
(board/eval/review/engine/moves/input/ui), `src/engine` (worker client, UCI,
analyzer, IndexedDB cache), `src/analysis` (win probability, classify,
accuracy, sacrifice/SEE, openings, feedback, rating), `src/parsers`,
`src/store` (Zustand), `src/hooks`, `src/lib`, `tests/unit` (Vitest),
`tests/e2e` (Playwright), `tests/fixtures` (recorded chess.com callback
fixtures used by the decoder tests).

## Game endings, Chess960, PGN recovery and long games (Round 2)

**Termination taxonomy** (`src/analysis/termination.ts`, pure and
table-tested in `tests/unit/termination.test.ts`). Every parsed game and
every finished review carries a `GameTermination { kind, winner, result,
detail }`, resolved in this priority order: (1) the final position itself
(checkmate, stalemate, insufficient material), (2) repetition /
move-counter state (fivefold repetition and the seventy-five-move rule
are automatic; threefold and the fifty-move rule are treated as claimed
when a recorded game stops there), (3) `[Termination]` tags and importer
metadata — chess.com phrasings ("White won by resignation", "Black won
on time", "Drawn by agreement", per-player results like `timevsinsufficient`)
and Lichess status values (`mate`, `resign`, `stalemate`, `outoftime`,
`timeout` = timeout against insufficient material, `draw`, `aborted`) —
and finally (4) the result string alone. Board-derived endings always
win over tags. When the mechanism is not known, `detail` is
`result-only-kind-unknown` and the UI states only the outcome ("Alice
won" / "Draw"), never an invented mechanism. The review shows a
localized banner ("White won by resignation", "Draw by repetition",
"Black won on time", "Game not finished") in the panel header and on the
final position, plus the final result marker (1-0 / 0-1 / ½-½) on the
eval bar and eval graph, in all four locales.

**Analysis rules for endings.** Terminal positions are never searched:
checkmate gets the exact mate score; stalemate, repetition, move-counter
and insufficient-material draws are exactly 0.0 cp and 50% win
probability for both sides. A drawn terminal therefore enters accuracy
through the ordinary path — a player who allows a draw from a winning
position loses the full expected-points difference (EPL) and move
accuracy, with no special exemption (tested in
`tests/unit/analyzer-termination.test.ts`). Resignation, timeout,
abandonment and forfeit are not board states: the final position keeps
its engine evaluation, no extra ply is created, and the ending event
itself receives no classification.

**Repetition-aware engine work.** When a position has occurred before
in the game, the engine is sent `position fen <start> moves …` with the
game's move history instead of a bare FEN, so Stockfish's repetition
state matches the game; the position-cache key additionally carries the
occurrence count, so evaluations from a position's first and third
occurrences can never be mixed.

**Chess960: not supported (honest rejection).** chess.js 1.4 generates
only standard castling (king ±2 squares, KQkq castling rights, rooks
assumed on a/h files), so correct 960 castling (king-takes-rook UCI,
final king/rook squares independent of the start squares) cannot be
done reliably on this codebase. Detected 960 games — via a
`[Variant "Chess960"]` / Fischer Random tag, a Shredder-FEN castling
field, or a non-standard full starting array — are therefore NEVER
analyzed as standard chess: the review page shows a localized
"Chess960 is not supported yet" screen instead. The opening book is
also skipped for any 960 game that reaches the analyzer.

**PGN recovery.** If the movetext contains an illegal move, parsing
keeps the longest valid prefix and records `parseError { ply, san,
message, validMoves, legalMoves }`; the stored PGN is a clean
re-serialization of the prefix, and the review page offers an
"Analyze up to move N" button. A game whose movetext replays cleanly
but whose headers chess.js's strict tag parser rejects (e.g. escaped
quotes in a name) is recovered from the manual replay. The parser also
accepts `0-0`/`0-0-0` castling spellings, UTF-8 BOMs, mixed line
endings, nested variations and comments, NAGs, and `[%clk]` / `[%eval]`
annotations. A failure on the very first move still throws — there is
nothing to recover.

**Very long games (300–600 plies).** The move list is virtualized
above 80 move rows: only a window around the scroll position is mounted
(stable 36 px rows, `aria-rowcount`/`aria-rowindex` expose the full
list), and keyboard navigation plus scroll-to-current keep working.
Analysis is time-boxed per position by the adaptive budget as before,
shows the usual progress/ETA, and long games (>200 plies) get an
"analyze first N moves" option (first 100 / 200 moves) in the review
header, backed by `analyzeGame`'s `maxPlies`. Measured on this 4-core
VM (Vitest, fake instant engine — i.e. pipeline overhead only, real
Stockfish time is additional and budget-capped): a 400-ply
knight-shuffle game parses and analyzes in ≈0.49 s with only 8 engine
calls (every position from ply 8 is a repetition terminal and is never
searched); a 364-ply non-repetitive random game took ≈1.14 s of
pipeline time for 364 engine calls with ≈+8.8 MB heap; rendering the
400-ply move list mounts <60 of its 200 rows in ≈79 ms (jsdom).

## Performance

Benchmark: `npm run bench` (`scripts/bench.mjs`) analyzes the three fixture
PGNs in `tests/fixtures/bench/` (Morphy's Opera Game, 17 moves; a 41-move
and an 86-move Lichess game — see the fixture README for sources) with the
real Stockfish engine (single-thread build, 1 thread, Hash 128 MB,
MultiPV 3) in Node, sequentially, under each adaptive preset, plus a fixed
depth-18 pass for the agreement check. The bench imports the budget rules
from `src/engine/budgetRules.mjs` — the same module the app uses — so the
numbers exercise the production stability/stop logic, not a copy of it.

**Hardware for the baseline below: 4-core AMD EPYC 9D25 VM (7.7 GB RAM),
Node 24 — a small cloud VM, not a laptop.** A modern laptop (faster cores,
and in the browser the multi-threaded build or the parallel single-thread
pool on top) will differ — expect noticeably faster times there; treat
these as a conservative floor, and re-run `npm run bench` on your own
machine for local numbers. In the browser's single/lite mode the pool
additionally parallelizes across up to 3–4 workers, which this sequential
Node bench does not model.

Agreement is the mean absolute centipawn difference between adaptive
Standard and fixed depth-18 on the same positions (mate scores flattened
to ±10000 cp for the diff). The ≤ 20 cp target is reported honestly
against the real number.

### Baseline results (this hardware, single sequential run)

| Fixture                              | Preset         | Total time | Avg depth | Positions/s | Critical re-analyses |
| ------------------------------------ | -------------- | ---------: | --------: | ----------: | -------------------: |
| Opera Game (34 positions)            | Quick          |     11.6 s |      11.7 |        2.93 |                    4 |
|                                      | Standard       |     27.0 s |      13.6 |        1.26 |                    4 |
|                                      | Deep           |     68.5 s |      15.5 |        0.50 |                    2 |
|                                      | Fixed depth 18 |    139.6 s |        18 |        0.24 |                    — |
| Lichess 41-move game (83 positions)  | Quick          |     25.0 s |      11.8 |        3.31 |                    5 |
|                                      | Standard       |     65.1 s |      13.5 |        1.27 |                    7 |
|                                      | Deep           |    176.4 s |      15.7 |        0.47 |                    5 |
|                                      | Fixed depth 18 |    345.8 s |        18 |        0.24 |                    — |
| Lichess 86-move game (172 positions) | Quick          |     51.6 s |      12.1 |        3.34 |                   11 |
|                                      | Standard       |    168.1 s |      14.3 |        1.02 |                   24 |
|                                      | Deep           |    376.9 s |      16.0 |        0.46 |                   19 |
|                                      | Fixed depth 18 |    661.4 s |        18 |        0.26 |                    — |

**Agreement: 132.6 cp mean |Δcp| over 286 positions — the ≤ 20 cp target
is MISSED on these fixtures.** Read the number with its breakdown: 44 of
the 286 positions are mate-scored, and a single position where only one
pass finds a forced mate contributes ~35 cp to the overall mean by
itself; the sharp, blunder-heavy 86-move game alone averages 199.7 cp.
Excluding mate-scored positions, the mean is **55.6 cp over 242
positions** (per fixture with mates included: Opera 46.9 cp, 41-move
27.2 cp). The stability rules trade exactly this much eval fidelity for
speed on tactical positions: adaptive Standard finishes the same games
**3.9–5.3× faster** than the fixed depth-18 pass (168.1 s vs 661.4 s on
the long game), at an average reached depth of ~13.5–14.3 instead of 18.
Because the adaptive side is time-capped, its stopping depths — and
therefore this agreement mean — vary with machine load between runs;
the fixed-depth side is deterministic. On the original prompt's 45 s /
90 s hopes for a full game at Standard: on THIS 4-core VM a 41-move game
takes 65.1 s and an 86-move game 168.1 s sequentially, so those targets
are not met here; with the browser's parallel pool (3–4 workers in
single/lite mode) or the multi-threaded build, plus faster laptop cores,
the same games should land well under them — re-run the bench locally
rather than trusting either extrapolation.

### Real-browser baseline (Round 2, Prompt 3)

`node scripts/bench-browser.mjs` repeats the measurement in a real
Chromium against the app origin, in both engine configurations
(multi-thread, Threads = cores − 1; and the single-thread pool), with
the Round 2 budget rules: stability floors raised to depth 14
(Standard) / 16 (Deep), critical positions re-analyzed at full depth
with up to 2× the time ceiling at Standard, and like-for-like depth
matching (a position cut shallower than its predecessor is extended to
the predecessor's depth, so a move is never judged from mismatched
depths). `node scripts/agreement.mjs` then compares each preset
against a fixed depth-18 pass using the production classifier. Full
tables are in `PERFORMANCE_BASELINE.md`; the headline results on this
4-core VM (Opera + 41-move games, 115 moves, multi-thread):

- Standard reaches mean depth ~13.0–13.7 (the 1.5 s ceiling binds at
  the browser's ~150–380k nodes/sec) and takes 247.2 s for the 41-move
  game — the ~60 s hope is **missed** here; the fixed d18 pass takes
  1,345.9 s over the same game.
- **Classification difference vs fixed d18: Standard 31.3%, Deep 19.1%
  of moves — the ≤ 8% / ≤ 4% targets are missed** and documented as
  unreachable on this hardware in `PERFORMANCE_BASELINE.md` (even Deep
  reaches only mean depth ~15 under its 4 s ceiling). The review
  header therefore shows the **achieved** average depth next to the
  preset name, with a note that Quick/Standard evaluations can differ
  from a deeper analysis, and every move offers a one-click
  fixed-depth-24 re-analysis of its position.

## Deployment

### Vercel

```bash
vercel deploy
```

`vercel.json` already ships the COOP/COEP + cache headers. **Note the engine
size:** with the default profile the shipped engine directory is
190.91 MiB (see the payload table above), but a visitor downloads only
the one build their device selects (~94.5 MiB full, ~1.8 MiB lite). If
your plan rejects very large uploads, pick a smaller `ENGINE_BUNDLE`
profile (`multi+lite` fits a 100 MB cap; `lite-only` is 1.79 MiB) or host
the engine on a CDN instead (next section).

### Hosting the engine on a CDN

With `ENGINE_BUNDLE=external` the app ships no engine files; they are
served from a base URL instead. Set the base before building (it is
inlined at build time; `ENGINE_BASE_URL` is accepted as an alias — see
`.env.example`):

```bash
ENGINE_BUNDLE=external NEXT_PUBLIC_ENGINE_BASE_URL=https://cdn.example.com/engine npm run build
```

Upload the payload (the three builds + `engine-manifest.json`) with the
bundled uploader — a dependency-free S3-compatible PUT script:

```bash
ENGINE_CDN_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
ENGINE_CDN_BUCKET=my-bucket ENGINE_CDN_PREFIX=engine \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=auto \
ENGINE_CDN_PUBLIC_BASE_URL=https://cdn.example.com/engine \
npm run engine:upload
```

It sets the content types and the immutable cache header on every object,
and on success writes the resulting manifest URL to `engine-cdn-url.txt`.
With no storage configured it prints the exact file list and headers to
apply by hand instead of guessing credentials. Requirements on the CDN
responses:

- `Access-Control-Allow-Origin: *` (or your app origin) — the client
  `fetch`es the manifest and the WASM for progress + integrity checks, and
  the engine worker fetches its WASM too.
- `Cross-Origin-Resource-Policy: cross-origin` — required for the files to
  be loadable from your cross-origin-isolated app page.
- `Cache-Control: public, max-age=31536000, immutable` — strongly
  recommended; the file names only change with the Stockfish version.
- Content types: `.wasm` → `application/wasm`, `.js` → `text/javascript`,
  `.json` → `application/json`.
- **Compression:** serve the small `.js` files with Brotli/gzip if your
  host offers it. The `.wasm` files gain little (brotli ratio ≈ 0.78) and
  must be served without a `Content-Encoding` the client did not ask for;
  the uploader stores them uncompressed, which is the safe default.

**CSP — the step that bites (found by the e2e test below):** the engine
worker inherits your app page's Content-Security-Policy, and its
`importScripts(<cdn engine js>)` is a _script_ load. If your CSP's
`script-src` / `worker-src` do not include the CDN origin, the browser
blocks the engine before any network request — while the manifest and
WASM fetches (governed by `connect-src`) succeed, which makes the failure
look like a CORS problem. It is not. When the app is served by the
Next.js server, `next.config.js` adds the configured engine origin to
`script-src` / `worker-src` / `child-src` automatically at build time.
On static hosts (the `vercel.json` / `netlify.toml` / `public/_headers`
files in this repo) add the origin to those three directives yourself.
One residual: if the app shell itself is served from the service-worker
cache while offline, the SW injects its static CSP (which cannot know
the build-time origin), so a CDN-mode engine start from a cold offline
shell can still be CSP-blocked; online loads are unaffected.

**Ready-to-use host configs.**

Cloudflare R2 (S3-compatible) — bucket CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

CORP and cache headers are object metadata on R2 — the uploader sets
`Cache-Control`; add `Cross-Origin-Resource-Policy: cross-origin` via a
Cloudflare Transform Rule (Modify Response Header) matching the engine
path, or a small Worker in front of the bucket. Serve the bucket through
a custom domain so the base URL is stable HTTPS.

A second static host (Netlify-style `_headers`; the same block works in
this repo's `netlify.toml` shape):

```text
/engine/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable
```

**Vercel** (a second project or Blob): set the same headers in that
project's `vercel.json`.

How loading works cross-origin: a `Worker` cannot be constructed directly
from another origin, so for a cross-origin base the client creates a
same-origin **Blob wrapper worker** whose only job is
`importScripts(<cdn engine js>)`; the packaged builds resolve their WASM
from the worker's `location.hash`, which the client sets to the encoded
CDN WASM URL. **Verified in Chromium by a committed test:**
`npm run test:e2e:cdn` serves `public/engine` from a different origin
with the headers above and proves the app stays cross-origin isolated,
fetches manifest/JS/WASM only from the CDN origin, starts the
**multi-threaded** build, and completes a real analysis
(`tests/e2e/cdn.spec.ts`). **Not verified in Firefox/Safari** — if the
wrapper or the multi-threaded build fails there, startup automatically
falls back to the single and then lite builds from the same CDN, and only
errors if all fail. For maximum certainty on multi-threading, same-origin
hosting remains the recommended setup.

### Netlify / static hosts

`netlify.toml` and `public/_headers` carry the same headers. The app needs a
Node runtime for the two API route handlers (import proxying); the review
itself is fully client-side.

### Environment notes

- Node **≥ 20.11** (see `engines` in `package.json`; `.nvmrc` selects the
  Node 20 LTS line — also verified on Node 24). No environment variables
  are required; the optional app variables are
  `NEXT_PUBLIC_ENGINE_BASE_URL` (see `.env.example` and "Hosting the engine
  on a CDN" above), `CHESSCOM_CALLBACK_ENABLED` and the KV cache pair
  (see "API & security" below), and no `.env` file is needed to build or
  start.
- Multi-threading needs a **secure context** (https or localhost) **and** the
  COOP/COEP headers above; without them the app still works in single-thread
  mode.
- The chess.com callback endpoint is unofficial and may change; the importer
  fails loudly (never silently) if decoding stops validating.

## Manual QA checklist

- [ ] Paste a PGN → review completes; accuracy for both sides; every move classified.
- [ ] "Load sample game" (Opera Game) → sacrifices classified Brilliant/Great on a strong depth; final `Rd8#` shows mate in the eval bar.
- [ ] Paste a FEN → position mode: eval bar + engine lines update; playing moves gets live analysis.
- [ ] Chess.com game link → PGN returned (check a game with a promotion); username → game picker list.
- [ ] Lichess link → review loads; bad id → friendly 404 message.
- [ ] Eval bar flips with the board; label shows `M{n}` for mates.
- [ ] Eval graph: click/drag scrubs; blunder dots are red, brilliant teal.
- [ ] Move feedback: "Show best move" draws the green arrow; Retry on a blunder accepts the engine move ("That's the best move!").
- [ ] Play a non-game move → variation appears; engine analyzes it live; promote/delete work.
- [ ] Keyboard: ←/→ navigate, F flips, Space toggles engine, J/K jump between critical moments.
- [ ] Export: annotated PGN contains `[%eval]` and NAGs; share link reopens the same game.
- [ ] Mobile width (360 px): board full width, horizontal eval bar, sticky-feeling controls, swipe navigates.
- [ ] Settings: switch board theme/theme; clear cache; reload — a previously reviewed game reopens instantly from IndexedDB.
- [ ] DevTools console: no errors; footer shows the Stockfish version and thread mode.

## Internationalization (Prompt 10)

The UI ships in four locales — **English (`en`)**, **हिन्दी (`hi`)**,
**Español (`es`)**, **ਪੰਜਾਬੀ (`pa`)** — switchable in Settings → Language
(the picker shows native names: English, हिन्दी, Español, ਪੰਜਾਬੀ). The
choice is persisted in the settings store; on first run it defaults from
`navigator.language` (`hi*`/`pa*`/`es*` map to that locale, everything
else to English). Changing locale updates `<html lang>` immediately.

> **Translations are machine-assisted and pending native-speaker review.**
> No locale other than the English source has been human-reviewed yet —
> the settings drawer's language list marks हिन्दी, Español and ਪੰਜਾਬੀ
> as machine-assisted, and this is the status until a native speaker
> returns a reviewed CSV through the workflow below.

### Review workflow, glossary, fonts (Round 2, Prompt 10)

- **Glossary** — `src/i18n/GLOSSARY.md` records the canonical rendering
  of the recurring chess/UI terms (classification labels, piece names,
  Accuracy, Game Review, …) plus policies: Stockfish and Beta are never
  translated, opening names stay English, Hindi/Punjabi use the
  respectful आप/ਤੁਸੀਂ forms and traditional Indian piece names.
  `npm run glossary:check` (in CI) fails if a catalogue drifts from the
  table.
- **Native-speaker review round-trip** — `npm run i18n:export-review`
  writes `i18n/review/<locale>.csv` (key, English, current translation,
  context note, length budget, reviewer, status). A reviewer edits the
  translation column, sets status to `reviewed`, and
  `npm run i18n:import-review -- <locale>` validates (placeholders must
  match English exactly, no empty strings, length budgets) and merges
  only the reviewed rows, verifying the compiled catalogue afterwards.
- **Fonts** — Inter covers Latin scripts only, so Hindi/Punjabi text is
  rendered by self-hosted **Noto Sans Devanagari / Gurmukhi** variable
  fonts (`public/fonts/`, SIL OFL 1.1, see LICENSES.md), declared with
  `unicode-range` so they download only when those scripts are used.
- **Metadata** — `<title>`, the meta description and the PWA manifest
  are localized at runtime by `LocaleSync` once the dictionary loads
  (per-locale manifests live beside the English one as
  `manifest.<locale>.webmanifest`). The statically generated HTML head
  itself is English — see the limits below.

### Architecture

- `src/i18n/en.ts` is the source of truth: `export type Messages =
typeof en`. `hi.ts`, `es.ts`, `pa.ts` are each annotated `: Messages`,
  so a missing or extra key is a **compile error**. Keys are grouped by
  feature namespace (`common`, `input`, `editor`, `vision`, `review`,
  `summary`, `moves`, `engine`, `settings`, `feedback`,
  `classifications`, `errors`, `pwa`, …).
- `t(locale, key, params?)` (`src/i18n/index.ts`) interpolates
  `{placeholders}` and selects plural forms — message entries shaped
  `{ one, other }` — through `Intl.PluralRules`, driven by a numeric
  `count` param. Plural entries are used only where a string genuinely
  varies by count.
- Components read the locale from the settings store through the
  `useMessages()` hook (`src/i18n/useMessages.ts`), which returns the
  active dictionary, a locale-bound `t`, and `Intl` formatters: numbers
  (accuracy, percentages, counts) via `Intl.NumberFormat`, dates via
  `Intl.DateTimeFormat`. (Dates that arrive as PGN header strings are
  game data and are shown verbatim, like player names.)
- The coach feedback generator (`src/analysis/feedback.ts`) is built
  from **whole-sentence templates per locale** with placeholders for
  move/SAN/eval values — no fragment concatenation that assumes English
  word order. Every classification's feedback exists in all four
  locales (covered by a parameterized test). Classification display
  names come from the catalogue; the internal enum keys stay English.
- API routes (`/api/chesscom`, `/api/lichess`) localize their user-facing
  error messages when the client passes `&locale=…`.

### What intentionally stays English

- **Opening names** are proper nouns from the lichess openings dataset
  and stay English in every locale.
- **SAN / chess notation**, PGN export text, and player names are data,
  not UI copy, and are never translated.
- Piece-set names and board-theme artwork credits are proper names.
- **Server-rendered metadata** — the `metadata` export in
  `src/app/layout.tsx` is the English source; because the app is
  statically generated and the locale is a client-side setting,
  per-user `generateMetadata` is not possible without giving up static
  generation. `LocaleSync` localizes the title, meta description and
  manifest link at runtime once the dictionary loads (and defends the
  title against React's metadata re-assertion), so a running session
  is fully localized — but the raw HTML head a crawler fetches, and
  the Apple web-app title (a separate metadata field with no runtime
  handle), remain English.
- **PWA install before first run** — the manifest the browser fetches
  on the very first document load is still the English
  `public/manifest.webmanifest`; the per-locale manifests
  (`manifest.hi.webmanifest`, `manifest.es.webmanifest`,
  `manifest.pa.webmanifest` — name, short_name, description and
  shortcuts localized) apply from the first locale-aware session
  onward via the swapped link.

### Engine failure messages

Engine load failures are **structured errors, not pre-localized
strings** (`src/engine/engineErrors.ts`). The loader and the
Stockfish client run without knowing the user's chosen locale, so
they throw errors carrying a stable `code` plus the raw diagnostic
fields — `EngineLoadError` (attempted `builds` + per-build
`failures`) when every build fails, and `EngineIntegrityError`
(`file` / `expected` / `actual` SHA-256) on a manifest hash mismatch.
The English `message` on each error is only a fallback for
non-localizing consumers. The UI composes the user-visible sentence
in the **active locale at render time** via
`formatEngineError(locale, error)` (called by `useEngine()` and by
the review page's analysis error path), filling the catalogue keys
`errors.engineLoadAllFailed` / `errors.engineIntegrityFailed` /
`errors.engineFailedToLoad` — build display names inside the message
come from the catalogue too (`pwa.buildFull` / `buildSingle` /
`buildLite`). Raw per-build diagnostics (file names, HTTP/UCI
messages) are preserved verbatim inside the `{detail}` placeholder
in every locale, so developers keep the full picture.

### Adding a locale

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts`, translate every value,
   and annotate the export `: Messages` (tsc will list anything missing
   or extra).
2. Add the code to `Locale`, `LOCALES`, `LOCALE_NATIVE_NAMES`,
   `DICTIONARIES` and `detectLocale` in `src/i18n/index.ts`.
3. Run `npm run i18n:check` and `npm test` — the parity tests cover the
   new locale automatically.

### Tooling

- `npm run i18n:check` loads all four dictionaries and fails on key-set
  mismatch, per-key placeholder-set mismatch, or empty strings. It also
  runs in CI (the `check` job) and its checks are duplicated as Vitest
  tests so `npm test` covers them too.
- **Visual baselines:** seven of the eight committed English snapshots
  pass unchanged. The eighth — `settings-drawer.png` — was regenerated
  for this prompt because the drawer itself changed as specified: the
  old "Language: English (i18n-ready…)" placeholder paragraph is
  replaced by the real language picker row. All English text in the
  drawer is otherwise identical.
- **Pseudo-localization:** open the app with `?pseudo=1` (the flag is
  persisted to `sessionStorage` for the session). Every string served
  through `t()` is replaced by an accented, lengthened transform of the
  **English** string wrapped in `⟦~ … ~⟧` — hardcoded untranslated text
  stays readable English (easy to spot) and long-string layout overflow
  shows up early. Layout safety at mobile width is checked by
  `tests/e2e/i18n.spec.ts`: the settings drawer and review summary in
  Hindi/Punjabi, **and** pseudo mode held to the same
  no-horizontal-overflow assertion at 390×844 on all three surfaces
  (input page, settings drawer open, review summary), with
  screenshots written to `test-results/`. The pseudo runs exposed
  genuine small-screen fragility (input-page header controls and
  wide selects running off-canvas), fixed with minimal wrapping
  fixes — a flex-wrap header with `min-w-0` children on the input
  page, shrinkable `max-w-full` selects there and in the settings
  drawer, and `min-w-0` row controls in the drawer — with no text
  or design changes. The review page header was deliberately left
  untouched: its labels already wrap inside their controls under
  pressure (the same squeeze the English mobile baseline shows),
  and the pseudo summary test passes against it unchanged — an
  attempted flex-wrap/truncate variant shifted the English mobile
  baseline and was reverted.

## Themes & presets

The app has a full theming system — boards, piece sets, page
backgrounds, sound themes, animation styles and presets — configured
on the **`/settings`** page (the quick drawer links to it). Everything
is data-driven from the registry in `src/themes/`:

- `src/themes/boards.ts` — `BoardThemeDef` (square/texture tokens,
  coordinate colors, highlights, arrows, border, category, provenance).
- `src/themes/pieces.ts` — `PieceSetDef` (12 SVGs in
  `public/pieces/<id>/`, one viewBox, size budget, provenance).
- `src/themes/backgrounds.ts` — `BackgroundDef` (pure CSS + a fixed
  readability scrim, contrast-verified).
- `src/themes/sounds.ts`, `src/themes/animations.ts` — sound themes
  and animation styles.
- `src/themes/presets.ts` / `userPresets.ts` — curated presets, the
  preset engine ("Surprise me", randomize-after-game) and user
  presets with Zod-validated JSON import/export.

Selections are previewed live on the settings page and only apply
after **Save**; the settings schema (v2) migrates older blobs and
falls back to registry defaults for unknown ids. All artwork is
original to this project (or carries its recorded license) — see
`src/themes/PROVENANCE.md` for the per-asset record.

The full catalogue (Themes & Presets program, Stages A–C): **34
boards, 36 piece sets, 28 backgrounds, 8 sound themes, 4 animation
styles and 22 curated presets**, all searchable/filterable on the
settings page with favorites. Six of the sound themes are synthesized
live with the Web Audio API (`src/themes/soundEngine.ts` — no audio
files), with a master volume in Settings → Sounds. Settings → Board &
Pieces also has a **blindfold mode** that hides all piece images
(squares, coordinates and screen-reader names are unaffected).

### Adding a theme

1. Add a definition to the matching registry file (copy a sibling and
   change the id, label key, category and values) and the id to
   `src/themes/ids.ts`.
2. Add the label string under `themes.*` in `src/i18n/en.ts` and the
   same key in `hi.ts`, `es.ts` and `pa.ts`.
3. Add a row for the id to `src/themes/PROVENANCE.md` (how it was
   made + license).
4. Run `npm run themes:check` — it validates unique ids, labels in
   all four locales, piece files, contrast rules (board coordinates
   ≥ 4.5:1, highlight visibility ΔE, background readability, piece
   fills vs the lightest squares) and provenance coverage. Add unit
   tests for anything behavioral.

**Piece sets** are generated: 31 of the 36 sets come from nine
hand-authored base silhouettes (Staunton, Modern Soft, Figurine,
Gothic, Pixel, Token, Letter/Cases, Animal) combined with style
recipes in `scripts/make-piece-sets.mjs`. To add a set, add a recipe
(or a base) there, rerun `node scripts/make-piece-sets.mjs`, and
register the def with the byte total the script prints. Never edit
the generated SVGs by hand — `themes:check` fails if they drift from
the generator.

## License

GPLv3 (because of Stockfish). See `LICENSE` and `LICENSES.md` for full
attribution: Stockfish/Stockfish.js (GPLv3), lichess chess-openings (CC0),
cburnett pieces (GFDL/BSD), chess.js (BSD-2-Clause).
