// Hardened upstream fetching for the import API routes (Prompt 11).
//
// Guarantees, enforced here so no route can bypass them:
// - HOST ALLOWLIST: the final URL's host must be api.chess.com,
//   www.chess.com or lichess.org — checked before the first fetch AND on
//   every redirect hop (redirects are followed manually, max 3).
// - TIMEOUT: 8 s per attempt via AbortController.
// - RETRY: exactly one retry with jittered 300–700 ms backoff, ONLY on
//   network errors and 5xx responses (never on 4xx, timeouts, oversize
//   bodies or blocked redirects).
// - SIZE CAP: enforced via content-length when present AND by counting
//   streamed bytes when it is not (a lying/absent length cannot smuggle
//   an oversized body past the cap).
//
// The fetch implementation is injectable (UpstreamOptions.fetchFn) and the
// module-level setter lets route tests swap in an MSW-intercepted or fake
// fetch without touching route code.

export const ALLOWED_UPSTREAM_HOSTS: ReadonlySet<string> = new Set([
  'api.chess.com',
  'www.chess.com',
  'lichess.org',
]);

export const UPSTREAM_TIMEOUT_MS = 8000;
export const UPSTREAM_MAX_REDIRECTS = 3;

export type UpstreamErrorKind =
  'blocked_host' | 'timeout' | 'network' | 'too_large' | 'invalid_json' | 'http';

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  /** HTTP status when kind === 'http'. */
  readonly status?: number;

  constructor(kind: UpstreamErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = status;
  }
}

export interface UpstreamOptions {
  headers?: Record<string, string>;
  /** Per-attempt timeout ms (default UPSTREAM_TIMEOUT_MS). */
  timeoutMs?: number;
  /** Hard response-body cap in bytes (required). */
  maxBytes: number;
  /** Retries after the first attempt (default 1). */
  retries?: number;
  /** Injectable fetch (tests / MSW pass-through). Default: global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable sleep for backoff (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source in [0,1) (tests). */
  random?: () => number;
}

export interface UpstreamResult {
  status: number;
  text: string;
  headers: Headers;
}

let defaultFetchFn: typeof fetch | undefined;

/** Swap the default fetch used by fetchUpstream (route tests). */
export function setUpstreamFetchForTests(fn: typeof fetch | undefined): void {
  defaultFetchFn = fn;
}

function assertAllowedHost(url: URL): void {
  if (url.protocol !== 'https:' || !ALLOWED_UPSTREAM_HOSTS.has(url.host)) {
    throw new UpstreamError(
      'blocked_host',
      `upstream host not allowed: ${url.protocol}//${url.host}`,
    );
  }
}

function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === 'AbortError' || e.name === 'TimeoutError' || /aborted/i.test(e.message))
  );
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UpstreamError('too_large', `upstream body ${declared} bytes exceeds cap ${maxBytes}`);
  }
  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new UpstreamError('too_large', `upstream body exceeds cap ${maxBytes}`);
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // best effort
        }
        throw new UpstreamError('too_large', `upstream body exceeds cap ${maxBytes}`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function attemptOnce(
  url: URL,
  options: Required<Pick<UpstreamOptions, 'timeoutMs' | 'maxBytes'>> & UpstreamOptions,
  fetchFn: typeof fetch,
): Promise<UpstreamResult> {
  let current = url;
  for (let hop = 0; hop <= UPSTREAM_MAX_REDIRECTS; hop += 1) {
    assertAllowedHost(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(current.toString(), {
        headers: options.headers,
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new UpstreamError('timeout', `upstream timed out after ${options.timeoutMs} ms`);
      }
      throw new UpstreamError('network', e instanceof Error ? e.message : 'network error');
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return { status: res.status, text: '', headers: res.headers };
      }
      if (hop === UPSTREAM_MAX_REDIRECTS) {
        throw new UpstreamError('blocked_host', 'too many upstream redirects');
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new UpstreamError('blocked_host', `unparseable redirect target: ${location}`);
      }
      assertAllowedHost(next);
      current = next;
      continue;
    }
    const text = await readCapped(res, options.maxBytes);
    return { status: res.status, text, headers: res.headers };
  }
  // Unreachable (the loop returns or throws), but keeps TS honest.
  throw new UpstreamError('blocked_host', 'too many upstream redirects');
}

/**
 * Fetch an allowlisted upstream URL with timeout / retry / size cap.
 * 4xx and 2xx/3xx-terminal results are RETURNED (the route maps statuses
 * to the taxonomy); failures throw UpstreamError.
 */
export async function fetchUpstream(
  rawUrl: string,
  options: UpstreamOptions,
): Promise<UpstreamResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UpstreamError('blocked_host', `unparseable upstream URL: ${rawUrl}`);
  }
  assertAllowedHost(url);
  const fetchFn = options.fetchFn ?? defaultFetchFn ?? fetch;
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const full = { timeoutMs: UPSTREAM_TIMEOUT_MS, ...options };

  let lastError: UpstreamError | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      // Jittered backoff: 300–700 ms.
      await sleep(300 + Math.floor(random() * 400));
    }
    try {
      const result = await attemptOnce(url, full, fetchFn);
      if (result.status >= 500 && attempt < retries) {
        lastError = new UpstreamError('http', `upstream HTTP ${result.status}`, result.status);
        continue;
      }
      return result;
    } catch (e) {
      const err =
        e instanceof UpstreamError
          ? e
          : new UpstreamError('network', e instanceof Error ? e.message : 'network error');
      // Retry ONLY network errors (5xx is handled above). Timeouts,
      // oversize bodies and blocked hosts are never retried.
      if (err.kind === 'network' && attempt < retries) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  // Retries exhausted on 5xx: return the failure as an http UpstreamError
  // so the route maps it to UPSTREAM_ERROR.
  throw lastError ?? new UpstreamError('network', 'upstream request failed');
}

/** Parse a fetched body as JSON; non-JSON → UpstreamError('invalid_json'),
 * which the routes map to UPSTREAM_ERROR (a clean taxonomy error, never a
 * raw parse exception). */
export function parseUpstreamJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UpstreamError('invalid_json', 'upstream returned non-JSON');
  }
}
