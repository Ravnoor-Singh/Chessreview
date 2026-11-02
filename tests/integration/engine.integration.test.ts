// Integration: the app's own analysis pipeline (analyzePositionWithBudget +
// the budget tracker + the UCI parser) driving the REAL Stockfish 19
// single-thread engine from the `stockfish` npm package — no fakes, no
// browser. This is the Node-level counterpart of the browser e2e pool test:
// it proves the code that classifies moves can actually steer a real engine
// to a correct result.
//
// Run via `npm run test:integration` (not part of the default unit run).

import { createRequire } from 'node:module';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { analyzePositionWithBudget, type EngineClientLike } from '@/engine/analyzePosition';
import { budgetProfileFor, fullBudgetProfile } from '@/engine/budget';
import { parseInfoLine } from '@/engine/uci';
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
    req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    return new Promise((resolve) => {
      this.search = { lines: new Map(), resolve, onInfo, stopped: false };
      this.send(`setoption name MultiPV value ${req.multiPv}`);
      this.send('setoption name Hash value 64');
      this.send(`position fen ${req.fen}`);
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

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Position before Qxf7# in Scholar's mate: White to move mates in one.
const SCHOLARS_MATE = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

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
});
