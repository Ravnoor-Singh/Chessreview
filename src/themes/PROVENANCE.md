# Theme Asset Provenance

Every board, piece set, background, sound theme, animation style and
preset in this app is recorded here: how it was made and under what
license it ships. The rule for this project: **all artwork is original**
(hand-written SVG, CSS, SVG filters, procedural generation, Web Audio
synthesis) or clearly CC0 / public-domain / GPL-compatible with the
license recorded. Nothing is downloaded from, traced from, screenshot
from, recolored from, or closely imitated from chess.com or any other
proprietary source, and no chess.com / ChessKid / sponsor branding is
used anywhere. Names are generic descriptions (Wood, Marble, Glass,
Neon, 8-Bit…).

`npm run themes:check` fails if any registered asset id is missing a
row in this file.

## Boards

| id          | how it was made                                                                    | license                    |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------- |
| green       | Hand-picked flat colors (project original, pre-registry theme).                    | CC0 1.0 (project original) |
| brown       | Hand-picked flat colors (project original, pre-registry theme).                    | CC0 1.0 (project original) |
| blue        | Hand-picked flat colors (project original, pre-registry theme).                    | CC0 1.0 (project original) |
| grey        | Hand-picked flat colors (project original, pre-registry theme).                    | CC0 1.0 (project original) |
| purple      | Hand-picked flat colors (project original, pre-registry theme).                    | CC0 1.0 (project original) |
| wood        | Flat colors plus an original CSS repeating-linear-gradient grain.                  | CC0 1.0 (project original) |
| dark-green  | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| red         | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| sand        | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| sky         | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| pink        | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| orange      | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| teal        | Hand-picked flat colors (original for this project).                               | CC0 1.0 (project original) |
| contrast    | Pure black/white flat colors (original for this project).                          | CC0 1.0 (project original) |
| dark-wood   | Flat colors plus an original CSS repeating-linear-gradient grain.                  | CC0 1.0 (project original) |
| burled-wood | Flat colors plus an original inline-SVG feTurbulence burl filter (`tx-burl`).      | CC0 1.0 (project original) |
| walnut      | Flat colors plus an original inline-SVG feTurbulence wood filter (`tx-wood`).      | CC0 1.0 (project original) |
| stone       | Flat colors plus an original inline-SVG feTurbulence grain filter (`tx-grain`).    | CC0 1.0 (project original) |
| sandstone   | Flat colors plus an original inline-SVG feTurbulence grain filter (`tx-grain`).    | CC0 1.0 (project original) |
| marble      | Flat colors plus an original inline-SVG feTurbulence vein filter (`tx-marble`).    | CC0 1.0 (project original) |
| marble-dark | Flat colors plus an original inline-SVG feTurbulence vein filter (`tx-marble`).    | CC0 1.0 (project original) |
| metal       | Flat colors plus an original CSS brushed-metal repeating gradient.                 | CC0 1.0 (project original) |
| glass       | Flat colors plus an original CSS diagonal sheen gradient.                          | CC0 1.0 (project original) |
| icy-sea     | Flat colors plus original CSS frost radial gradients.                              | CC0 1.0 (project original) |
| translucent | Original semi-transparent (rgba) square tokens; the page background shows through. | CC0 1.0 (project original) |
| newspaper   | Flat colors plus an original inline-SVG feTurbulence grain filter (`tx-grain`).    | CC0 1.0 (project original) |
| parchment   | Flat colors plus original CSS aged-paper radial gradients.                         | CC0 1.0 (project original) |
| blueprint   | Flat colors plus an original CSS grid-line gradient.                               | CC0 1.0 (project original) |
| neon        | Flat dark colors plus an original CSS neon grid-line gradient.                     | CC0 1.0 (project original) |
| bubblegum   | Flat colors plus an original CSS sparkle radial-gradient pattern.                  | CC0 1.0 (project original) |
| glitter     | Flat colors plus an original CSS sparkle radial-gradient pattern.                  | CC0 1.0 (project original) |
| 8-bit       | Flat colors plus an original CSS conic pixel-dither pattern.                       | CC0 1.0 (project original) |
| checkers    | Flat colors plus an original CSS conic pixel-dither pattern.                       | CC0 1.0 (project original) |
| overlay     | Flat colors plus an original CSS thin-line grid gradient.                          | CC0 1.0 (project original) |

