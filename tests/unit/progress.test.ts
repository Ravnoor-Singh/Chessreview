import { describe, expect, it, vi } from 'vitest';
import { createProgressThrottler, estimateRemainingMs, formatEta } from '@/engine/progress';

describe('createProgressThrottler', () => {
  it('delivers the first value immediately, then at most once per interval', () => {
    vi.useFakeTimers();
    try {
      const delivered: number[] = [];
      let now = 0;
      const throttler = createProgressThrottler<number>((v) => delivered.push(v), 100, {
        now: () => now,
      });
      throttler.emit(1); // t=0 → immediate
      now = 30;
      throttler.emit(2); // throttled → pending
      now = 60;
      throttler.emit(3); // replaces pending
      expect(delivered).toEqual([1]);
      now = 100;
      vi.advanceTimersByTime(70); // trailing timer (100 − 30 ms) fires with the LATEST value
      expect(delivered).toEqual([1, 3]);
      now = 250;
      throttler.emit(4); // 150 ms since last delivery → immediate again
      expect(delivered).toEqual([1, 3, 4]);
      throttler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush delivers the pending value at once; dispose drops it', () => {
    vi.useFakeTimers();
    try {
      const delivered: number[] = [];
      let now = 0;
      const throttler = createProgressThrottler<number>((v) => delivered.push(v), 100, {
        now: () => now,
      });
      throttler.emit(1);
      now = 10;
      throttler.emit(2);
      throttler.flush();
      expect(delivered).toEqual([1, 2]);
      now = 20;
      throttler.emit(3);
      throttler.dispose();
      vi.advanceTimersByTime(500);
      expect(delivered).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps a burst of 50 rapid emits at ~10 deliveries per second', () => {
    vi.useFakeTimers();
    try {
      const delivered: number[] = [];
      let now = 0;
      const throttler = createProgressThrottler<number>((v) => delivered.push(v), 100, {
        now: () => now,
      });
      for (let i = 0; i < 50; i++) {
        now = i * 20; // one emit every 20 ms for ~1 s
        vi.setSystemTime(now);
        throttler.emit(i);
        vi.advanceTimersByTime(0);
      }
      vi.advanceTimersByTime(200);
      expect(delivered.length).toBeLessThanOrEqual(11);
      expect(delivered[delivered.length - 1]).toBe(49); // latest value wins
      throttler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('estimateRemainingMs', () => {
  it('scales elapsed time by the remaining fraction', () => {
    expect(estimateRemainingMs(10_000, 10, 50)).toBe(40_000);
    expect(estimateRemainingMs(3_000, 3, 4)).toBe(1_000);
  });

  it('is null before any progress or at completion', () => {
    expect(estimateRemainingMs(1_000, 0, 50)).toBeNull();
    expect(estimateRemainingMs(1_000, 50, 50)).toBeNull();
  });
});

describe('formatEta', () => {
  it('formats seconds and minutes', () => {
    expect(formatEta(8_000)).toBe('8s');
    expect(formatEta(65_000)).toBe('1m 05s');
    expect(formatEta(750_000)).toBe('12m 30s');
  });
});
