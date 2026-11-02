// Coverage-oriented behavior tests for the parts of src/engine/analyzer.ts
// the sequential suites do not reach: the EnginePool driver (runWithPool,
// including its critical-deepen and cancellation paths), the LiveSession
// class, maxPlies truncation, the headers-based opening fallback, the
// Chess960 book suppression, and a black-delivers-mate finish. All engines
// are scripted fakes; no behavior asserted here depends on a real search.
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { EngineLine } from '@/lib/types';
import type { StockfishClient } from '@/engine/stockfish.worker';
import type { EngineClientLike } from '@/engine/analyzePosition';
import { analyzeGame, LiveSession } from '@/engine/analyzer';
import { EnginePool } from '@/engine/pool';
import { buildOpeningIndex, parseOpeningsTsv } from '@/analysis/openings';
import { parsePgn, type ParsedGameWithPgn } from '@/parsers/pgn';

/**
 * Fake engine whose top line always starts with the first legal move of
 * the position (so analyzer internals see a plausible PV). First search
 * of a FEN reports target-4 depth (an adaptive first pass); later
 * searches report the full requested depth.
 */
class LegalMoveFake implements EngineClientLike {
  calls: { fen: string; depth: number }[] = [];
  private counts = new Map<string, number>();

  constructor(private scores: Map<string, number> = new Map()) {}

  async newGame(): Promise<void> {}

  stop(): void {}

  async analyze(
    req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    this.calls.push({ fen: req.fen, depth: req.depth });
    const n = (this.counts.get(req.fen) ?? 0) + 1;
    this.counts.set(req.fen, n);
    const depth = n === 1 ? Math.max(1, req.depth - 4) : req.depth;
    const first = new Chess(req.fen).moves({ verbose: true })[0];
    const uci = first ? first.from + first.to + (first.promotion ?? '') : 'a2a3';
    const line: EngineLine = {
      multipv: 1,
      depth,
      scoreCp: this.scores.get(req.fen) ?? 20,
      pv: [uci],
    };
    onInfo?.([line], depth, 1000, 5000);
    return { best: uci, lines: [line], stopped: false };
  }
}

const META = { name: 'Fake', mode: 'single' as const };

function parsed(pgn: string): ParsedGameWithPgn {
  const games = parsePgn(pgn);
  if (!games[0]) throw new Error('test PGN did not parse');
  return games[0];
}

const SHORT_GAME = `[Event "Pool"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *
`;

describe('analyzeGame — pool driver', () => {
  it('analyzes a full game through the pool and classifies every ply', async () => {
    const game = parsed(SHORT_GAME);
    const created: LegalMoveFake[] = [];
    const pool = new EnginePool({
      size: 2,
      createClient: async () => {
        const c = new LegalMoveFake();
        created.push(c);
        return c;
      },
    });
    const review = await analyzeGame(
      new LegalMoveFake() as unknown as StockfishClient,
      game,
      META,
      {
        depth: 18,
        movetimeMs: 1500,
        multiPv: 3,
        openingIndex: null,
        token: { cancelled: false },
        presetName: 'standard',
        engineVersion: 'test-1',
        pool,
      },
    );
    expect(review).not.toBeNull();
    expect(review!.plies.length).toBe(game.fens.length);
    expect(review!.plies[review!.plies.length - 1].classification).toBeDefined();
    expect(created.length).toBeGreaterThan(0);
    const searches = created.reduce((n, c) => n + c.calls.length, 0);
    expect(searches).toBeGreaterThanOrEqual(game.fens.length - 1);
  });

  it('deepens a critical pool result via a priority submit', async () => {
    const game = parsed(SHORT_GAME);
    // After 1. e4 the side to move (Black) is suddenly -900 cp: from
    // White's perspective the eval swings massively versus the start
    // position, so the pool driver must re-analyze that ply at full
    // budget before finalizing it.
    const afterE4 = game.fens[1]!;
    const scores = new Map([[afterE4, -900]]);
    const created: LegalMoveFake[] = [];
    const pool = new EnginePool({
      size: 2,
      createClient: async () => {
        const c = new LegalMoveFake(scores);
        created.push(c);
        return c;
      },
    });
    const review = await analyzeGame(
      new LegalMoveFake() as unknown as StockfishClient,
      game,
      META,
      {
        depth: 18,
        movetimeMs: 1500,
        multiPv: 3,
        openingIndex: null,
        token: { cancelled: false },
        presetName: 'standard',
        engineVersion: 'test-1',
        pool,
      },
    );
    expect(review).not.toBeNull();
    const deepenCalls = created.flatMap((c) => c.calls).filter((c) => c.fen === afterE4);
    expect(deepenCalls.length).toBeGreaterThanOrEqual(2);
    expect(review!.plies[1].depth).toBe(18);
  });

  it('returns null when the token is cancelled during pool analysis', async () => {
    const game = parsed(SHORT_GAME);
    const token = { cancelled: false };
    const pool = new EnginePool({
      size: 1,
      createClient: async () => {
        const c = new LegalMoveFake();
        const orig = c.analyze.bind(c);
        c.analyze = async (...args: Parameters<EngineClientLike['analyze']>) => {
          token.cancelled = true;
          return orig(...args);
        };
        return c;
      },
    });
    const review = await analyzeGame(
      new LegalMoveFake() as unknown as StockfishClient,
      game,
      META,
      {
        depth: 18,
        movetimeMs: 1500,
        multiPv: 3,
        openingIndex: null,
        token,
        presetName: 'standard',
        engineVersion: 'test-1',
        pool,
      },
    );
    expect(review).toBeNull();
  });

  it('handles a game ending in checkmate through the pool (terminal plan)', async () => {
    const mate = `[Event "PoolMate"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
`;
    const pool = new EnginePool({
      size: 2,
      createClient: async () => new LegalMoveFake(),
    });
    const review = await analyzeGame(
      new LegalMoveFake() as unknown as StockfishClient,
      parsed(mate),
      META,
      {
        depth: 18,
        movetimeMs: 1500,
        multiPv: 3,
        openingIndex: null,
        token: { cancelled: false },
        presetName: 'standard',
        engineVersion: 'test-1',
        pool,
      },
    );
    expect(review).not.toBeNull();
    const last = review!.plies[review!.plies.length - 1];
    expect(last.mate).toBe(0);
    expect(last.depth).toBe(0);
  });
});

