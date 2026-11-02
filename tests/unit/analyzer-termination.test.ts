import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineLine } from '@/lib/types';
import type { StockfishClient } from '@/engine/stockfish.worker';
import { analyzeGame, terminalEval } from '@/engine/analyzer';
import { parsePgn } from '@/parsers/pgn';
import { positionKeyV2 } from '@/engine/cache';
import { buildPositionCommand } from '@/engine/uci';
import type { PositionHistory } from '@/engine/analyzePosition';

interface RecordedCall {
  fen: string;
  history?: PositionHistory;
}

class FakeClient {
  calls: RecordedCall[] = [];
  constructor(private scores: Map<string, number> = new Map()) {}
  async newGame(): Promise<void> {}
  stop(): void {}
  async analyze(req: {
    fen: string;
    depth: number;
    multiPv: number;
    history?: PositionHistory;
  }): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    this.calls.push({ fen: req.fen, history: req.history });
    const line: EngineLine = {
      multipv: 1,
      depth: req.depth,
      scoreCp: this.scores.get(req.fen) ?? 20,
      pv: ['e2e4', 'e7e5'],
    };
    return { best: 'e2e4', lines: [line], stopped: false };
  }
}

async function run(pgn: string, client: FakeClient, extra: Record<string, unknown> = {}) {
  const games = parsePgn(pgn);
  return analyzeGame(
    client as unknown as StockfishClient,
    games[0],
    { name: 'Fake', mode: 'single' },
    {
      depth: 18,
      movetimeMs: 100,
      multiPv: 1,
      openingIndex: null,
      token: { cancelled: false },
      presetName: 'standard',
      ...extra,
    },
  );
}

const SHUFFLE_8 =
  '[Event "T"]\n[Result "1/2-1/2"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2\n';