## Piece sets

| id              | how it was made                                                                                                                                             | license                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| cburnett        | The cburnett set by Colin M.L. Burnett, distributed via Lichess; see `public/pieces/cburnett/LICENSE.txt`. The one pre-existing third-party set in the app. | GFDL / BSD (Colin M.L. Burnett) |
| neo             | Hand-authored SVG paths drawn for this project (rounded modern silhouettes).                                                                                | CC0 1.0 (project original)      |
| staunton-wood   | Hand-authored SVG paths drawn for this project (Staunton-style silhouettes, wood-tone gradients).                                                           | CC0 1.0 (project original)      |
| minimal         | Hand-authored SVG paths drawn for this project (flat minimal silhouettes).                                                                                  | CC0 1.0 (project original)      |
| high-contrast   | Hand-authored SVG paths drawn for this project (pure black/white, heavy outlines).                                                                          | CC0 1.0 (project original)      |
| staunton        | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base silhouettes drawn for this project (classic flat recipe).                   | CC0 1.0 (project original)      |
| outline         | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (translucent ghost-fill outline recipe).                                    | CC0 1.0 (project original)      |
| glass           | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (blue glass gradient recipe).                                               | CC0 1.0 (project original)      |
| marble          | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (stone grey gradient recipe).                                               | CC0 1.0 (project original)      |
| metal           | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (brushed steel gradient recipe).                                            | CC0 1.0 (project original)      |
| wood            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (warm wood gradient recipe).                                                | CC0 1.0 (project original)      |
| 3d-look         | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (steep gradient recipe suggesting depth).                                   | CC0 1.0 (project original)      |
| newspaper       | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (SVG-pattern halftone dot recipe).                                          | CC0 1.0 (project original)      |
| symbols         | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (flat silhouettes, detail lines suppressed).                                | CC0 1.0 (project original)      |
| large           | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (silhouettes scaled 1.13x, heavy outlines).                                 | CC0 1.0 (project original)      |
| colorblind-safe | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Staunton base (distinct SVG pattern per piece type: dots/stripes/cross/grid/rings/solid). | CC0 1.0 (project original)      |
| modern-soft     | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base silhouettes (soft slate gradient recipe).                                | CC0 1.0 (project original)      |
| club            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base (cream and deep-green club recipe).                                      | CC0 1.0 (project original)      |
| icy             | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base (pale ice-blue gradient recipe).                                         | CC0 1.0 (project original)      |
| neon            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base (cyan/pink palette with an SVG blur glow filter).                        | CC0 1.0 (project original)      |
| bubblegum       | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base (pink gradient recipe).                                                  | CC0 1.0 (project original)      |
| space           | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Modern Soft base (midnight blue with gold detail recipe).                                 | CC0 1.0 (project original)      |
| figurine        | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Figurine base silhouettes (ivory/ebony recipe).                                           | CC0 1.0 (project original)      |
| nature          | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Figurine base (leaf-green gradient recipe).                                               | CC0 1.0 (project original)      |
| lolz            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Figurine base (mismatched bright detail/accent colors per side).                          | CC0 1.0 (project original)      |
| gothic          | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Gothic base silhouettes (stone grey recipe).                                              | CC0 1.0 (project original)      |
| medieval        | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Gothic base (aged parchment-and-brown gradient recipe).                                   | CC0 1.0 (project original)      |
| graffiti        | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Gothic base (hot-pink/gold detail, bright accents).                                       | CC0 1.0 (project original)      |
| 8bit            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Pixel base shapes (geometry snapped to a 3.75-unit grid; cream/charcoal recipe).          | CC0 1.0 (project original)      |
| arcade          | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Pixel base shapes (arcade yellow/blue recipe).                                            | CC0 1.0 (project original)      |
| dash            | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Token base (flat disc with bold glyph, monochrome recipe).                                | CC0 1.0 (project original)      |
| bases           | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Token base (disc with glyph, steel gradient recipe).                                      | CC0 1.0 (project original)      |
| letters         | Generated by `scripts/make-piece-sets.mjs` from hand-drawn geometric block-letter glyph paths on backing tiles.                                             | CC0 1.0 (project original)      |
| cases           | Generated by `scripts/make-piece-sets.mjs` from hand-drawn letter glyph paths (UPPERCASE for White, lowercase for Black) on backing tiles.                  | CC0 1.0 (project original)      |
| animals         | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Animal base shapes (abstract animal heads: chick, horse, owl, elephant, cat, lion).       | CC0 1.0 (project original)      |
| tigers          | Generated by `scripts/make-piece-sets.mjs` from the hand-authored Animal base shapes (cream; orange with SVG stripe pattern for Black).                     | CC0 1.0 (project original)      |

