// Per-client-IP token-bucket rate limiting for the import API routes.
// Two implementations behind one async interface (Round 2, Prompt 9):
//  - TokenBucketRateLimiter: in-memory, PER-INSTANCE on serverless. The
//    fallback when no KV store is configured.
//  - KvTokenBucketRateLimiter: shared across instances via the Upstash /
//    Vercel KV REST protocol, with the bucket math executed atomically
//    in a Lua script on the store. Selected automatically when the KV
//    env vars are present (same vars as the cache adapter). Fails OPEN
//    (allows, with a logged warning) when the store is unreachable — a
//    KV outage must never take the import routes down.
// Both are injectable (clock + config) so tests can advance time
// deterministically.

import { kvConfigFromEnv } from './cache';

export interface RateLimiterOptions {
  /** Bucket capacity = burst size. Default 10. */
  capacity?: number;
  /** Tokens refilled per second. Default 0.5 → 30 requests/min sustained. */
  refillPerSecond?: number;
  /** Injectable clock (milliseconds). Default Date.now. */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until at least one token is available (0 when allowed). */
  retryAfterSeconds: number;
  /** Tokens remaining after this call. */
  remaining: number;
}

/** The shared limiter contract used by the routes. */
export interface RateLimiter {
  tryConsume(key: string): Promise<RateLimitResult>;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.capacity = options.capacity ?? 10;
    this.refillPerSecond = options.refillPerSecond ?? 0.5;
    this.now = options.now ?? Date.now;
  }

  /** Number of tracked client keys (test/diagnostic aid). */
  get size(): number {
    return this.buckets.size;
  }

  /** Forget all buckets (tests). */
  reset(): void {
    this.buckets.clear();
  }

  async tryConsume(key: string): Promise<RateLimitResult> {
    const nowMs = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, updatedAt: nowMs };
      this.buckets.set(key, bucket);
    }
    const elapsedSeconds = Math.max(0, (nowMs - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.updatedAt = nowMs;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(bucket.tokens) };
    }
    const deficit = 1 - bucket.tokens;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / this.refillPerSecond)),
      remaining: 0,
    };
  }
}

/**
 * Lua token bucket, executed atomically by the KV store (EVAL). Mirrors
 * TokenBucketRateLimiter's math exactly; the bucket hash carries an
 * EXPIRE so idle clients disappear (key TTL = time to refill from empty
 * plus a margin, recomputed on every call).
 */
const KV_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(data[1]) or capacity
local updatedAt = tonumber(data[2]) or nowMs
local elapsed = math.max(0, (nowMs - updatedAt) / 1000)
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
local retryAfter = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfter = math.max(1, math.ceil((1 - tokens) / refill))
end
redis.call('HSET', key, 'tokens', tokens, 'updatedAt', nowMs)
redis.call('EXPIRE', key, ttl)
return {allowed, retryAfter, math.floor(tokens)}
`;

export interface KvRateLimiterOptions extends RateLimiterOptions {
  url: string;
  token: string;
  /** Injectable fetch (tests). Default: global fetch. */
  fetchFn?: typeof fetch;
  /** Per-command timeout ms. Default 1500 — limiting must never hang a route. */
  timeoutMs?: number;
  /** Key namespace in the store. Default 'ratelimit:import'. */
  keyPrefix?: string;
}

export class KvTokenBucketRateLimiter implements RateLimiter {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private readonly keyPrefix: string;

  constructor(options: KvRateLimiterOptions) {
    this.url = options.url.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.capacity = options.capacity ?? 10;
    this.refillPerSecond = options.refillPerSecond ?? 0.5;
    this.now = options.now ?? Date.now;
    this.keyPrefix = options.keyPrefix ?? 'ratelimit:import';
  }

  async tryConsume(key: string): Promise<RateLimitResult> {
    const ttlSeconds = Math.ceil(this.capacity / this.refillPerSecond) + 60;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'EVAL',
          KV_BUCKET_LUA,
          '1',
          `${this.keyPrefix}:${key}`,
          String(this.capacity),
          String(this.refillPerSecond),
          String(this.now()),
          String(ttlSeconds),
        ]),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: string };
      if (body.error) throw new Error(`KV error: ${body.error}`);
      const [allowed, retryAfterSeconds, remaining] = body.result as [number, number, number];
      return {
        allowed: allowed === 1,
        retryAfterSeconds,
        remaining,
      };
    } catch (err) {
      // Fail OPEN: a KV outage must not take the import routes down.
      console.warn(
        `[rate-limit] KV store unavailable, allowing request: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { allowed: true, retryAfterSeconds: 0, remaining: this.capacity };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The shared in-memory limiter (fallback + tests). Burst 10, 30/min. */
export const importRateLimiter = new TokenBucketRateLimiter();

let sharedLimiter: RateLimiter | undefined;

/**
 * The process-wide import limiter: the KV-backed shared limiter when the
 * KV env vars are present (KV_REST_API_URL/KV_REST_API_TOKEN or the
 * UPSTASH_REDIS_REST_* pair — the same selection as the cache adapter),
 * otherwise the in-memory per-instance limiter.
 */
export function getImportRateLimiter(): RateLimiter {
  if (!sharedLimiter) {
    const kv = kvConfigFromEnv(process.env);
    sharedLimiter = kv ? new KvTokenBucketRateLimiter(kv) : importRateLimiter;
  }
  return sharedLimiter;
}

/** Replace/reset the shared limiter (tests). */
export function setImportRateLimiterForTests(limiter: RateLimiter | undefined): void {
  sharedLimiter = limiter;
}

/**
 * Client IP for rate limiting: first entry of x-forwarded-for, then
 * x-real-ip, then a stable 'unknown' fallback (all such clients share one
 * bucket — fail-closed rather than unlimited).
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  return 'unknown';
}
