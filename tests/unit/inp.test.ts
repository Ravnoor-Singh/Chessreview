import { describe, expect, it } from 'vitest';
import { currentInp, foldEventEntry, type InpSample } from '@/lib/inp';

describe('INP aggregation', () => {
  it('keeps the longest event per interaction and reports the worst interaction', () => {
    const samples = new Map<number, InpSample>();
    foldEventEntry(samples, { interactionId: 1, duration: 80 });
    foldEventEntry(samples, { interactionId: 1, duration: 120 });
    foldEventEntry(samples, { interactionId: 1, duration: 60 });
    foldEventEntry(samples, { interactionId: 2, duration: 200 });
    expect(samples.get(1)).toEqual({ interactionId: 1, duration: 120, entries: 3 });
    expect(currentInp(samples)).toBe(200);
  });

  it('ignores entries without an interaction id and reports null when empty', () => {
    const samples = new Map<number, InpSample>();
    foldEventEntry(samples, { duration: 500 });
    foldEventEntry(samples, { interactionId: 0, duration: 500 });
    expect(samples.size).toBe(0);
    expect(currentInp(samples)).toBeNull();
  });
});
