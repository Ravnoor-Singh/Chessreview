import { describe, expect, it } from 'vitest';
import type { EngineLine } from '@/lib/types';
import { EnginePool, poolSizeForHardware, type EngineClientLike } from '@/engine/pool';
import { budgetProfileFor, type BudgetProfile } from '@/engine/budget';

const PROFILE: BudgetProfile = budgetProfileFor('standard');

/**
 * Fake engine client implementing the same interface as StockfishClient.
 * Each FEN gets a configurable artificial delay so tests can force
 * out-of-order completion; `stop()` resolves the in-flight search as
 * stopped, mirroring the real client's UCI behavior.
 */
class FakeEngine implements EngineClientLike {
  activeSearches = 0;
  stopCalls = 0;
  terminated = false;
  searchesStarted = 0;
  private pending: {
    resolve: (r: { best: string; lines: EngineLine[]; stopped: boolean }) => void;
    fen: string;
  } | null = null;

  constructor(private delays: Map<string, number>) {}

  analyze(
    req: { fen: string; depth: number; movetimeMs?: number; multiPv: number },
    onInfo?: (lines: EngineLine[], depth: number, nodes: number, nps: number) => void,
  ): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    this.activeSearches++;
    this.searchesStarted++;
    const delay = this.delays.get(req.fen) ?? 5;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.activeSearches--;
        const line: EngineLine = {
          multipv: 1,
          depth: req.depth,
          scoreCp: 25,
          pv: ['e2e4'],
        };
        onInfo?.([line], req.depth, 1000, 5000);
        resolve({ best: 'e2e4', lines: [line], stopped: false });
      }, delay);
      this.pending = {
        fen: req.fen,
        resolve: (r) => {
          clearTimeout(timer);
          this.pending = null;
          this.activeSearches--;
          resolve(r);
        },
      };
    });
  }

  stop(): void {
    this.stopCalls++;
    if (this.pending) {
      this.pending.resolve({ best: '', lines: [], stopped: true });
    }
  }

  async newGame(): Promise<void> {}

  terminate(): void {
    this.terminated = true;
    this.stop();
  }
}

function makePool(delays: Map<string, number>, size: number) {
  const created: FakeEngine[] = [];
  const pool = new EnginePool({
    size,
    createClient: async () => {
      const engine = new FakeEngine(delays);
      created.push(engine);
      return engine;
    },
  });
  return { pool, created };
}

function requests(fens: string[]) {
  return fens.map((fen, index) => ({ index, fen, multiPv: 3, profile: PROFILE }));
}

describe('poolSizeForHardware', () => {
  it('is min(4, hardwareConcurrency − 1), at least 1', () => {
    expect(poolSizeForHardware(4)).toBe(3);
    expect(poolSizeForHardware(8)).toBe(4);
    expect(poolSizeForHardware(16)).toBe(4);
    expect(poolSizeForHardware(2)).toBe(1);
    expect(poolSizeForHardware(1)).toBe(1);
  });
});

describe('EnginePool ordering', () => {
  it('delivers results in request order even when searches finish out of order', async () => {
    const fens = ['fen-a', 'fen-b', 'fen-c', 'fen-d'];
    // Later positions finish FIRST if unbuffered.
    const delays = new Map([
      ['fen-a', 60],
      ['fen-b', 40],
      ['fen-c', 20],
      ['fen-d', 5],
    ]);
    const { pool, created } = makePool(delays, 4);
    const delivered: number[] = [];
    await pool.analyzeAll(requests(fens), { cancelled: false }, async (index) => {
      delivered.push(index);
    });
    expect(delivered).toEqual([0, 1, 2, 3]);
    expect(created.length).toBe(4); // one client per worker, all used concurrently
    pool.terminate();
  });

  it('reuses the same clients across runs (no new clients on a second run)', async () => {
    const { pool, created } = makePool(new Map(), 2);
    const token = { cancelled: false };
    await pool.analyzeAll(requests(['x1', 'x2', 'x3']), token, async () => {});
    const afterFirst = created.length;
    await pool.analyzeAll(requests(['y1', 'y2']), token, async () => {});
    expect(created.length).toBe(afterFirst);
    expect(pool.clientCount).toBe(afterFirst);
    pool.terminate();
  });
});

describe('EnginePool cancellation', () => {
  it('stops ALL workers immediately and leaves no live searches', async () => {
    const fens = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const delays = new Map(fens.map((f) => [f, 5000])); // searches that would hang
    const { pool, created } = makePool(delays, 3);
    const token = { cancelled: false };
    const delivered: number[] = [];
    const run = pool.analyzeAll(requests(fens), token, async (index) => {
      delivered.push(index);
    });
    // Let the workers pick up their first searches, then cancel.
    await new Promise((r) => setTimeout(r, 30));
    pool.cancelRun(token);
    await run;
    expect(delivered).toEqual([]);
    expect(created.length).toBeGreaterThan(0);
    for (const engine of created) {
      expect(engine.stopCalls).toBeGreaterThan(0);
      expect(engine.activeSearches).toBe(0);
    }
    pool.terminate();
  });

  it('repeated analyze/cancel cycles leak nothing and the pool still works', async () => {
    const delays = new Map<string, number>([
      ['hang1', 5000],
      ['hang2', 5000],
      ['fast1', 5],
      ['fast2', 5],
    ]);
    const { pool, created } = makePool(delays, 2);
    for (let cycle = 0; cycle < 3; cycle++) {
      const token = { cancelled: false };
      const run = pool.analyzeAll(requests(['hang1', 'hang2']), token, async () => {});
      await new Promise((r) => setTimeout(r, 15));
      pool.cancelRun(token);
      await run;
    }
    expect(created.length).toBe(2); // still just the two workers
    for (const engine of created) expect(engine.activeSearches).toBe(0);

    // A normal run afterwards completes and delivers in order.
    const delivered: number[] = [];
    await pool.analyzeAll(requests(['fast1', 'fast2']), { cancelled: false }, async (i) => {
      delivered.push(i);
    });
    expect(delivered).toEqual([0, 1]);
    pool.terminate();
    for (const engine of created) expect(engine.terminated).toBe(true);
  });

  it('priority submissions (critical re-analysis) work from inside ordered delivery', async () => {
    const delays = new Map<string, number>([
      ['p0', 10],
      ['p1', 10],
      ['deep0', 5],
    ]);
    const { pool } = makePool(delays, 2);
    const token = { cancelled: false };
    const delivered: number[] = [];
    await pool.analyzeAll(requests(['p0', 'p1']), token, async (index) => {
      delivered.push(index);
      if (index === 0) {
        const deep = await pool.submit(
          { index: 99, fen: 'deep0', multiPv: 3, profile: PROFILE },
          { priority: true, token },
        );
        expect(deep.cancelled).toBe(false);
        expect(deep.result?.lines.length).toBe(1);
      }
    });
    expect(delivered).toEqual([0, 1]);
    pool.terminate();
  });
});
