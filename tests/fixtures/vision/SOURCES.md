# Vision fixture sources and licences

Every fixture in this folder, where it came from, and how its ground-truth
FEN was established. The corpus is what `npm run vision:eval` and
`tests/unit/vision-fixtures.test.ts` measure the screenshot-to-FEN
recognizer against. All entries are in `manifest.json`; lichess captures
are additionally listed in `captures.json`.

**Orientation convention:** ground truth is the placement *as displayed in
the image* (top row = rank 8). The recognizer reads boards as displayed;
the app's UI — never the recognizer — owns flipping (see
`src/vision/types.ts`). Lichess orients its analysis board to the side to
move, so captures of black-to-move FENs (and the deliberately flipped
captures) are recorded rotated 180° relative to the game FEN.

## Generated renders (102) — the app's own artwork

`clean-*`, `realistic-*`, `rotated-*`, `compressed-*` are rendered by
`scripts/make-vision-fixtures.mjs` from this app's own five SVG piece sets
and board themes, from known FENs. Licence: the project's own assets.
Kinds: `clean` (plain board), `realistic` (full app chrome around the
board), `rotated` (the rendered image rotated by the angle in the file
name, then saved), plus two JPEG-compressed renders (q50/q35).

## Lichess screenshots (26) — real screenshots of another product

`lichess-*.png`, captured 2026-11-01 by `scripts/capture-lichess-fixtures.mjs`
from https://lichess.org/analysis (public analysis board, no account).
Board/pieces: lichess's **cburnett** piece set (by Colin M.L. Burnett,
GFDL/BSD/CC BY-SA — the standard lichess set) on the default brown theme;
lichess itself is AGPL-3.0 open source. These files are used solely as
test fixtures (measurement inputs), never as product assets or UI.

Ground truth: extracted from the chessground DOM (piece classes +
transforms) at capture time and asserted equal to the requested position
before the screenshot was taken; a mismatch skipped the capture instead of
mislabelling it. Matrix: 10 positions as board-element screenshots; 4 of
them repeated flipped (Black at the bottom, via the site's flip key); 4
at a mobile viewport (420×860); 2 with moves played on the board so
last-move highlights are visible (ground truth re-extracted after the
moves); 6 as full-page screenshots (board plus the site's panels).

Positions (game FENs; black-to-move and flipped captures are stored
rotated per the convention above): startpos, Italian, Sicilian, French,
QGD middlegames; a pawn endgame; rook, queen and king-and-rook endgames;
a bishop middlegame.

## Photographs (3) — Wikimedia Commons

Physical-board photographs, downloaded from Wikimedia Commons on
2026-11-01. Ground truth transcribed by eye from the photograph; in this
corpus the convention above means the placement as the camera sees it.

| File | Source | Licence | Ground truth |
| --- | --- | --- | --- |
| `photo-staunton-startpos.jpg` | [Chess game Staunton No. 6 top view.jpg](https://commons.wikimedia.org/wiki/File:Chess_game_Staunton_No._6_top_view.jpg) | CC0 | Starting position, verified square-by-square (all 32 pieces on their home squares; coordinates printed on the frame agree). Committed downscaled to 1600 px, the client's own cap. |
| `photo-figurine-rotated.jpg` | [Chess board (top view).jpg](https://commons.wikimedia.org/wiki/File:Chess_board_(top_view).jpg) | CC BY-SA 4.0 | A themed figurine set in the starting arrangement, photographed rotated 90° (White's home columns on the right). Placement = the startpos grid rotated 90° CCW; corners and both pawn columns verified against the photo. |
| `photo-black-side-startpos.jpg` | [Opening chess position from black side.jpg](https://commons.wikimedia.org/wiki/File:Opening_chess_position_from_black_side.jpg) | CC BY-SA 3.0 | Starting position photographed from Black's side; placement recorded as displayed (White's pieces in the top rows). |

### Candidates examined and rejected (not in the corpus)

Fixture ground truth must be certain; these properly licensed photographs
were downloaded and inspected on 2026-11-01 but **excluded** because their
positions could not be transcribed with certainty:

- "Schachbrett -- 2021 -- 9676.jpg" (CC BY-SA 4.0) — beautiful top-down
  mid-game, but the black pawn cluster around ranks 5–6 kept ±1-square
  ambiguity after quadrant-by-quadrant transcription, and two king/queen
  calls rested on knob-vs-coronet judgement alone.
- "Chess board 2.jpg" (CC BY-SA 3.0) — 640×480 paper-board game photo;
  piece identities at this resolution are not certain.
- "A chess board.JPG" (CC BY-SA 3.0, Maharashtra Chess League) — board is
  small in frame, strongly perspective-distorted, partly occluded by
  flags and bottles; transcription unsafe.
- "Dehli chess set - top.jpg" (public domain) — single-colour display set;
  piece colours cannot be assigned.
- "Engaging chess match…" (CC BY 2.0) — translucent plastic set, hand
  occlusion, shallow depth of field; transcription unsafe.
- "Chess at Chinatown, Singapore.jpg" (CC BY-SA 3.0) — depicts xiangqi,
  not chess.

The photo category therefore has n=3. Its measured accuracy is reported
as-is in the release report; the spec's "≥10 photos if properly licensed
ones can be found" was pursued (six candidates sourced) but certainty of
ground truth won over count. Anyone can measure more photos locally with
`npm run vision:eval -- <folder>` without committing them.

## chess.com imagery

None. No chess.com screenshots or assets are in this corpus, and none may
be added (proprietary imagery). To measure the recognizer against a
chess.com board, use `npm run vision:eval -- <local folder>` with your own
screenshots and `<image>.fen` sidecars — locally, never committed.