describe('analyzeGame — options and fallbacks', () => {
  const client = () => new LegalMoveFake() as unknown as StockfishClient;

  it('maxPlies truncates the analyzed prefix exactly', async () => {
    const review = await analyzeGame(client(), parsed(SHORT_GAME), META, {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex: null,
      token: { cancelled: false },
      maxPlies: 2,
    });
    expect(review).not.toBeNull();
    expect(review!.plies.length).toBe(3); // start position + 2 plies
  });

  it('falls back to the PGN Opening/ECO headers when no index match exists', async () => {
    const pgn = `[Event "Hdr"]
[White "A"]
[Black "B"]
[ECO "C50"]
[Opening "Italian Game"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 *
`;
    const review = await analyzeGame(client(), parsed(pgn), META, {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex: null,
      token: { cancelled: false },
    });
    expect(review!.opening).toEqual({ eco: 'C50', name: 'Italian Game', sequenceSan: [] });
  });

  it('never applies the opening book to a Chess960 game', async () => {
    const pgn = `[Event "960"]
[Variant "Chess960"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 *
`;
    const smallIndex = buildOpeningIndex(
      parseOpeningsTsv(
        ['eco\tname\tpgn', 'C20\tKing Pawn Game\t1. e4', 'C40\tKing Pawn Game\t1. e4 e5'].join(
          '\n',
        ),
      ),
    );
    const review = await analyzeGame(client(), parsed(pgn), META, {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex: smallIndex,
      token: { cancelled: false },
    });
    expect(review!.plies.every((p) => p.classification !== 'book')).toBe(true);
    expect(review!.opening).toBeUndefined();
  });

  it('scores a black-delivered mate as 0% win probability for White', async () => {
    const fools = `[Event "Fools"]
[White "A"]
[Black "B"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`;
    const review = await analyzeGame(client(), parsed(fools), META, {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex: null,
      token: { cancelled: false },
    });
    const last = review!.plies[review!.plies.length - 1];
    expect(last.mate).toBe(0);
    expect(last.evalWhiteCp).toBeLessThan(0);
    expect(last.winProbWhite).toBe(0);
  });

  it('returns null when cancelled before the sequential driver starts', async () => {
    const review = await analyzeGame(client(), parsed(SHORT_GAME), META, {
      depth: 18,
      movetimeMs: 1500,
      multiPv: 3,
      openingIndex: null,
      token: { cancelled: true },
    });
    expect(review).toBeNull();
  });
});

describe('LiveSession', () => {
  const line: EngineLine = { multipv: 1, depth: 20, scoreCp: 30, pv: ['e2e4'] };

  function liveClient() {
    const state = { analyzeCalls: 0, stopCalls: 0 };
    const fake = {
      analyze: async (
        _req: unknown,
        onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
      ) => {
        state.analyzeCalls++;
        await new Promise((r) => setTimeout(r, 5));
        onInfo?.([line], 20, 1000, 5000);
        return { best: 'e2e4', lines: [line], stopped: false };
      },
      stop: () => {
        state.stopCalls++;
      },
    };
    return { fake: fake as unknown as StockfishClient, state };
  }

  it('streams updates and returns the final lines', async () => {
    const { fake, state } = liveClient();
    const session = new LiveSession(fake);
    const updates: number[] = [];
    const lines = await session.start(new Chess().fen(), 3, (_l, depth) => updates.push(depth));
    expect(lines).toEqual([line]);
    expect(updates).toEqual([20]);
    expect(state.analyzeCalls).toBe(1);
  });

  it('returns [] for a terminal position without touching the engine', async () => {
    const { fake, state } = liveClient();
    const session = new LiveSession(fake);
    // Fool's-mate final position: black has just delivered checkmate.
    const mateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const lines = await session.start(mateFen, 3, () => {});
    expect(lines).toEqual([]);
    expect(state.analyzeCalls).toBe(0);
  });

  it('suppresses updates after stop() and forwards stop to the client', async () => {
    const { fake, state } = liveClient();
    const session = new LiveSession(fake);
    const updates: number[] = [];
    const pending = session.start(new Chess().fen(), 3, (_l, depth) => updates.push(depth));
    session.stop();
    const lines = await pending;
    expect(lines).toEqual([line]);
    expect(updates).toEqual([]);
    expect(state.stopCalls).toBe(1);
  });
});