## Backgrounds

| id              | how it was made                                                                                      | license                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| standard        | The app's built-in page background (no override applied).                                            | CC0 1.0 (project original) |
| charcoal        | Original CSS color written for this project.                                                         | CC0 1.0 (project original) |
| midnight        | Original CSS color written for this project.                                                         | CC0 1.0 (project original) |
| forest          | Original CSS color written for this project.                                                         | CC0 1.0 (project original) |
| classic         | Original CSS linear-gradient written for this project.                                               | CC0 1.0 (project original) |
| paper           | Original CSS color written for this project.                                                         | CC0 1.0 (project original) |
| light           | Original CSS color written for this project.                                                         | CC0 1.0 (project original) |
| wood            | Original CSS wood-grain repeating gradients written for this project.                                | CC0 1.0 (project original) |
| marble          | Original CSS soft-vein radial gradients written for this project.                                    | CC0 1.0 (project original) |
| stone           | Original CSS mottled radial gradients written for this project.                                      | CC0 1.0 (project original) |
| metal           | Original CSS brushed repeating gradient written for this project.                                    | CC0 1.0 (project original) |
| newspaper       | Original CSS column/line repeating gradients on a paper tone, written for this project.              | CC0 1.0 (project original) |
| felt            | Original CSS radial vignette (game-room felt) written for this project.                              | CC0 1.0 (project original) |
| space           | Original CSS star field (tiled radial-gradient dots) written for this project; slow drift animation. | CC0 1.0 (project original) |
| cosmos          | Original CSS nebula radial gradients written for this project; slow pan animation.                   | CC0 1.0 (project original) |
| ocean           | Original CSS wave scallop gradients written for this project.                                        | CC0 1.0 (project original) |
| icy-sea         | Original CSS pale ice gradients written for this project.                                            | CC0 1.0 (project original) |
| nature          | Original CSS leaf-green gradients written for this project.                                          | CC0 1.0 (project original) |
| gothic          | Original CSS arch-outline radial pattern written for this project.                                   | CC0 1.0 (project original) |
| graffiti        | Original CSS spray-blob radial gradients written for this project.                                   | CC0 1.0 (project original) |
| neon-grid       | Original CSS neon grid lines + horizon glow written for this project.                                | CC0 1.0 (project original) |
| 8-bit           | Original CSS conic pixel-dither pattern written for this project.                                    | CC0 1.0 (project original) |
| bubblegum       | Original CSS pastel spray radial gradients written for this project.                                 | CC0 1.0 (project original) |
| confetti        | Original CSS confetti dot pattern (tiled radial gradients) written for this project.                 | CC0 1.0 (project original) |
| glass           | Original CSS blurred color-blob radial gradients written for this project.                           | CC0 1.0 (project original) |
| custom-color    | User-chosen solid color, rendered from the user's own setting.                                       | User's own choice          |
| custom-gradient | User-built two-color gradient, rendered from the user's own settings.                                | User's own choice          |
| custom-image    | User-uploaded image, stored only in IndexedDB on the user's device; never transmitted.               | User's own image           |

## Sound themes

| id       | how it was made                                                                                                                                                                  | license                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| standard | The project's original WAV sound set in `public/sounds/` (generated for this project in the original build).                                                                     | CC0 1.0 (project original) |
| soft     | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (felt-like low sine thocks with filtered noise); all parameters written for this project, no audio files. | CC0 1.0 (project original) |
| marble   | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (hard short clicks: high-passed noise ticks over a triangle thump).                                       | CC0 1.0 (project original) |
| glass    | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (high sine pings with long decays).                                                                       | CC0 1.0 (project original) |
| metal    | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (detuned square/triangle clangs with band-passed noise).                                                  | CC0 1.0 (project original) |
| arcade   | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (8-bit square-wave arpeggios).                                                                            | CC0 1.0 (project original) |
| playful  | Synthesized live with the Web Audio API by `src/themes/soundEngine.ts` (bouncy sine glissandi and pops).                                                                         | CC0 1.0 (project original) |
| silent   | No sound is produced.                                                                                                                                                            | CC0 1.0 (project original) |

