# Fixture games — sources (Prompt 4)

12 real games, used as classification fixtures. Every PGN was validated
by loading it with chess.js (`loadPgn` + full legal move replay) before
any snapshot was generated; snapshots (`<id>.json`, Stockfish depth 18,
MultiPV 3) are produced by `scripts/make-fixtures.mjs`. Game scores are
facts and are not copyrightable expression; sources are recorded here
as required anyway.

| File | Game | Length | Category | Source |
| --- | --- | --- | --- | --- |
| `opera-1858.pgn` | Paul Morphy vs Duke Karl / Count Isouard, "Opera Game", Paris 1858, 1-0 (public domain) | 17 moves · 33 plies | Master / sacrificial | Duplicated verbatim from the app's bundled sample (`src/lib/sampleGame.ts`), whose provenance is the standard published score of the game (also Wikipedia, "Opera Game"). |
| `immortal-1851.pgn` | Adolf Anderssen vs Lionel Kieseritzky, "Immortal Game", London 1851, 1-0 (public domain) | 23 moves · 45 plies | Master / sacrificial | Standard published score (Wikipedia, "Immortal Game"); the common main line with 18…Bxg1 and 19.e5 (some collections print the 18.Bd6 / 19…Qxa1+ move order with the same position after 20.Ke2). |
| `evergreen-1852.pgn` | Adolf Anderssen vs Jean Dufresne, "Evergreen Game", Berlin 1852, 1-0 (public domain) | 24 moves · 47 plies | Master / sacrificial | Standard published score (Wikipedia, "Evergreen Game"). |
| `byrne-fischer-1956.pgn` | Donald Byrne vs Robert James Fischer, "Game of the Century", New York 1956, 0-1 | 41 moves · 82 plies | Master / sacrificial defence | Standard published score (Wikipedia, "Game of the Century"). Note: the famous queen offer is 11…Na4 and the windmill is set up by 17…Be6 and 18…Bxc4+; there is no "…Qc3" in this game (that move belongs to Fischer's win over Benko-era contemporaries / the 1963 Byrne game is a different game) — golden tests assert the Be6 / Nxc3 region. |
| `kasparov-topalov-1999.pgn` | Garry Kasparov vs Veselin Topalov, Wijk aan Zee 1999 (round 4), 1-0 | 44 moves · 87 plies | Master / sacrificial | Standard published score (Wikipedia, "Kasparov versus the World"–era coverage and the game's own article, "Kasparov–Topalov, Wijk aan Zee 1999"); contains the famous 24.Rxd4!! combination. |
| `legal-1750.pgn` | Sire de Légal vs Saint-Brie, Paris 1750, 1-0 (public domain) | 8 moves · 15 plies | Blunder miniature (Légal Trap) | Standard published score (Wikipedia, "Légal Trap"). Black's 6…Bxd1?? walks into 7.Bxf7+ Ke7 8.Nd5#. |
| `greco-1620.pgn` | Gioachino Greco vs NN, Europe 1620, 1-0 (public domain) | 20 moves · 39 plies | Blunder miniature | Standard published score from Greco's manuscripts (Wikipedia, "Gioachino Greco" game collections); Black grabs material (…Nxe4, …Bxc3, …Bxa1) and is mated on f7. |
| `karpov-unzicker-1975.pgn` | Anatoly Karpov vs Wolfgang Unzicker, Milan 1975 (round 4), 1-0 | 22 moves · 43 plies | Quiet positional (Ruy López) | ChessBase shared-game page for Karpov–Unzicker (Milan 1975 game printed directly below the 1974 Nice game on the same page), retrieved 2026-11-01 via share.chessbase.com; main line only, annotations/variations stripped, then chess.js-validated. |
| `lichess-m45sueue.pgn` | jorespi (1711) vs Marzinkus (1800), rated classical (360+6), Lichess `m45sueue`, 2012-12-31, 1-0 | 28 moves · 55 plies | Amateur, tactical/blunder-prone | Lichess game export, via the PGN collection bundled with chess.js (`node_modules/chess.js/benchmarks/benchmark.pgn`) — https://lichess.org/m45sueue — extracted mechanically by game id, no hand transcription. |
| `lichess-7b44wxzu.pgn` | hostking vs troepianiz, rated Lichess `7b44wxzu`, 2012-12-31, 1-0 | 28 moves · 55 plies | Amateur | Same collection — https://lichess.org/7b44wxzu — extracted mechanically by game id. |
| `lichess-n3p0bgc7.pgn` | georgek (1554) vs b777 (1429), rated blitz (300+2) Lichess `n3p0bgc7`, 2012-12-31, 1-0 (time forfeit) | 17 moves · 33 plies | Quiet positional amateur (only 4 captures in the whole game) | Same collection — https://lichess.org/n3p0bgc7 — extracted mechanically by game id. |
| `lichess-7zkpfs9g.pgn` | tiggran (1549) vs maslick (1609), rated blitz (300+0) Lichess `7zkpfs9g`, 2012-12-31, 0-1 | 22 moves · 44 plies | Quiet positional amateur (6 captures) | Same collection — https://lichess.org/7zkpfs9g — extracted mechanically by game id. |

## Deviation from the original plan (recorded honestly)

The first fixture draft also included Karpov–Unzicker, Nice 1974
(87 plies; PGN cross-checked against the ChessBase shared-game page)
and the bullet game Lichess `h6veisdc` (82 plies, already a bench
fixture). Both were dropped before snapshot generation finished —
depth-18 MultiPV-3 generation on this 4-core VM runs at ~5–12 s per
position under parallel load, and the two games added ~170 positions
without adding a category the set lacked (quiet positional: Karpov–
Unzicker Milan 1975 + the two quiet Lichess classical games;
amateur/blunder-prone: Légal, Greco and three Lichess games). The
1974 PGN text was validated with chess.js before removal; it may be
re-added later — `make-fixtures.mjs` is resumable per game.
