// Parallel engine pool for single-thread / lite mode.
//
// In multi-thread mode the app uses exactly ONE multi-threaded
// StockfishClient (see analyzer.ts — no pool is created). In single/lite
// mode, one client is slow, so this pool runs up to
// `min(4, hardwareConcurrency - 1)` single-thread clients (Hash 32 MB each,
// see createPoolClientFactory in hooks/useEngine.ts), each searching a
// different position concurrently.
//
// Guarantees:
// - Results are DELIVERED to the caller in request (ply) order: completions
//   that finish out of order are buffered until their predecessors arrive.
// - `onOrderedResult` may itself submit follow-up work (critical-position
//   re-analysis) with priority; delivery waits for it, so ordering holds.
// - Cancellation stops ALL workers immediately: every client's `stop()` is
//   called, queued jobs resolve as cancelled, and no further results are
//   delivered. Workers are reused across runs, so repeated analyze/cancel
//   cycles create no new clients and leak no searches.

import type { BudgetProfile } from './budget';
import {
  analyzePositionWithBudget,
  type EngineClientLike,
  type PositionEvalResult,
  type PositionHistory,
} from './analyzePosition';

export type { EngineClientLike, PositionEvalResult };

/** Hash size (MB) for pool workers — deliberately small; there are several of them. */
export const POOL_HASH_MB = 32;

/** Pool size for a hardwareConcurrency value: min(4, hc − 1), at least 1. */
export function poolSizeForHardware(hardwareConcurrency: number): number {
  const hc =
    Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : 2;
  return Math.max(1, Math.min(4, hc - 1));
}

export interface PoolRequest {
  /** Caller-defined identity (the analyzer passes the ply index). */
  index: number;
  fen: string;
  multiPv: number;
  profile: BudgetProfile;
  /** Repetition context forwarded to the engine (Round 2). */
  history?: PositionHistory;
}

export interface PoolJobResult {
  index: number;
  result: PositionEvalResult | null;
  cancelled: boolean;
}

interface Job {
  request: PoolRequest;
  token?: { cancelled: boolean };
  resolve: (r: PoolJobResult) => void;
}

const CANCELLED_RESULT: PositionEvalResult = {
  lines: [],
  depth: 0,
  lateBestMoveChange: false,
  stoppedEarly: false,
  earlyBestMove: null,
  bestMoveFellOut: false,
};

export class EnginePool {
  private readonly size: number;
  private readonly createClient: () => Promise<EngineClientLike>;
  private clients: EngineClientLike[] = [];
  private queue: Job[] = [];
  private priorityQueue: Job[] = [];
  private waiters: Array<() => void> = [];
  private workersStarted = false;
  private closed = false;
  /** Tokens of in-flight runs, so cancelRun can stop every worker. */
  private activeTokens = new Set<{ cancelled: boolean }>();

  constructor(opts: { size: number; createClient: () => Promise<EngineClientLike> }) {
    this.size = Math.max(1, Math.floor(opts.size) || 1);
    this.createClient = opts.createClient;
  }

  /** Number of engine clients created so far (≤ size). */
  get clientCount(): number {
    return this.clients.length;
  }

