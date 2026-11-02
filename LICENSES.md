# Third-party licenses and attribution

This project is licensed under the **GNU General Public License v3.0** (see
`LICENSE`), because it distributes and runs the Stockfish engine.

## Stockfish / Stockfish.js — GPLv3

- The chess engine is **Stockfish** (https://stockfishchess.org), packaged for
  the web as **Stockfish.js** by Nathan Rugg and contributors
  (https://github.com/nmrugg/stockfish.js), npm package `stockfish@19.0.1`.
- Stockfish and Stockfish.js are licensed under the **GNU GPL v3**. The
  corresponding source for the engine builds served from `/engine/` is the
  `stockfish` npm package (stockfish.js repository above, Stockfish 19), whose
  own sources are at https://github.com/official-stockfish/Stockfish.
- A verbatim copy of the GPLv3 ships inside the engine package
  (`node_modules/stockfish/Copying.txt`, copied to `/engine/` is not required —
  the license text is available in the package and in this repository's
  dependency tree).

## Lichess opening dataset — CC0

- Opening names/ECO codes come from **lichess-org/chess-openings**
  (https://github.com/lichess-org/chess-openings), released under **CC0 1.0**
  (public domain). The TSV files are served from `/openings/`.

## Chess piece sets

| Set (folder)      | Display name    | Author                                                           | License                                  |
| ----------------- | --------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `cburnett`        | Classic         | Colin M.L. Burnett                                               | GFDL / BSD (dual-licensed by the author) |
| `neo`             | Neo             | Original artwork for this project                                | CC0 1.0                                  |
| `staunton-wood`   | Staunton Wood   | Original artwork for this project                                | CC0 1.0                                  |
| `minimal`         | Minimal         | Original artwork for this project                                | CC0 1.0                                  |
| `high-contrast`   | High Contrast   | Original artwork for this project                                | CC0 1.0                                  |
| `staunton`        | Staunton        | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `outline`         | Outline         | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `glass`           | Glass           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `marble`          | Marble          | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `metal`           | Metal           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `wood`            | Wood            | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `3d-look`         | 3D Look         | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `newspaper`       | Newspaper       | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `symbols`         | Symbols         | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `large`           | Large           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `colorblind-safe` | Colorblind Safe | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `modern-soft`     | Modern Soft     | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `club`            | Club            | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `icy`             | Icy             | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `neon`            | Neon            | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `bubblegum`       | Bubblegum       | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `space`           | Space           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `figurine`        | Figurine        | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `nature`          | Nature          | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `lolz`            | Lolz            | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `gothic`          | Gothic          | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `medieval`        | Medieval        | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `graffiti`        | Graffiti        | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `8bit`            | 8-Bit           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `arcade`          | Arcade          | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `dash`            | Dash            | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `bases`           | Bases           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `letters`         | Letters         | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `cases`           | Cases           | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `animals`         | Animals         | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |
| `tigers`          | Tigers          | Original artwork for this project (generated, see PROVENANCE.md) | CC0 1.0                                  |

- The piece SVGs in `/pieces/cburnett/` are the **cburnett** set (by Colin
  M.L. Burnett), as distributed with Lichess (lila). Licensed under the
  **GFDL** and the **BSD license** (dual-licensed by the author). A copy of
  this attribution also ships in `/pieces/cburnett/LICENSE.txt`. No
  chess.com proprietary artwork, logos, or trademarks are used anywhere in
  this app.
- The other four sets (`neo`, `staunton-wood`, `minimal`, `high-contrast`)
  are **original artwork created for this project** (Prompt 7), drawn from
  generic public-domain Staunton silhouettes and released under **CC0 1.0**
  (public domain dedication). They are generated by
  `scripts/make-piece-sets.mjs`; a `LICENSE.txt` ships in each set folder.

## Inter — SIL Open Font License 1.1

- The UI typeface is **Inter** (https://rsms.me/inter/), by Rasmus Andersson
  and The Inter Project Authors, licensed under the **SIL Open Font
  License, Version 1.1**.
- The app self-hosts the official Inter **4.001** variable font (weight axis
  100–900) as two subset files — `src/assets/fonts/inter-latin-wght-normal.woff2`
  (latin) and `src/assets/fonts/inter-latin-ext-wght-normal.woff2`
  (latin-ext) — obtained from the Fontsource variable package
  `@fontsource-variable/inter` (which packages the official Inter release).
  They are loaded with `next/font/local`; no font is fetched from Google
  Fonts or any other network source at build or run time.
- A verbatim copy of the SIL OFL 1.1 ships next to the font files at
  `src/assets/fonts/LICENSE`.

## Noto Sans Devanagari / Gurmukhi — SIL Open Font License 1.1

- Script coverage for the Hindi and Punjabi locales (added in Round 2,
  Prompt 10): **Noto Sans Devanagari** and **Noto Sans Gurmukhi** by the
  Noto Project Authors (https://github.com/notofonts), licensed under
  the **SIL Open Font License, Version 1.1**.
- The app self-hosts the variable fonts (weight axis 100–900) as single
  script subsets in `public/fonts/` —
  `noto-sans-devanagari-devanagari-wght-normal.woff2` (121 KB) and
  `noto-sans-gurmukhi-gurmukhi-wght-normal.woff2` (34 KB) — obtained
  from the Fontsource variable packages
  `@fontsource-variable/noto-sans-devanagari@5.3.0` and
  `@fontsource-variable/noto-sans-gurmukhi@5.3.0`. They are declared
  with `unicode-range` in `src/styles/globals.css`, so browsers fetch
  them only when text in those scripts is rendered.
- A verbatim copy of the SIL OFL 1.1 ships next to the font files at
  `public/fonts/NOTO-LICENSE.txt`.

## chess.js — BSD-2-Clause

- Move generation, PGN/FEN handling: **chess.js**
  (https://github.com/jhlywa/chess.js), BSD-2-Clause license.

## Other libraries

- Next.js / React (MIT), Tailwind CSS (MIT), Zustand (MIT), idb (ISC),
  lz-string (MIT), framer-motion (MIT). Their licenses ship in `node_modules`.
