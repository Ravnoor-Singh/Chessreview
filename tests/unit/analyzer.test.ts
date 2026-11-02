import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineLine } from '@/lib/types';
import type { StockfishClient } from '@/engine/stockfish.worker';
import { analyzeGame } from '@/engine/analyzer';
import { buildOpeningIndex, parseOpeningsTsv, type OpeningIndex } from '@/analysis/openings';
import { parsePgn } from '@/parsers/pgn';

interface RecordedCall {
  fen: string;
  depth: number;
  movetimeMs?: number;
}

/**
 * Scripted fake engine client. `scores` maps a FEN to the top line's
 * side-to-move cp score. In streaming mode it emits one info update per
 * depth (constant best move/score) and honors stop(), like the real UCI
 * client; otherwise it resolves immediately, reporting depth − 4 on the
 * first call for a FEN (an adaptive first pass) and full depth after.
 */
class FakeClient {
  calls: RecordedCall[] = [];
  stopCalls = 0;
  private callCountByFen = new Map<string, number>();
  private stopped = false;

  constructor(
    private scores: Map<string, number>,
    private streaming = false,
  ) {}

  async newGame(): Promise<void> {}

  stop(): void {
    this.stopCalls++;
    this.stopped = true;
  }

  async analyze(
    req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    this.calls.push({ fen: req.fen, depth: req.depth, movetimeMs: req.movetimeMs });
    const scoreCp = this.scores.get(req.fen) ?? 20;
    const lineAt = (depth: number): EngineLine => ({
      multipv: 1,
      depth,
      scoreCp,
      pv: ['e2e4', 'e7e5'],
    });
    if (this.streaming) {
      this.stopped = false;
      let depth = 0;
      while (depth < req.depth && !this.stopped) {
        depth++;
        onInfo?.([lineAt(depth)], depth, depth * 1000, 5000);
        await new Promise((r) => setTimeout(r, 0));
      }
      return { best: 'e2e4', lines: [lineAt(depth)], stopped: this.stopped };
    }
    const n = (this.callCountByFen.get(req.fen) ?? 0) + 1;
    this.callCountByFen.set(req.fen, n);
    const depth = n === 1 ? Math.max(1, req.depth - 4) : req.depth;
    return { best: 'e2e4', lines: [lineAt(depth)], stopped: false };
  }
}

async function run(pgn: string, client: FakeClient, openingIndex: OpeningIndex | null = null) {
  const games = parsePgn(pgn);
  const review = await analyzeGame(
    client as unknown as StockfishClient,
    games[0],
    { name: 'Fake', mode: 'single' },
    {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex,
      presetName: 'standard',
      engineVersion: 'test-1',
      token: { cancelled: false },
    },
  );
  if (!review) throw new Error('analysis was cancelled unexpectedly');
  return review;
}

const SCHOLARS_MATE = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
`;

describe('analyzeGame — terminal positions', () => {
  it('never searches a terminal (checkmate) position and scores it exactly', async () => {
    const client = new FakeClient(new Map());
    const review = await run(SCHOLARS_MATE, client);
    const finalFen = review.plies[review.plies.length - 1].fen;
    expect(client.calls.some((c) => c.fen === finalFen)).toBe(false);
    const last = review.plies[review.plies.length - 1];
    expect(last.mate).toBe(0);
    expect(last.evalWhiteCp).toBe(100000);
    expect(last.depth).toBe(0);
    expect(last.winProbWhite).toBe(100);
  });
});

describe('analyzeGame — one-legal-move positions', () => {
  it('searches a forced position at depth 1 only', async () => {
    const pgn = `[Event "Forced"]
[SetUp "1"]
[FEN "7k/8/8/6Q1/8/8/8/K7 b - - 0 1"]
[Result "*"]