  private signal(): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((fn) => fn());
  }

  private async waitForJob(): Promise<void> {
    if (this.closed || this.queue.length > 0 || this.priorityQueue.length > 0) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private ensureWorkers(): void {
    if (this.workersStarted) return;
    this.workersStarted = true;
    for (let i = 0; i < this.size; i++) {
      void this.workerLoop();
    }
  }

  private async workerLoop(): Promise<void> {
    let client: EngineClientLike | null = null;
    while (!this.closed) {
      const job = this.priorityQueue.shift() ?? this.queue.shift();
      if (!job) {
        await this.waitForJob();
        continue;
      }
      if (job.token?.cancelled || this.closed) {
        job.resolve({ index: job.request.index, result: null, cancelled: true });
        continue;
      }
      try {
        if (!client) {
          client = await this.createClient();
          this.clients.push(client);
        }
        if (job.token?.cancelled) {
          job.resolve({ index: job.request.index, result: null, cancelled: true });
          continue;
        }
        const result = await analyzePositionWithBudget(
          client,
          job.request.fen,
          job.request.profile,
          job.request.multiPv,
          job.token,
          job.request.history,
        );
        if (job.token?.cancelled) {
          job.resolve({ index: job.request.index, result: null, cancelled: true });
        } else {
          job.resolve({ index: job.request.index, result, cancelled: false });
        }
      } catch {
        job.resolve({
          index: job.request.index,
          result: job.token?.cancelled ? null : CANCELLED_RESULT,
          cancelled: !!job.token?.cancelled,
        });
      }
    }
  }

  /** Submit one position search. `priority` jobs jump the queue (critical re-analysis). */
  submit(
    request: PoolRequest,
    opts?: { priority?: boolean; token?: { cancelled: boolean } },
  ): Promise<PoolJobResult> {
    if (this.closed) {
      return Promise.resolve({ index: request.index, result: null, cancelled: true });
    }
    this.ensureWorkers();
    return new Promise<PoolJobResult>((resolve) => {
      const job: Job = { request, token: opts?.token, resolve };
      if (opts?.priority) this.priorityQueue.push(job);
      else this.queue.push(job);
      this.signal();
    });
  }

  /**
   * Analyze all requests concurrently, invoking `onOrderedResult` strictly
   * in request order. The callback may await `submit(..., {priority:true})`
   * for follow-up work — delivery of later results waits for it.
   */
  async analyzeAll(
    requests: PoolRequest[],
    token: { cancelled: boolean },
    onOrderedResult: (index: number, result: PositionEvalResult) => Promise<void>,
  ): Promise<void> {
    if (requests.length === 0) return;
    this.activeTokens.add(token);
    try {
      const results = new Array<PositionEvalResult | null>(requests.length).fill(null);
      const settled = new Array<boolean>(requests.length).fill(false);
      let nextDeliver = 0;
      let deliveryChain: Promise<void> = Promise.resolve();

      const flush = (): Promise<void> => {
        deliveryChain = deliveryChain.then(async () => {
          while (nextDeliver < requests.length && settled[nextDeliver] && !token.cancelled) {
            const result = results[nextDeliver];
            const index = requests[nextDeliver].index;
            nextDeliver++;
            if (result) await onOrderedResult(index, result);
          }
        });
        return deliveryChain;
      };

      const jobs = requests.map((request, i) =>
        this.submit(request, { token }).then(async (jobResult) => {
          settled[i] = true;
          results[i] = jobResult.cancelled ? null : jobResult.result;
          await flush();
        }),
      );
      await Promise.all(jobs);
      await deliveryChain;
    } finally {
      this.activeTokens.delete(token);
    }
  }

  /**
   * Cancel a run: stop every worker's current search immediately and drop
   * its queued jobs (they resolve as cancelled). Workers stay alive and
   * idle, ready for the next run — no leaks across cycles.
   */
  cancelRun(token: { cancelled: boolean }): void {
    token.cancelled = true;
    for (const client of this.clients) {
      try {
        client.stop();
      } catch {
        // a misbehaving client must not break cancellation of the others
      }
    }
    const flushQueue = (jobs: Job[]): Job[] =>
      jobs.filter((job) => {
        if (job.token === token) {
          job.resolve({ index: job.request.index, result: null, cancelled: true });
          return false;
        }
        return true;
      });
    this.queue = flushQueue(this.queue);
    this.priorityQueue = flushQueue(this.priorityQueue);
    this.signal();
  }

  /** Stop and terminate every worker; the pool cannot be used afterwards. */
  terminate(): void {
    this.closed = true;
    for (const token of this.activeTokens) token.cancelled = true;
    this.activeTokens.clear();
    const pending = [...this.priorityQueue, ...this.queue];
    this.priorityQueue = [];
    this.queue = [];
    pending.forEach((job) =>
      job.resolve({ index: job.request.index, result: null, cancelled: true }),
    );
    for (const client of this.clients) {
      try {
        client.stop();
      } catch {
        // ignore
      }
      try {
        client.terminate?.();
      } catch {
        // ignore
      }
    }
    this.clients = [];
    this.signal();
  }
}