## Animation styles

| id     | how it was made                                                     | license                    |
| ------ | ------------------------------------------------------------------- | -------------------------- |
| slide  | Original CSS timing function (`ease-out`).                          | CC0 1.0 (project original) |
| spring | Original CSS timing function (`cubic-bezier(0.34, 1.45, 0.64, 1)`). | CC0 1.0 (project original) |
| arcade | Original CSS timing function (`steps(6, end)`).                     | CC0 1.0 (project original) |
| off    | No animation.                                                       | CC0 1.0 (project original) |

## Presets

| id              | how it was made                                                                                                                 | license                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| classic-green   | Curated combination of original project themes (green board, Classic pieces, Standard background).                              | CC0 1.0 (project original) |
| warm-wood       | Curated combination of original project themes (wood board, Staunton Wood pieces, Classic background).                          | CC0 1.0 (project original) |
| high-contrast   | Curated combination of original project themes (grey board, High Contrast pieces, Charcoal background).                         | CC0 1.0 (project original) |
| dark-tournament | Curated combination of original project themes (Dark Green board, Staunton pieces, Charcoal background, Soft sounds).           | CC0 1.0 (project original) |
| burled-study    | Curated combination of original project themes (Burled Wood board, Wood pieces, Classic background, Soft sounds).               | CC0 1.0 (project original) |
| walnut-library  | Curated combination of original project themes (Walnut board, Figurine pieces, Wood background, Marble sounds).                 | CC0 1.0 (project original) |
| marble-hall     | Curated combination of original project themes (Marble board, Marble pieces, Marble background, Marble sounds).                 | CC0 1.0 (project original) |
| glass-night     | Curated combination of original project themes (Glass board, Glass pieces, Midnight Blue background, Glass sounds).             | CC0 1.0 (project original) |
| icy-sea         | Curated combination of original project themes (Icy Sea board, Icy pieces, Icy Sea background, Glass sounds).                   | CC0 1.0 (project original) |
| neon-arcade     | Curated combination of original project themes (Neon board, Neon pieces, Neon Grid background, Arcade sounds and animation).    | CC0 1.0 (project original) |
| 8bit-arcade     | Curated combination of original project themes (8-Bit board, 8-Bit pieces, 8-Bit background, Arcade sounds and animation).      | CC0 1.0 (project original) |
| bubblegum       | Curated combination of original project themes (Bubblegum board, Bubblegum pieces, Bubblegum background, Playful sounds).       | CC0 1.0 (project original) |
| newspaper-print | Curated combination of original project themes (Newspaper board, Newspaper pieces, Newspaper background, Soft sounds).          | CC0 1.0 (project original) |
| parchment       | Curated combination of original project themes (Parchment board, Medieval pieces, Paper background, Soft sounds).               | CC0 1.0 (project original) |
| space-voyage    | Curated combination of original project themes (Blue board, Space pieces, Space background, Metal sounds).                      | CC0 1.0 (project original) |
| cosmos          | Curated combination of original project themes (Purple board, Modern Soft pieces, Cosmos background, Glass sounds).             | CC0 1.0 (project original) |
| ocean-breeze    | Curated combination of original project themes (Sky board, Icy pieces, Ocean background, Soft sounds).                          | CC0 1.0 (project original) |
| midnight-blue   | Curated combination of original project themes (Blue board, Minimal pieces, Midnight Blue background, Soft sounds).             | CC0 1.0 (project original) |
| gothic-castle   | Curated combination of original project themes (Stone board, Gothic pieces, Gothic background, Marble sounds).                  | CC0 1.0 (project original) |
| colorblind-safe | Curated combination of original project themes (High Contrast board, Colorblind Safe pieces, Light background).                 | CC0 1.0 (project original) |
| minimal-light   | Curated combination of original project themes (Sand board, Minimal pieces, Light background, Silent sounds).                   | CC0 1.0 (project original) |
| focus           | Curated combination of original project themes (Grey board, Symbols pieces, Charcoal background, Silent sounds, animation off). | CC0 1.0 (project original) |