1... Kh7 *
`;
    const client = new FakeClient(new Map());
    const review = await run(pgn, client);
    const startFen = review.plies[0].fen;
    const startCalls = client.calls.filter((c) => c.fen === startFen);
    expect(startCalls.length).toBe(1);
    expect(startCalls[0].depth).toBe(1);
    // The following (normal) position is searched at the full target depth.
    const nextFen = review.plies[1].fen;
    const nextCalls = client.calls.filter((c) => c.fen === nextFen);
    expect(nextCalls.length).toBeGreaterThan(0);
    expect(nextCalls[0].depth).toBe(18);
  });
});

describe('analyzeGame — critical positions', () => {
  it('re-analyzes a position whose eval swings > 12 win-% points at full depth', async () => {
    const games = parsePgn('1. e4 e5 *');
    const [startFen, afterE4, afterE5] = games[0].fens;
    const scores = new Map<string, number>([
      [startFen, 20], // White +20
      [afterE4, -900], // Black to move is -900 → White +900: a huge swing
      [afterE5, 850], // White +850: calm again
    ]);
    const client = new FakeClient(scores);
    await run('1. e4 e5 *', client);
    const callsFor = (fen: string) => client.calls.filter((c) => c.fen === fen);
    expect(callsFor(startFen).length).toBe(1);
    expect(callsFor(afterE4).length).toBe(2); // first pass + full-depth re-analysis
    // Round 2 like-for-like: afterE4 was deepened to 18, so afterE5's
    // first pass (depth 14 from this fake) is extended to match it —
    // a second call the pre-Round-2 pipeline did not make.
    expect(callsFor(afterE5).length).toBe(2);
    expect(callsFor(afterE5)[1].depth).toBe(18);
    // The re-analysis is the second call and goes to the full target depth.
    expect(callsFor(afterE4)[1].depth).toBe(18);
  });

  it('does not re-analyze when evals move calmly', async () => {
    const games = parsePgn('1. e4 e5 *');
    const [startFen, afterE4, afterE5] = games[0].fens;
    const scores = new Map<string, number>([
      [startFen, 20],
      [afterE4, -25],
      [afterE5, 30],
    ]);
    const client = new FakeClient(scores);
    await run('1. e4 e5 *', client);
    expect(client.calls.length).toBe(3); // exactly one search per position
  });
});

describe('analyzeGame — book streak (Fix 0)', () => {
  // A minimal index whose entry endpoints cover every prefix position of
  // 1. e4 e5 2. Nf3 Nc6, exactly like the real book (keys are positions
  // AFTER an opening line — the start position is never a key).
  const smallIndex = buildOpeningIndex(
    parseOpeningsTsv(
      [
        'eco\tname\tpgn',
        'C20\tKing Pawn Game\t1. e4',
        'C40\tKing Pawn Game\t1. e4 e5',
        'C40\tKing Pawn Game\t1. e4 e5 2. Nf3',
        'C44\tKing Pawn Game\t1. e4 e5 2. Nf3 Nc6',
      ].join('\n'),
    ),
  );

  it('classifies the opening plies of a standard-start game as book', async () => {
    const client = new FakeClient(new Map());
    const review = await run('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *', client, smallIndex);
    const classes = review.plies.slice(1).map((p) => p.classification);
    expect(classes.slice(0, 4)).toEqual(['book', 'book', 'book', 'book']);
    expect(classes[4]).not.toBe('book'); // 3. Bb5 leaves this small book
    expect(review.counts.white.book).toBe(2);
    expect(review.counts.black.book).toBe(2);
  });

  it('Halloween Gambit vs the REAL opening index: book plies are 1-7 (W4/B3)', async () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'openings');
    const realIndex = buildOpeningIndex(
      readdirSync(dir)
        .filter((f) => f.endsWith('.tsv'))
        .flatMap((f) => parseOpeningsTsv(readFileSync(join(dir, f), 'utf8'))),
    );
    const pgn = `[Event "Live Chess"]
