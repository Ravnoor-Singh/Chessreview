# Lichess reference fixtures — sources & provenance (Prompt 5)

18 real games used to validate this app's accuracy computation against
Lichess's own stored accuracy values. Validation runs OFFLINE:

```bash
node scripts/validate-accuracy.mjs
```

It recomputes our accuracy from the committed per-position evaluations
(`games.json`) with the production pipeline
(`src/analysis/accuracy.ts`, via `scripts/validate-entry.ts`) and
compares against the committed reference accuracies. Current result:
**mean |diff| 0.35, max |diff| 1.14** (tolerances: mean ≤ 3, max ≤ 8).
Reference accuracies are integers, so ≈ ±0.5 of any difference is
Lichess's own rounding.

## How the data was obtained (2026-11-01)

For each source user, one request:

```
GET https://lichess.org/api/games/user/{username}?max=50&analysed=true&evals=true&accuracy=true
Accept: application/x-ndjson
```

Users: `thibault`, `Zhigalko_Sergei`, `DrNykterstein`, `opperwezen`,
`lovlas`, `EricRosen` (public accounts; a mix of titled and amateur
players). Notes on the API, learned from the responses:

- The `accuracy=true` parameter is REQUIRED: without it,
  `players.*.analysis` contains only `inaccuracy / mistake / blunder /
  acpl`. With it, `players.*.analysis.accuracy` is present.
- `analysis` is an array of one entry per played ply, in order:
  `analysis[i]` is the evaluation of the position AFTER ply `i + 1`,
  from White's perspective (`{eval: cp}` or `{mate: n}`, n signed from
  White's perspective). Alignment was verified against the embedded
  `judgment` comments (e.g. the entry judging White's 2.f4 "Nf3 was
  best" sits at the index of the position after 2.f4).
- Game-over positions are usually FILTERED from the export: in a game
  ending in checkmate the array typically has `plies − 1` entries.
  Some analyses instead include a final `{mate: 0}` entry (mate 0 =
  the side to move is checkmated).

The exact API game objects for the 18 selected games are preserved
verbatim in `raw.ndjson` (one JSON object per line, as returned).
PGNs in `games.json` were fetched per game from
`GET https://lichess.org/game/export/{id}` (Accept:
application/x-chess-pgn).

Selection: standard variant, both players' reference accuracy
present, ≥ 24 plies, positions align exactly (see conversion below);
chosen for diversity — 6 mate, 6 resign, 4 outoftime (flag), 2 draw
endings; bullet/blitz/rapid; reference accuracies from 65 to 97. The
set deliberately includes the worst-replicating game of the 263-game
development pool (`gk1wIzkf`, diff 1.14). Over that full pool (263
games, 526 player accuracies, fetched the same way) the production
pipeline scores mean |diff| 0.26, max 1.14; the pre-Prompt-5
aggregation scored mean 6.63, max 23.04 on the same pool.

## Conversion: API evals → `games.json` `positions`

`positions[p]` is the eval of the position after ply `p`, in the
app's own encoding (White's perspective; mates as
`evalWhiteCp = ±(100000 − |mate|)` with `mate` kept alongside):

- `positions[0]` (initial position) = `{evalWhiteCp: 15}` — the API
  array starts after ply 1, so the initial eval is not in the export.
  Lichess prepends its analysis with `infosWithInitial`, whose
  fallback initial eval is +15 cp (`evals.legacyInitial` in lila's
  `modules/tree/src/main/eval.scala`); the same documented constant
  is used here. Its effect is bounded: it touches only White's first
  move, by < 0.2 win% points.
- `{eval: c}` → `{evalWhiteCp: c}`.
- `{mate: m}`, m ≠ 0 → `{evalWhiteCp: sign(m) * (100000 − |m|), mate: m}`.
- `{mate: 0}` at position `p` → the side to move at `p` is checkmated:
  `{evalWhiteCp: −100000, mate: 0}` if White is to move (p even),
  `{evalWhiteCp: +100000, mate: 0}` if Black is to move (p odd).
  The entry carries a `note` in `games.json` where this occurs
  (game `oHI2rEh4`).
- Missing final entry (checkmate/stalemate/draw endings, see above):
  the terminal value is restored — mate: `evalWhiteCp ±100000`
  (winner's sign), `mate: 0`; stalemate/draw: `evalWhiteCp 0` — and
  marked with a `note` (game `k8OVq8Y5`). Resignation/timeout endings
  need no restoration: the final position is not game-over, its eval
  is present, and the series simply stops — exactly what our pipeline
  consumes in the app.

## The games

| id | ending | speed | White (rating) vs Black (rating) | ref accuracy W/B |
| --- | --- | --- | --- | --- |
| k8OVq8Y5 | mate | rapid | thibault (1823) vs ismael11008 (1867) | 90 / 83 |
| oHI2rEh4 | mate | bullet | skibidisigmarizz1 (1519) vs lovlas (2917) | 91 / 83 |
| gk1wIzkf | mate | bullet | Umumba (2680) vs Zhigalko_Sergei (3079) | 80 / 65 |
| FZY7fDwo | mate | blitz | hrikesava (784) vs EricRosen (2550) | 72 / 84 |
| VOqkxbKK | mate | bullet | PseudoBenko (3035) vs DrNykterstein (3226) | 76 / 86 |
| MPGHOiRc | mate | blitz | lovlas (2571) vs chromium1 (2454) | 79 / 82 |
| 7O47aGug | draw | blitz | wateenellende (2692) vs opperwezen (2792) | 96 / 97 |
| NcVa2ygN | draw | blitz | EricRosen (2586) vs The_Void_Which_Binds (2516) | 87 / 86 |
| 3K7w609G | outoftime | bullet | Molot_ua (2669) vs opperwezen (3036) | 82 / 87 |
| 3biqLdJF | outoftime | bullet | opperwezen (3040) vs Alex-31 (2678) | 85 / 74 |
| 3oxFVuzb | outoftime | bullet | Zhigalko_Sergei (3135) vs chess-art-us (3347) | 96 / 89 |
| 5gwxLRJm | outoftime | blitz | lovlas (2568) vs Lwazi_2004 (2429) | 81 / 74 |
| 0Z6Tx9uS | resign | bullet | Zhigalko_Sergei (3085) vs tamojerry (3271) | 90 / 85 |
| 1DNNiYFN | resign | blitz | Boomraiser (2418) vs lovlas (2596) | 83 / 89 |
| 1PYoY8GI | resign | bullet | Zhigalko_Sergei (3205) vs MaratGilfanovYoutube (3110) | 91 / 82 |
| 1c8h6VvL | resign | blitz | elregresodelaestaka (2483) vs lovlas (2540) | 76 / 89 |
| 1owiXTWS | resign | bullet | tamojerry (3256) vs Zhigalko_Sergei (3083) | 88 / 79 |
| 29nNSKqR | resign | blitz | Revontuli82 (1756) vs thibault (1742) | 87 / 71 |

Full per-game metadata (players, ratings, dates, PGN, ACPL) is in
`games.json`; the table above abbreviates the player columns for the
games whose raw objects in `raw.ndjson` are the authoritative record.
Game scores and engine evaluations are facts; Lichess game data is
public (lichess.org/terms-of-service — game data is freely reusable).
