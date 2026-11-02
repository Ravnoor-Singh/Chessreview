// Pluggable server-side cache for the import API routes (Prompt 11).
//
// The PRIMARY cache signal to clients/CDNs is the Cache-Control response
// header (s-maxage + stale-while-revalidate, set by the routes). This
// module is the server-side store behind it:
//
//   interface: get<T>(key) / set(key, value, ttlSeconds)
//   adapters:  InMemoryCacheAdapter (default; per-process, per-instance —
//              on serverless each warm instance has its own copy)
//              KvCacheAdapter (Upstash Redis / Vercel KV REST protocol via
//              plain fetch, NO SDK dependency; constructed ONLY when the
//              KV env vars are present — see getServerCache()).
//
// Values are stored JSON-serialized in both adapters so behaviour matches.

export interface ServerCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

interface MemoryEntry {
  expiresAt: number;
  value: string;
}

export class InMemoryCacheAdapter implements ServerCache {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: { now?: () => number; maxEntries?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 500;
  }

  get size(): number {
    return this.store.size;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() >= hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    try {
      return JSON.parse(hit.value) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Crude bound: drop the oldest inserted entry (Map iteration order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      expiresAt: this.now() + ttlSeconds * 1000,
      value: JSON.stringify(value),
    });
  }
}

export interface KvAdapterOptions {
  url: string;
  token: string;
  /** Injectable fetch (tests). Default: global fetch. */
  fetchFn?: typeof fetch;
  /** Per-command timeout ms. Default 1500 — cache must never hang a route. */
  timeoutMs?: number;
}

/**
 * Upstash/Vercel-KV REST adapter: POST {url}/ with an
 * Authorization: Bearer <token> header and a JSON command array body
 * (["GET", key] / ["SET", key, value, "EX", ttl]) — the standard
 * Upstash REST protocol also spoken by Vercel KV.
 */
export class KvCacheAdapter implements ServerCache {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: KvAdapterOptions) {
    this.url = options.url.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 1500;
  }

  private async command(args: (string | number)[]): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: string };
      if (body.error) throw new Error(`KV error: ${body.error}`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.command(['GET', key]);
      if (typeof result !== 'string') return undefined;
      return JSON.parse(result) as T;
    } catch {
      // Cache is an optimization: any KV failure degrades to a miss.
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.command([
        'SET',
        key,
        JSON.stringify(value),
        'EX',
        Math.max(1, Math.floor(ttlSeconds)),
      ]);
    } catch {
      // Best-effort: a failed cache write must never fail the request.
    }
  }
}

/** Env names that select the KV adapter (Upstash or Vercel KV naming). */
export function kvConfigFromEnv(
  env: Record<string, string | undefined>,
): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

let shared: ServerCache | undefined;

/**
 * The process-wide cache. KV adapter is constructed ONLY when its env
 * vars are present; otherwise the in-memory default is used.
 */
export function getServerCache(): ServerCache {
  if (!shared) {
    const kv = kvConfigFromEnv(process.env);
    shared = kv ? new KvCacheAdapter(kv) : new InMemoryCacheAdapter();
  }
  return shared;
}

/** Replace/reset the shared cache (tests). */
export function setServerCacheForTests(cache: ServerCache | undefined): void {
  shared = cache;
}
