// Interaction-to-Next-Paint (INP) instrumentation (Round 2, Prompt 6).
//
// Development-only: a PerformanceObserver over `event` entries groups
// timings by interactionId and tracks the worst interaction's latency
// (the standard INP approximation: per interaction, the longest event
// duration, excluding the interaction's trailing presentation delay we
// cannot see without the full pipeline). Logged to the console in dev
// builds only — no third-party RUM, nothing is sent anywhere, and the
// observer is never installed in production.

export interface InpSample {
  interactionId: number;
  /** Longest event duration (ms) observed for this interaction. */
  duration: number;
  /** Number of event entries seen for this interaction. */
  entries: number;
}

/** Pure aggregation: fold one event entry into the sample map. */
export function foldEventEntry(
  samples: Map<number, InpSample>,
  entry: { interactionId?: number; duration: number },
): void {
  const id = entry.interactionId ?? 0;
  if (id === 0) return; // not part of a discrete interaction
  const prev = samples.get(id);
  if (!prev) {
    samples.set(id, { interactionId: id, duration: entry.duration, entries: 1 });
  } else {
    prev.duration = Math.max(prev.duration, entry.duration);
    prev.entries += 1;
  }
}

/** The current INP estimate: the worst interaction's duration. */
export function currentInp(samples: Map<number, InpSample>): number | null {
  let worst: number | null = null;
  for (const s of samples.values()) {
    if (worst === null || s.duration > worst) worst = s.duration;
  }
  return worst;
}

/** Install the dev observer. Returns an unsubscribe/disconnect. */
export function observeInp(log: (inpMs: number) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  const samples = new Map<number, InpSample>();
  let lastReported: number | null = null;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      foldEventEntry(samples, entry as unknown as { interactionId?: number; duration: number });
    }
    const inp = currentInp(samples);
    if (inp !== null && inp !== lastReported) {
      lastReported = inp;
      log(Math.round(inp));
    }
  });
  try {
    observer.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 40,
    } as PerformanceObserverInit);
  } catch {
    return () => {};
  }
  return () => observer.disconnect();
}