[White "GM-RAVNOOR"]
[Black "d3dd33ddd333"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nf6 3. Nc3 Nc6 4. Nxe5 Nxe5 5. d4 Nc6 6. e5 Ne4 7. Qf3 Nxc3 8. Qxc3 d5 9. exd6 Qxd6 10. d5 Be7 11. dxc6 bxc6 12. Bf4 Qe6+ 13. Be2 Ba6 14. Be3 Bxe2 15. Kxe2 O-O-O 16. Rhe1 Bg5 17. Kf1 Bxe3 18. Rxe3 Qg6 19. Qc4 Rd7 20. Qa6+ Kd8 21. Qxa7 Rd6 22. Qb8+ Kd7 23. Qxh8 Qxc2 24. Rae1 Rd1 25. Qe8+ Kd6 26. Qe7+ Kd5 27. Qe4+ Kc5 28. Qxc2+ Kb6 29. Rb3+ Ka7 30. Qc5+ Ka8 31. Qa5# 1-0
`;
    const client = new FakeClient(new Map());
    const review = await run(pgn, client, realIndex);
    // Before Fix 0 these counts were 0/0: the streak was seeded with
    // has(startPosition), which is never an index key. The index covers
    // plies 1-7 (White 1,3,5,7 / Black 2,4,6); chess.com's own book ends
    // one White ply earlier (their count is 3/3) — the difference is the
    // datasets, not the streak logic.
    expect(review.counts.white.book).toBe(4);
    expect(review.counts.black.book).toBe(3);
    const classes = review.plies.slice(1).map((p) => p.classification);
    expect(classes.slice(0, 7)).toEqual(Array(7).fill('book'));
    expect(classes[7]).not.toBe('book'); // 4... Nxe5 leaves the book
    expect(review.opening?.name).toContain('Halloween Gambit');
    // Building the real ~3.8k-entry index plus a 61-ply analysis exceeds
    // the default 5 s test timeout on this machine.
  }, 30000);

  it('FEN-start at an indexed book position keeps the streak; off-book FEN does not', async () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const bookFen = chess.fen(); // position after 1. e4 e5 — an index key above
    const pgn = `[Event "FEN start"]
[SetUp "1"]
[FEN "${bookFen}"]
[Result "*"]

2. Nf3 Nc6 *
`;
    const client = new FakeClient(new Map());
    const review = await run(pgn, client, smallIndex);
    expect(review.counts.white.book).toBe(1);
    expect(review.counts.black.book).toBe(1);

    const offBook = `[Event "FEN start off book"]
[SetUp "1"]
[FEN "7k/8/8/6Q1/8/8/8/K7 b - - 0 1"]
[Result "*"]

1... Kh7 *
`;
    const client2 = new FakeClient(new Map());
    const review2 = await run(offBook, client2, smallIndex);
    expect(review2.counts.white.book + review2.counts.black.book).toBe(0);
  });
});

describe('analyzeGame — stability stop integration', () => {
  it('stops a stable search at the budget minimum instead of the target depth', async () => {
    const client = new FakeClient(new Map(), true); // streaming, constant move/score
    const review = await run('1. e4 *', client);
    // Standard preset: minDepth 14 (Round 2 floor), target 18. A perfectly
    // stable position must be cut at depth 14 by the tracker (stop()
    // called on the client).
    expect(client.stopCalls).toBeGreaterThan(0);
    for (const ply of review.plies) {
      expect(ply.depth).toBe(14);
    }
  });
});

describe('analyzeGame — Round 2 depth alignment', () => {
  it('like-for-like: a position cut shallower than its predecessor is extended to match', async () => {
    // Streaming fake whose score DRIFTS for the start position (never
    // stable → runs to target 18) and is constant elsewhere (stable →
    // cut at the Standard floor, 14). The after-e4 position must then be
    // extended to depth 18 so 1. e4 is judged from matched depths.
    const games = parsePgn('1. e4 *');
    const [startFen, afterE4] = games[0].fens;
    class DriftClient extends FakeClient {
      async analyze(
        req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
        onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
      ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
        if (req.fen !== startFen || !onInfo) return super.analyze(req, onInfo);
        this.calls.push({ fen: req.fen, depth: req.depth, movetimeMs: req.movetimeMs });
        let depth = 0;
        // stop() flips the inherited private flag via the base stop();
        // emulate the base streaming loop with a drifting score.
        while (depth < req.depth) {
          depth++;
          onInfo(
            [{ multipv: 1, depth, scoreCp: 20 + depth * 20, pv: ['e2e4', 'e7e5'] }],
            depth,
            depth * 1000,
            5000,
          );
          await new Promise((r) => setTimeout(r, 0));
        }
        return {
          best: 'e2e4',
          lines: [{ multipv: 1, depth, scoreCp: 20 + depth * 20, pv: ['e2e4', 'e7e5'] }],
          stopped: false,
        };
      }
    }
    const client = new DriftClient(new Map(), true);
    const review = await run('1. e4 *', client);
    expect(review.plies[0].depth).toBe(18);
    const callsAfter = client.calls.filter((c) => c.fen === afterE4);
    expect(callsAfter.length).toBe(2); // first pass (cut at 14) + depth-match extension
    expect(callsAfter[1].depth).toBe(18);
    expect(callsAfter[1].movetimeMs).toBe(3000); // Standard critical multiplier: 2 × 1500 ms
    expect(review.plies[1].depth).toBe(18);
  });

  it('re-analyzes at full depth when the min-depth best move falls out of the final top-3', async () => {
    const games = parsePgn('1. e4 *');
    const afterE4 = games[0].fens[1];
    // Streams e2e4 as best (drifting score) up to the Standard floor;
    // the FIRST info at depth 14 still says e2e4 (so the tracker records
    // it as the min-depth best move), a second info at the same depth
    // switches to g1f3, which then stays perfectly stable — the tracker
    // stability-stops at depth 17 with e2e4 nowhere in the final top-3.
    class SwitchClient {
      calls: RecordedCall[] = [];
      private stopped = false;
      async newGame(): Promise<void> {}
      stop(): void {
        this.stopped = true;
      }
      async analyze(
        req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
        onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
      ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
        this.calls.push({ fen: req.fen, depth: req.depth, movetimeMs: req.movetimeMs });
        this.stopped = false;
        let depth = 0;
        const emit = (d: number, move: string, scoreCp: number) =>
          onInfo?.([{ multipv: 1, depth: d, scoreCp, pv: [move, 'e7e5'] }], d, d * 1000, 5000);
        while (depth < req.depth && !this.stopped) {
          depth++;
          if (depth < 14) emit(depth, 'e2e4', 20 + depth * 20);
          else if (depth === 14) {
            emit(14, 'e2e4', 300);
            if (!this.stopped) emit(14, 'g1f3', 400);
          } else emit(depth, 'g1f3', 400);
          await new Promise((r) => setTimeout(r, 0));
        }
        const lines: EngineLine[] = [
          { multipv: 1, depth, scoreCp: 30, pv: ['g1f3', 'e7e5'] },
          { multipv: 2, depth, scoreCp: 10, pv: ['d2d4', 'd7d5'] },
          { multipv: 3, depth, scoreCp: 0, pv: ['c2c4', 'e7e5'] },
        ];
        return { best: 'g1f3', lines, stopped: this.stopped };
      }
    }
    const client = new SwitchClient();
    await run('1. e4 *', client as unknown as FakeClient);
    const callsAfter = client.calls.filter((c) => c.fen === afterE4);
    // First pass + full-depth critical re-analysis (Standard 2× ceiling).
    expect(callsAfter.length).toBe(2);
    expect(callsAfter[1].depth).toBe(18);
    expect(callsAfter[1].movetimeMs).toBe(3000);
  });
});