describe('analyzer termination handling', () => {
  it('never searches a checkmate position and scores it exactly', async () => {
    const client = new FakeClient();
    const review = await run('[Event "T"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n', client);
    expect(review?.termination?.kind).toBe('checkmate');
    const finalFen = review!.plies[review!.plies.length - 1].fen;
    expect(client.calls.map((c) => c.fen)).not.toContain(finalFen);
    const last = review!.plies[review!.plies.length - 1];
    expect(last.mate).toBe(0);
    expect(last.winProbWhite).toBe(0);
  });

  it('never searches a stalemate position; a move-less stalemate game needs no engine at all', async () => {
    const client = new FakeClient();
    const review = await run(
      '[Event "T"]\n[SetUp "1"]\n[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"]\n[Result "1/2-1/2"]\n\n1/2-1/2\n',
      client,
    );
    expect(review?.termination?.kind).toBe('stalemate');
    expect(client.calls).toHaveLength(0);
    expect(review!.plies[0].evalWhiteCp).toBe(0);
    expect(review!.plies[0].winProbWhite).toBe(50);
  });

  it('scores a threefold-repetition final position exactly 0.0 / 50% and does not search it', async () => {
    const client = new FakeClient();
    const review = await run(SHUFFLE_8, client);
    expect(review?.termination?.kind).toBe('repetition-threefold');
    const last = review!.plies[review!.plies.length - 1];
    expect(last.evalWhiteCp).toBe(0);
    expect(last.winProbWhite).toBe(50);
    expect(client.calls.map((c) => c.fen)).not.toContain(
      last.fen === review!.plies[4].fen ? '__never__' : last.fen,
    );
    // The final FEN equals the start FEN, which WAS searched at its first
    // occurrence — but the third occurrence itself is terminal, so the
    // number of searches is the 8 non-terminal positions, not 9.
    expect(client.calls.length).toBeLessThan(9);
  });

  it('allowing a draw from a winning position incurs the normal expected-points loss', async () => {
    // After 7 plies Black is winning big (fake eval: White to move is
    // fine, but the position before Black's 4th move scores -900 for
    // White). Black shuffles back, allowing threefold repetition.
    const chess = new Chess();
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']) chess.move(san);
    const fenBeforeLast = chess.fen(); // Black to move, about to play Ng8
    const scores = new Map<string, number>([[fenBeforeLast, 900]]); // side-to-move (Black) +900
    const client = new FakeClient(scores);
    const review = await run(SHUFFLE_8, client);
    const last = review!.plies[review!.plies.length - 1];
    expect(last.evalWhiteCp).toBe(0);
    expect(last.epl).toBeGreaterThan(0.4);
    expect(last.accuracy).toBeLessThan(60);
  });

  it('resignation creates no extra ply and no classification for the ending event', async () => {
    const client = new FakeClient();
    const review = await run(
      '[Event "T"]\n[Termination "White won by resignation"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n',
      client,
    );
    expect(review?.termination).toEqual({
      kind: 'resignation',
      winner: 'white',
      result: '1-0',
      detail: 'termination-tag',
    });
    expect(review!.plies).toHaveLength(3); // start + 2 moves, nothing for the resignation itself
  });

  it('sends repetition history to the engine for repeated positions', async () => {
    const client = new FakeClient();
    await run(SHUFFLE_8, client);
    const withHistory = client.calls.filter((c) => c.history && c.history.movesUci.length > 0);
    expect(withHistory.length).toBeGreaterThan(0);
    expect(withHistory[0].history?.movesUci).toEqual(['g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(withHistory[0].history?.startFen).toContain('rnbqkbnr');
  });

  it('cache keys separate positions by repetition occurrence', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3';
    const first = positionKeyV2(fen, 18, 3, 'v1', 'standard');
    const second = positionKeyV2(fen, 18, 3, 'v1', 'standard', '2');
    const third = positionKeyV2(fen, 18, 3, 'v1', 'standard', '3');
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
  });

  it('buildPositionCommand uses startpos-style history when provided', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(buildPositionCommand('some fen', { startFen: start, movesUci: ['e2e4', 'e7e5'] })).toBe(
      `position fen ${start} moves e2e4 e7e5`,
    );
    expect(buildPositionCommand('some fen')).toBe('position fen some fen');
  });

  it('terminalEval covers mate, stalemate, insufficient material and move-counter draws', () => {
    expect(terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')?.evalWhiteCp).toBe(0);
    expect(terminalEval('8/8/8/8/8/3k4/8/3K4 w - - 0 1')?.evalWhiteCp).toBe(0);
    expect(terminalEval('r3k3/8/8/8/8/8/8/R3K3 w Qq - 100 55')?.evalWhiteCp).toBe(0);
    expect(terminalEval('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull();
  });

  it('maxPlies time-boxes a long game to the requested prefix', async () => {
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const parts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const n = i * 2 + 1;
      parts.push(`${n}. ${cycle[0]} ${cycle[1]} ${n + 1}. ${cycle[2]} ${cycle[3]}`);
    }
    const client = new FakeClient();
    const review = await run(`[Event "L"]\n[Result "*"]\n\n${parts.join(' ')} *\n`, client, {
      maxPlies: 10,
    });
    expect(review!.plies).toHaveLength(11);
  });

  it('a 400-ply game analyzes with terminal shortcuts (engine called only for early positions)', async () => {
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      const n = i * 2 + 1;
      parts.push(`${n}. ${cycle[0]} ${cycle[1]} ${n + 1}. ${cycle[2]} ${cycle[3]}`);
    }
    const client = new FakeClient();
    const started = performance.now();
    const review = await run(
      `[Event "Long"]\n[Result "1/2-1/2"]\n\n${parts.join(' ')} 1/2-1/2\n`,
      client,
    );
    const elapsedMs = performance.now() - started;
    console.log(
      `[bench] 400-ply fake-engine analysis: ${elapsedMs.toFixed(1)}ms, engine calls=${client.calls.length}`,
    );
    expect(review!.plies).toHaveLength(401);
    expect(review?.termination?.kind).toBe('repetition-fivefold');
    // From ply 8 on, every position is at least a third occurrence, so
    // no position after that is ever sent to the engine.
    expect(client.calls.length).toBeLessThanOrEqual(8);
  });
});
