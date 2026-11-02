// Progress throttling + ETA helpers for long-running analysis.
//
// The analyzer can produce a progress update per position; forwarding every
// one to React/Zustand would re-render far more often than the eye needs.
// `createProgressThrottler` caps emissions at one per `minIntervalMs`
// (default 100 ms → at most 10/second), always delivers the latest pending
// value via a trailing timer, and can force-deliver (used for the first and
// final updates). Clock and scheduler are injectable for deterministic tests.

export interface ProgressThrottler<T> {
  /** Offer a value; it is delivered now, or as the trailing value shortly. */
  emit: (value: T) => void;
  /** Deliver the latest pending value immediately, if any. */
  flush: () => void;
  /** Drop any pending value and stop the trailing timer. */
  dispose: () => void;
}

export interface ThrottlerDeps {
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

export function createProgressThrottler<T>(
  deliver: (value: T) => void,
  minIntervalMs = 100,
  deps: ThrottlerDeps = {},
): ProgressThrottler<T> {
  const now = deps.now ?? (() => Date.now());
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h));
  let lastDeliveredAt = Number.NEGATIVE_INFINITY;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const fire = (): void => {
    timer = null;
    if (disposed || !pending) return;
    const { value } = pending;
    pending = null;
    lastDeliveredAt = now();
    deliver(value);
  };

  return {
    emit(value: T): void {
      if (disposed) return;
      pending = { value };
      const elapsed = now() - lastDeliveredAt;
      if (elapsed >= minIntervalMs) {
        if (timer !== null) {
          clearTimeoutFn(timer);
          timer = null;
        }
        fire();
      } else if (timer === null) {
        timer = setTimeoutFn(fire, minIntervalMs - elapsed);
      }
    },
    flush(): void {
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      fire();
    },
    dispose(): void {
      disposed = true;
      pending = null;
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
    },
  };
}

/**
 * Estimated remaining time from the observed completion rate:
 * elapsed × (remaining / done). Null when nothing is done yet or the work
 * is complete.
 */
export function estimateRemainingMs(elapsedMs: number, done: number, total: number): number | null {
  if (done <= 0 || total <= 0 || done >= total) return null;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return (elapsedMs / done) * (total - done);
}

/** Format a duration for the analyzing UI: "8s", "1m 05s", "12m 30s". */
export function formatEta(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
