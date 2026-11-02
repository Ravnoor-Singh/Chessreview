import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/parsers/pgn';
import {
  computeTimeSpentMs,
  formatPlayerClock,
  formatSpentTime,
  isTimeTrouble,
  parseTimeControl,
} from '@/lib/clocks';

describe('parseTimeControl', () => {
  it('parses chess.com / Lichess "base+increment" seconds', () => {
    expect(parseTimeControl('600+5')).toEqual({ baseMs: 600_000, incrementMs: 5_000 });
    expect(parseTimeControl('180+2')).toEqual({ baseMs: 180_000, incrementMs: 2_000 });
  });
  it('parses a bare base time and the pipe separator', () => {
    expect(parseTimeControl('600')).toEqual({ baseMs: 600_000, incrementMs: 0 });
    expect(parseTimeControl('300|3')).toEqual({ baseMs: 300_000, incrementMs: 3_000 });
  });
  it('uses the last stage of multi-stage controls', () => {
    expect(parseTimeControl('40/7200+30')).toEqual({ baseMs: 7_200_000, incrementMs: 30_000 });
  });
  it('returns null for unknown controls', () => {
    expect(parseTimeControl('-')).toBeNull();
    expect(parseTimeControl('*')).toBeNull();
    expect(parseTimeControl('')).toBeNull();
    expect(parseTimeControl(undefined)).toBeNull();
    expect(parseTimeControl('correspondence')).toBeNull();
  });
});

describe('computeTimeSpentMs', () => {
  it('derives spent = previous same-player clock - clock + increment', () => {
    // Base 600 s, increment 5 s. Clocks are the remaining time AFTER each
    // move, alternating White, Black, White, Black.
    const clocks = [595_000, 590_000, 580_000, 570_000];
    expect(computeTimeSpentMs(clocks, { baseMs: 600_000, incrementMs: 5_000 })).toEqual([
      10_000, // W: 600 - 595 + 5
      15_000, // B: 600 - 590 + 5
      20_000, // W: 595 - 580 + 5 (own previous clock, not Black's 590)
      25_000, // B: 590 - 570 + 5
    ]);
  });
  it('leaves first moves unknown when the base time is unknown', () => {
    const clocks = [595_000, 590_000, 580_000, 570_000];
    expect(computeTimeSpentMs(clocks, { incrementMs: 5_000 })).toEqual([
      undefined,
      undefined,
      20_000,
      25_000,
    ]);
  });
  it('handles missing individual clocks without inventing values', () => {
    const clocks: (number | null)[] = [590_000, 580_000, null, 560_000];
    expect(computeTimeSpentMs(clocks, { baseMs: 600_000, incrementMs: 0 })).toEqual([
      10_000,
      20_000,
      undefined, // this move has no clock
      20_000, // Black's previous own clock is 580 (ply index 1), not the null
    ]);
  });
  it('returns all-undefined when there are no clocks at all', () => {
    expect(computeTimeSpentMs([null, null], { baseMs: 600_000 })).toEqual([undefined, undefined]);
    expect(computeTimeSpentMs([])).toEqual([]);
  });
  it('clamps negative results (clock skew in the source) to zero', () => {
    expect(computeTimeSpentMs([700_000], { baseMs: 600_000, incrementMs: 0 })).toEqual([0]);
  });
});

describe('PGN import path (parsePgn clocks + TimeControl → spent)', () => {
  it('populates per-move spent time from a real PGN with [%clk] and increment', () => {
    const pgn = [
      '[Event "Test"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[TimeControl "600+5"]',
      '',
      '1. e4 {[%clk 0:09:55]} e5 {[%clk 0:09:50]} 2. Nf3 {[%clk 0:09:40]} Nc6 {[%clk 0:09:25]} *',
    ].join('\n');
    const [game] = parsePgn(pgn);
    const tc = parseTimeControl(game.headers.TimeControl);
    expect(tc).toEqual({ baseMs: 600_000, incrementMs: 5_000 });
    expect(
      computeTimeSpentMs(game.clocksMs, { baseMs: tc!.baseMs, incrementMs: tc!.incrementMs }),
    ).toEqual([
      10_000, // 600 - 595 + 5
      15_000, // 600 - 590 + 5
      20_000, // 595 - 580 + 5 (same-player previous clock)
      30_000, // 590 - 565 + 5
    ]);
  });
});

describe('formatPlayerClock', () => {
  it('uses h:mm:ss at an hour or more', () => {
    expect(formatPlayerClock(3_723_000)).toBe('1:02:03');
    expect(formatPlayerClock(3_600_000)).toBe('1:00:00');
  });
  it('uses m:ss from 20 seconds up', () => {
    expect(formatPlayerClock(754_000)).toBe('12:34');
    expect(formatPlayerClock(45_000)).toBe('0:45');
    expect(formatPlayerClock(20_000)).toBe('0:20');
  });
  it('shows tenths under 20 seconds (documented rule)', () => {
    expect(formatPlayerClock(19_900)).toBe('0:19.9');
    expect(formatPlayerClock(4_000)).toBe('0:04.0');
    expect(formatPlayerClock(0)).toBe('0:00.0');
  });
});

describe('formatSpentTime', () => {
  it('formats compact spent labels', () => {
    expect(formatSpentTime(83_000)).toBe('1:23');
    expect(formatSpentTime(12_000)).toBe('12s');
    expect(formatSpentTime(3_400)).toBe('3.4s');
  });
});

describe('isTimeTrouble', () => {
  it('flags under 30 seconds remaining', () => {
    expect(isTimeTrouble(29_999)).toBe(true);
    expect(isTimeTrouble(30_000)).toBe(false);
    expect(isTimeTrouble(undefined)).toBe(false);
  });
  it('flags under 10% of a known base time', () => {
    expect(isTimeTrouble(100_000, 1_800_000)).toBe(true); // 100 s of 30 min
    expect(isTimeTrouble(200_000, 1_800_000)).toBe(false);
    expect(isTimeTrouble(100_000, null)).toBe(false);
  });
});
