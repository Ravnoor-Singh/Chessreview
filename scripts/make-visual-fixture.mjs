/**
 * Builds tests/fixtures/visual-review.json — a completed GameReview for
 * Morphy's Opera Game, used ONLY by the Playwright screenshot tests
 * (tests/e2e/visual.spec.ts) so review screenshots are deterministic and
 * never run the engine. Position data (FEN/SAN/UCI) is computed with
 * chess.js from the same PGN the app bundles as its sample game; the
 * eval/classification values are fixed seed data for the fixture (they
 * are screenshot fixtures, not analysis results).
 *
 * Run: node scripts/make-visual-fixture.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const PGN = `[Event "Opera Game"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[Round "-"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]
[Opening "Philidor Defense"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0
`;

/** White-perspective eval (cp) AFTER each ply; index 0 = start position. */
const EVALS = [
  25, 30, 25, 35, 20, 45, 60, 40, 55, 50, 65, 60, 70, 85, 80, 110, 130, 120, 150, 420, 380, 460,
  520, 480, 560, 900, 850, 980, 1050, 990, 1200, 2400, 2600, 99999,
];

/** Classification of the move that LED to each ply (index = ply, 1-based moves). */
const CLASSES = [
  null,
  'book',
  'book',
  'book',
  'book',
  'book',
  'inaccuracy',
  'best',
  'excellent',
  'good',
  'best',
  'good',
  'excellent',
  'good',
  'good',
  'best',
  'inaccuracy',
  'good',
  'best',
  'brilliant',
  'mistake',
  'best',
  'good',
  'excellent',
  'inaccuracy',
  'brilliant',
  'good',
  'best',
  'excellent',
  'good',
  'best',
  'brilliant',
  'blunder',
  'best',
];

const ACC_BY_CLASS = {
  brilliant: 100,
  great: 97,
  best: 96,
  excellent: 90,
  good: 82,
  book: 95,
  inaccuracy: 65,
  mistake: 45,
  blunder: 25,
  miss: 40,
  forced: 95,
};

const FEEDBACK = {
  brilliant: 'A brilliant sacrifice — the engine agrees this is the strongest idea.',
  great: 'A great move, finding the strongest continuation.',
  best: 'The best move in the position.',
  excellent: 'An excellent move, keeping the pressure on.',
  good: 'A good, solid move.',
  book: 'A known book move.',
  inaccuracy: 'A slight inaccuracy — a more precise move was available.',
  mistake: 'A mistake that gives the opponent chances.',
  blunder: 'A blunder — this loses material by force.',
  miss: 'A missed opportunity.',
  forced: 'The only move.',
};

const CLASSES_ALL = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
  'forced',
];

function winProb(cp) {
  if (cp >= 99999) return 100;
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return Math.max(0, Math.min(100, pct));
}

const chess = new Chess();
chess.loadPgn(PGN);
const history = chess.history({ verbose: true });

const replay = new Chess();
const plies = [
  {
    ply: 0,
    fen: replay.fen(),
    evalWhiteCp: EVALS[0],
    lines: [],
    depth: 18,
    winProbWhite: winProb(EVALS[0]),
  },
];

const counts = {
  white: Object.fromEntries(CLASSES_ALL.map((c) => [c, 0])),
  black: Object.fromEntries(CLASSES_ALL.map((c) => [c, 0])),
};

history.forEach((move, i) => {
  replay.move({ from: move.from, to: move.to, promotion: move.promotion });
  const ply = i + 1;
  const cls = CLASSES[ply];
  const color = move.color;
  counts[color === 'w' ? 'white' : 'black'][cls] += 1;
  const accuracy = ACC_BY_CLASS[cls];
  const next = history[i + 1];
  plies.push({
    ply,
    fen: replay.fen(),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    color,
    evalWhiteCp: EVALS[ply],
    lines: next
      ? [
          {
            multipv: 1,
            depth: 18,
            pv: [`${next.from}${next.to}${next.promotion ?? ''}`],
            scoreCp: (replay.turn() === 'w' ? 1 : -1) * EVALS[ply + 1],
          },
        ]
      : [],
    depth: 18,
    winProbWhite: winProb(EVALS[ply]),
    epl: Math.round((100 - accuracy) * 0.9),
    accuracy,
    classification: cls,
    feedback: FEEDBACK[cls],
    bestMoveSan: move.san,
    bestMoveUci: `${move.from}${move.to}${move.promotion ?? ''}`,
  });
});

// Ply 0 lines: the first move as the top line.
plies[0].lines = [{ multipv: 1, depth: 18, pv: [plies[1].uci], scoreCp: EVALS[1] }];

const review = {
  id: 'visual-fixture-opera',
  pgn: PGN,
  headers: {
    Event: 'Opera Game',
    Site: 'Paris FRA',
    Date: '1858.??.??',
    Round: '-',
    White: 'Paul Morphy',
    Black: 'Duke Karl / Count Isouard',
    Result: '1-0',
    ECO: 'C41',
    Opening: 'Philidor Defense',
  },
  plies,
  accuracy: { white: 91.3, black: 74.6 },
  counts,
  opening: { eco: 'C41', name: 'Philidor Defense', sequenceSan: ['e4', 'e5', 'Nf3', 'd6'] },
  performance: {
    white: { band: 'master', label: 'Master-level play' },
    black: { band: 'club', label: 'Club-level play' },
  },
  acpl: { white: 18, black: 42 },
  engine: { name: 'Stockfish 19', depth: 18, mode: 'single' },
  createdAt: 1761955200000,
};

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'visual-review.json',
);
writeFileSync(out, `${JSON.stringify(review, null, 1)}\n`);
console.log(`wrote ${out} (${plies.length} plies)`);
