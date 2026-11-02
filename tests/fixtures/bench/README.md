# Benchmark fixtures

PGNs analyzed by `scripts/bench.mjs`. All are real games; game scores are
facts and are not copyrightable expression — sources are recorded here as
required.

| File | Game | Length | Source |
| --- | --- | --- | --- |
| `sample-opera.pgn` | Paul Morphy vs Duke Karl / Count Isouard, "Opera Game", Paris 1858 (public domain) | 17 moves · 33 plies | Duplicated verbatim from the app's bundled sample, `src/lib/sampleGame.ts` (`SAMPLE_PGN`) |
| `lichess-41move.pgn` | Ben_Dover vs pseudoknight, rated Lichess game `h6veisdc` | 41 moves · 82 plies | Lichess game export, via the PGN collection bundled with chess.js (`node_modules/chess.js/benchmarks/benchmark.pgn`, games played 2012-12-31) — https://lichess.org/h6veisdc |
| `lichess-86move.pgn` | tiggran vs barriosgb2, rated Lichess game `2cj9hphe` | 86 moves · 171 plies | Same collection — https://lichess.org/2cj9hphe |

The two Lichess games are the "~40-move" and "~80-move" fixtures (41 and 86
full moves respectively). They were extracted mechanically from the
collection file (split on `[Event`, selected by their Lichess game id) —
no moves were transcribed by hand.
