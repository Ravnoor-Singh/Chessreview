// Integration: the app's own analysis pipeline (analyzePositionWithBudget +
// the budget tracker + the UCI parser) driving the REAL Stockfish 19
// single-thread engine from the `stockfish` npm package — no fakes, no
// browser. This is the Node-level counterpart of the browser e2e pool test:
// it proves the code that classifies moves can actually steer a real engine
// to a correct result.
//
// Expanded in the post-Round-2 bug-fix program, Prompt 4: forced mates
// (1/2/3, both colours), a stalemate trap, a winning capture, WDL output,
// MultiPV ordering, a stop/cancel race, the Chess960 clean rejection,
// repetition handling in the whole-game analyzer, and a whole-pipeline
// smoke run over the bundled sample game. Every position below was first
// probed against the real engine at the test's own depth/MultiPV before
// its assertions were written; assertions pin only stable facts (forced
// best moves, mate numbers, score signs, ordering) — never exact
// centipawns. The two pre-existing tests carry no `@slow` tag; the new
// tests that run materially deeper/longer than the depth-10 baseline
// (mate-in-3 at depth 16, the two whole-game pipeline runs) are tagged
// `@slow` in their names.
//
// Run via `npm run test:integration` (not part of the default unit run).

import { createRequire } from 'node:module';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Chess } from 'chess.js';
import { analyzePositionWithBudget, type EngineClientLike } from '@/engine/analyzePosition';
import { analyzeGame, terminalEval } from '@/engine/analyzer';
import type { StockfishClient } from '@/engine/stockfish.worker';
import { budgetProfileFor, fullBudgetProfile, trackerScoreCp } from '@/engine/budget';
import { buildPositionCommand, parseInfoLine } from '@/engine/uci';
import { scoreToWhiteCp } from '@/analysis/winProbability';
import { parsePgn, detectChess960 } from '@/parsers/pgn';
import { SAMPLE_PGN } from '@/lib/sampleGame';
import type { EngineLine } from '@/lib/types';

const require = createRequire(import.meta.url);

interface StockfishEngine {
  listener: ((line: string) => void) | null;
  processCommand: (cmd: string) => void;
}

/** Minimal EngineClientLike over the stockfish package's UCI channel. */
class NodeStockfishClient implements EngineClientLike {
  private engine: StockfishEngine;
  private waiters: { predicate: (line: string) => boolean; resolve: (line: string) => void }[] = [];
  private search: {
    lines: Map<number, EngineLine>;
    resolve: (r: { best: string; lines: EngineLine[]; stopped: boolean }) => void;
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void;
    stopped: boolean;
  } | null = null;

  constructor() {
    const Stockfish = require('stockfish') as (kind: string) => StockfishEngine;
    this.engine = Stockfish('single');
    this.engine.listener = (line) => this.onLine(line);
  }

  private send(cmd: string) {
    this.engine.processCommand(cmd);
  }

  private waitFor(predicate: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }

  private onLine(line: string) {
    if (typeof line !== 'string') return;
    this.waiters = this.waiters.filter((w) => {
      if (w.predicate(line)) {
        w.resolve(line);
        return false;
      }
      return true;
    });
    const s = this.search;
    if (!s) return;
    const info = parseInfoLine(line);
    if (info && info.pv.length > 0) {
      const prev = s.lines.get(info.multipv);
      if (!prev || info.depth >= prev.depth) {
        s.lines.set(info.multipv, {
          multipv: info.multipv,
          depth: info.depth,
          scoreCp: info.scoreCp,
          scoreMate: info.scoreMate,
          wdl: info.wdl,
          pv: info.pv,
          nodes: info.nodes,
          nps: info.nps,
          seldepth: info.seldepth,
        });
      }
      if (s.onInfo) {
        const lines = [...s.lines.values()].sort((a, b) => a.multipv - b.multipv);
        const top = lines[0];
        s.onInfo(lines, top?.depth ?? 0, top?.nodes ?? 0, top?.nps ?? 0);
      }
      return;
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(/\s+/)[1] ?? '';
      this.search = null;
      const lines = [...s.lines.values()].sort((a, b) => a.multipv - b.multipv);
      s.resolve({ best, lines, stopped: s.stopped });
    }
  }

  async init(): Promise<void> {
    const uciok = this.waitFor((l) => l === 'uciok');
    this.send('uci');
    await uciok;
    // Mirror the option setup of the app's StockfishClient (Threads,
    // UCI_AnalyseMode, UCI_ShowWDL) at the single-thread test scale, so
    // the WDL test below reads the same real output the app displays.
    this.send('setoption name Threads value 1');
    this.send('setoption name UCI_AnalyseMode value true');
    this.send('setoption name UCI_ShowWDL value true');
    const ready = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  async newGame(): Promise<void> {
    this.send('ucinewgame');
    const ready = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  analyze(
    req: {
      fen: string;
      depth: number;
      movetimeMs?: number;
      multiPv: number;
      history?: { startFen: string; movesUci: string[] };
    },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    return new Promise((resolve) => {
      this.search = { lines: new Map(), resolve, onInfo, stopped: false };
      this.send(`setoption name MultiPV value ${req.multiPv}`);
      this.send('setoption name Hash value 64');
      // Same position-command construction as the app's client, so a
      // supplied game history reaches the engine as `… moves …`.
      this.send(buildPositionCommand(req.fen, req.history));
      const limit = req.movetimeMs
        ? `go depth ${req.depth} movetime ${req.movetimeMs}`
        : `go depth ${req.depth}`;
      this.send(limit);
    });
  }

  stop(): void {
    if (this.search) {
      this.search.stopped = true;
      this.send('stop');
    }
  }

  terminate(): void {
    try {
      this.send('quit');
    } catch {
      // engine already gone
    }
  }
}

// Fixed depth-10 profile with the stability stop disabled (minDepth =
// targetDepth), so the assertions below are about a complete depth-10
// search, not about the adaptive budget.
const FIXED_D10 = fullBudgetProfile(
  budgetProfileFor('standard', { depth: 10, movetimeMs: 60_000 }),
);
// Same construction at depth 16 for the mate-in-3 positions: at depth 12
// with MultiPV the engine's multipv-1 line had not yet converged on the
// forced mate (probed), at depth 16 it returns mate 3 with the mating
// move first and the next-best line a slower mate 4.
const FIXED_D16 = fullBudgetProfile(
  budgetProfileFor('standard', { depth: 16, movetimeMs: 60_000 }),
);

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Position before Qxf7# in Scholar's mate: White to move mates in one.
const SCHOLARS_MATE = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

// Mate in 1, White to move: Ra8 is back-rank mate (the black king is
// fenced in by its own f7/g7/h7 pawns). Composed position; probed at
// depth 10 / MultiPV 3 — a1a8, mate 1, next-best line is a plain cp
// score, so the mating move is unique.
const MATE1_WHITE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
// Mate in 1, Black to move: the colour-swapped mirror of the above;
// probed answer a8a1, mate 1 from Black's (side-to-move) perspective.
const MATE1_BLACK = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';
// Mate in 2, White to move: the Opera Game position after 15...Nxd7 —
// 16.Qb8+ Nxb8 17.Rd8#. Game score: Morphy vs Duke Karl / Count
// Isouard, Paris 1858 (the bundled sample game, src/lib/sampleGame.ts),
// FEN generated with chess.js from that score. Probed at depth 10 /
// MultiPV 3: b3b8, mate 2, next-best line cp — unique.
const MATE2_WHITE = '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16';
// Mate in 2, Black to move: colour-swapped mirror of the Opera
// position above. Probed: b6b1, mate 2, next-best line cp — unique.
const MATE2_BLACK = '2kr4/ppp2ppp/1q6/4p3/4P1b1/4Q3/P2N1PPP/4KB1R b K - 0 16';
// Mate in 3, White to move: Philidor's Legacy (smothered mate) one
// move before the finish — 1.Nh6+ Kh8 (double check, forced)
// 2.Qg8+ Rxg8 (forced) 3.Nf7#. Composed position; the line was also
// walked move-by-move with chess.js (final position is checkmate).
// Probed at depth 16 / MultiPV 3: f7h6, mate 3, next-best mate 4 —
// the mate-in-3 first move is unique.
const MATE3_WHITE = '5rk1/5Npp/8/8/8/1Q6/1B4K1/8 w - - 0 1';
// Mate in 3, Black to move: colour-swapped mirror of the above.
// Probed at depth 16 / MultiPV 3: f2h3, mate 3, next-best mate 4.
const MATE3_BLACK = '8/1b4k1/1q6/8/8/8/5nPP/5RK1 b - - 0 1';
// Stalemate trap, White to move: the natural queen-approach move
// Qc7?? stalemates the bare black king (verified with chess.js below),
// while Qd8 is checkmate in one. Composed KQ-vs-K position; probed at
// depth 10 / MultiPV 3: best d6d8, mate 1.
const STALEMATE_TRAP = 'k7/8/1K1Q4/8/8/8/8/8 w - - 0 1';
const STALEMATING_MOVE = 'd6c7';
// Winning capture, White to move: the black queen on d5 is en prise to
// the rook and nothing can recapture it. Composed position; probed at
// depth 10 / MultiPV 3: d1d5 wins the queen (top line ≈ +6.8 pawns,
// next-best line losing) — only the sign/margin is asserted, not the
// exact centipawns.
const WINNING_CAPTURE = '6k1/5ppp/8/3q4/8/8/5PPP/3R2K1 w - - 0 1';

/** Assert a forced-mate result: mating move first, exact mate number, correct sign from White's perspective too. */
function expectMate(
  result: { lines: EngineLine[]; depth: number },
  fen: string,
  matingMove: string,
  mateIn: number,
  targetDepth: number,
) {
  expect(result.lines.length).toBeGreaterThan(0);
  const top = result.lines[0]!;
  expect(top.pv[0]).toBe(matingMove);
  // Engine scores are side-to-move relative: a mate FOR the mover is
  // positive for both White-to-move and Black-to-move positions.
  expect(top.scoreMate).toBe(mateIn);
  // Normalised to White's perspective the sign flips for Black.
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  expect(scoreToWhiteCp(undefined, top.scoreMate, turn).mate).toBe(turn === 'w' ? mateIn : -mateIn);
  expect(result.depth).toBe(targetDepth);
}

describe('engine integration (real Stockfish 19, app budget pipeline)', () => {
  const client = new NodeStockfishClient();

  beforeAll(async () => {
    await client.init();
  });

  afterAll(() => {
    client.terminate();
  });

  it("finds the mate in one from the Scholar's-mate position", async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, SCHOLARS_MATE, FIXED_D10, 3);
    expect(result.lines.length).toBeGreaterThan(0);
    const top = result.lines[0]!;
    expect(top.pv[0]).toBe('h5f7');
    expect(top.scoreMate).toBe(1);
    expect(result.depth).toBe(10);
  });

  it('returns a sane depth-10 evaluation of the start position', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, STARTPOS, FIXED_D10, 3);
    const top = result.lines[0]!;
    expect(['e2e4', 'd2d4', 'g1f3', 'c2c4']).toContain(top.pv[0]);
    expect(top.scoreMate).toBeUndefined();
    expect(Math.abs(top.scoreCp ?? 999)).toBeLessThan(100);
    expect(result.depth).toBe(10);
    expect(result.stoppedEarly).toBe(false);
  });

  it('finds mate in 1 for White to move (back-rank mate)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE1_WHITE, FIXED_D10, 3);
    expectMate(result, MATE1_WHITE, 'a1a8', 1, 10);
  });

  it('finds mate in 1 for Black to move (back-rank mate, mirrored)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE1_BLACK, FIXED_D10, 3);
    expectMate(result, MATE1_BLACK, 'a8a1', 1, 10);
  });

  it('finds mate in 2 for White to move (Opera Game finish)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE2_WHITE, FIXED_D10, 3);
    expectMate(result, MATE2_WHITE, 'b3b8', 2, 10);
  });

  it('finds mate in 2 for Black to move (Opera Game finish, mirrored)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE2_BLACK, FIXED_D10, 3);
    expectMate(result, MATE2_BLACK, 'b6b1', 2, 10);
  });

  it('@slow finds mate in 3 for White to move (smothered-mate pattern)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE3_WHITE, FIXED_D16, 3);
    expectMate(result, MATE3_WHITE, 'f7h6', 3, 16);
  });

  it('@slow finds mate in 3 for Black to move (smothered-mate pattern, mirrored)', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, MATE3_BLACK, FIXED_D16, 3);
    expectMate(result, MATE3_BLACK, 'f2h3', 3, 16);
  });

  it('does not fall for the stalemate trap: the mating move beats the stalemating one', async () => {
    // The trap is real: Qc7 is legal here and stalemates Black on the
    // spot (bare king, every flight covered, not in check).
    const trap = new Chess(STALEMATE_TRAP);
    const trapMove = trap.move({ from: 'd6', to: 'c7' });
    expect(trapMove.san).toContain('Qc7');
    expect(trap.isStalemate()).toBe(true);

    await client.newGame();
    const result = await analyzePositionWithBudget(client, STALEMATE_TRAP, FIXED_D10, 3);
    const top = result.lines[0]!;
    expect(top.pv[0]).not.toBe(STALEMATING_MOVE);
    expect(top.pv[0]).toBe('d6d8');
    expect(top.scoreMate).toBe(1);
  });

  it('finds the winning capture: rook takes the en-prise queen', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, WINNING_CAPTURE, FIXED_D10, 3);
    const top = result.lines[0]!;
    expect(top.pv[0]).toBe('d1d5');
    // The asserted move really is the queen capture.
    const board = new Chess(WINNING_CAPTURE);
    expect(board.move({ from: 'd1', to: 'd5' }).captured).toBe('q');
    // Winning for the side to move (probed ≈ +680 cp; only a safe
    // winning margin is asserted, never the exact value).
    expect(top.scoreMate).toBeUndefined();
    expect(top.scoreCp ?? 0).toBeGreaterThan(100);
  });

  it('parses real WDL output: three non-negative per-mille values summing to ~1000', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, STARTPOS, FIXED_D10, 3);
    const top = result.lines[0]!;
    expect(top.wdl).toBeDefined();
    const [w, d, l] = top.wdl!;
    for (const v of [w, d, l]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // Stockfish's UCI_ShowWDL model reports win/draw/loss per mille
    // normalised to exactly 1000 (the probed start-position line was
    // 46/947/7). The 990–1010 band leaves room for integer rounding in
    // the model while still catching a scaling error (percentages
    // summing to 100, or unnormalised raw values).
    expect(w + d + l).toBeGreaterThanOrEqual(990);
    expect(w + d + l).toBeLessThanOrEqual(1010);
  });

  it('MultiPV 3 returns three distinct first moves ordered best to worst', async () => {
    await client.newGame();
    const result = await analyzePositionWithBudget(client, STARTPOS, FIXED_D10, 3);
    expect(result.lines.length).toBe(3);
    expect(result.lines.map((line) => line.multipv)).toEqual([1, 2, 3]);
    const firstMoves = result.lines.map((line) => line.pv[0]);
    expect(new Set(firstMoves).size).toBe(3);
    // Ordered best-to-worst: the tracker score (cp with mates encoded)
    // is non-increasing along the MultiPV order.
    const scores = result.lines.map((line) => trackerScoreCp(line.scoreCp, line.scoreMate));
    expect(scores.every((s) => s !== null)).toBe(true);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  it('stop/cancel race: a stopped search leaks nothing into the next analysis', async () => {
    await client.newGame();
    // Start a deep search and stop it mid-flight.
    const pending = client.analyze({ fen: STARTPOS, depth: 24, multiPv: 1 });
    await new Promise((r) => setTimeout(r, 250));
    client.stop();
    const stopped = await pending;
    expect(stopped.stopped).toBe(true);

    // The very next analysis must be a complete, correct result for
    // ITS position — no stale bestmove or lines from the stopped one.
    await client.newGame();
    const result = await analyzePositionWithBudget(client, SCHOLARS_MATE, FIXED_D10, 3);
    const top = result.lines[0]!;
    expect(top.pv[0]).toBe('h5f7');
    expect(top.scoreMate).toBe(1);
    expect(result.depth).toBe(10);
    expect(result.stoppedEarly).toBe(false);
  });

  it('Chess960 is cleanly rejected by the parser layer (no silent standard-chess analysis)', () => {
    // The app never enables UCI_Chess960 on its engine client and
    // chess.js cannot even load a Shredder-FEN castling field, so the
    // documented behaviour (README "Chess960") is an honest rejection:
    // the parser flags the game and the UI refuses to analyze it. This
    // test pins that rejection path — it deliberately does NOT feed a
    // 960 position to the engine, whose castling semantics would be
    // standard-chess and silently wrong.
    const shredderFen = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1';
    const kqkqFen = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1';
    expect(detectChess960({}, shredderFen)).toBe(true);
    expect(detectChess960({}, kqkqFen)).toBe(true);
    expect(detectChess960({}, STARTPOS)).toBe(false);
    expect(() => new Chess().load(shredderFen)).toThrow();

    const pgn = [
      '[Event "Chess960 integration"]',
      '[Variant "Chess960"]',
      '[SetUp "1"]',
      `[FEN "${kqkqFen}"]`,
      '[Result "*"]',
      '',
      '1. e4 e5 2. Nf3 Nf6 *',
      '',
    ].join('\n');
    const games = parsePgn(pgn);
    expect(games.length).toBe(1);
    expect(games[0]!.isChess960).toBe(true);
  });

  it('@slow repetition: the analyzer treats a third occurrence as a draw and searches repeats with game history', async () => {
    // Direct engine check first: the same start position WITH the
    // shuffle history attached (the analyzer's history mechanism)
    // still analyzes normally and returns a legal move — the draw
    // awareness lives in the analyzer, not in a bare engine search
    // (probed: with history the engine still returns e2e4, ~+0.3).
    const shuffleUci = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    await client.newGame();
    const withHistory = await analyzePositionWithBudget(client, STARTPOS, FIXED_D10, 1, undefined, {
      startFen: STARTPOS,
      movesUci: shuffleUci,
    });
    expect(withHistory.lines.length).toBeGreaterThan(0);
    const legalUci = new Chess(STARTPOS)
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion ?? ''));
    expect(legalUci).toContain(withHistory.lines[0]!.pv[0]);

    // Whole-analyzer behaviour (analyzer.ts, repetition awareness):
    // when a position occurs for the third time the analyzer scores it
    // as an exact draw WITHOUT searching it, an evaluation made at its
    // first occurrence is never reused for it, and the second
    // occurrence is searched with the game history attached.
    const pgn = [
      '[Event "Repetition integration"]',
      '[White "A"]',
      '[Black "B"]',
      '[Result "*"]',
      '',
      '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *',
      '',
    ].join('\n');
    const parsed = parsePgn(pgn)[0]!;
    expect(parsed.fens.length).toBe(9);
    // Same position as the start: identical board/side/castling/en-passant
    // fields (only the move counters differ — the analyzer's occurrence
    // counting is EPD-based and ignores them, see epdOfFen).
    const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
    expect(epd(parsed.fens[8]!)).toBe(epd(parsed.fens[0]!));

    const calls: { fen: string; history?: { startFen: string; movesUci: string[] } }[] = [];
    const original = client.analyze.bind(client);
    client.analyze = (req, onInfo) => {
      calls.push({ fen: req.fen, history: req.history });
      return original(req, onInfo);
    };
    let review: Awaited<ReturnType<typeof analyzeGame>>;
    try {
      review = await analyzeGame(
        client as unknown as StockfishClient,
        parsed,
        {
          name: 'Stockfish 19 (integration)',
          mode: 'single',
        },
        {
          depth: 10,
          movetimeMs: 60_000,
          multiPv: 3,
          openingIndex: null,
          token: { cancelled: false },
          presetName: 'standard',
          engineVersion: 'integration-test',
          budgetProfile: FIXED_D10,
        },
      );
    } finally {
      client.analyze = original;
    }
    if (!review) throw new Error('analysis was cancelled unexpectedly');

    // First occurrence of the start position: really searched.
    const first = review.plies[0]!;
    expect(first.lines.length).toBeGreaterThan(0);
    expect(first.depth).toBeGreaterThanOrEqual(FIXED_D10.minDepth);
    // Third occurrence (final ply): exact draw, never searched.
    const third = review.plies[8]!;
    expect(third.depth).toBe(0);
    expect(third.lines.length).toBe(0);
    expect(third.evalWhiteCp).toBe(0);
    expect(third.winProbWhite).toBe(50);
    // The engine saw the start FEN exactly twice: bare for the first
    // occurrence, with the 4-ply history for the second — and never
    // for the third.
    const startCalls = calls.filter((c) => epd(c.fen) === epd(STARTPOS));
    expect(startCalls.length).toBe(2);
    expect(startCalls[0]!.history).toBeUndefined();
    expect(startCalls[1]!.history?.movesUci.length).toBe(4);
  });

  it('@slow whole-pipeline smoke: the bundled sample game analyzes end to end', async () => {
    const parsed = parsePgn(SAMPLE_PGN)[0]!;
    const review = await analyzeGame(
      client as unknown as StockfishClient,
      parsed,
      {
        name: 'Stockfish 19 (integration)',
        mode: 'single',
      },
      {
        depth: 10,
        movetimeMs: 60_000,
        multiPv: 3,
        openingIndex: null,
        token: { cancelled: false },
        presetName: 'standard',
        engineVersion: 'integration-test',
        budgetProfile: FIXED_D10,
      },
    );
    if (!review) throw new Error('analysis was cancelled unexpectedly');

    // Results arrive in ply order, one per game position.
    expect(review.plies.length).toBe(parsed.fens.length);
    review.plies.forEach((ply, i) => expect(ply.ply).toBe(i));

    for (const ply of review.plies) {
      const board = new Chess(ply.fen);
      if (terminalEval(ply.fen)) {
        // Terminal positions are never searched (exact scores).
        expect(ply.depth).toBe(0);
      } else if (board.moves().length === 1) {
        // One-legal-move positions get the depth-1 evaluation only.
        expect(ply.depth).toBe(1);
      } else {
        // Every searched position reached at least the profile's
        // minimum depth (the full-budget profile's minimum = target).
        expect(ply.depth).toBeGreaterThanOrEqual(FIXED_D10.minDepth);
      }
      if (ply.ply > 0) {
        // Every played move was classified and scored for accuracy.
        expect(ply.classification).toBeDefined();
        expect(ply.accuracy).toBeGreaterThanOrEqual(0);
        expect(ply.accuracy).toBeLessThanOrEqual(100);
      }
    }
    expect(review.accuracy.white).not.toBeNull();
    expect(review.accuracy.black).not.toBeNull();
    expect(review.accuracy.white!).toBeGreaterThanOrEqual(0);
    expect(review.accuracy.white!).toBeLessThanOrEqual(100);
    expect(review.accuracy.black!).toBeGreaterThanOrEqual(0);
    expect(review.accuracy.black!).toBeLessThanOrEqual(100);
  });
});
