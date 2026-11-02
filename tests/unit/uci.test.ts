import { describe, expect, it } from 'vitest';
import {
  mergeInfoLine,
  parseBestMove,
  parseEngineName,
  parseInfoLine,
  type InfoUpdate,
} from '@/engine/uci';
import type { EngineLine } from '@/lib/types';

describe('parseInfoLine', () => {
  it('parses a full cp info line (wdl, nodes, nps, pv)', () => {
    const info = parseInfoLine(
      'info depth 18 seldepth 27 multipv 2 score cp 35 wdl 520 430 50 nodes 123456 nps 654321 pv e2e4 e7e5',
    );
    expect(info).toEqual({
      depth: 18,
      seldepth: 27,
      multipv: 2,
      scoreCp: 35,
      wdl: [520, 430, 50],
      nodes: 123456,
      nps: 654321,
      pv: ['e2e4', 'e7e5'],
    });
  });

  it('parses a mate line: scoreMate set, scoreCp undefined', () => {
    const info = parseInfoLine('info depth 20 multipv 1 score mate 3 pv e2e4 e7e5 g1f3');
    expect(info).not.toBeNull();
    expect(info?.depth).toBe(20);
    expect(info?.multipv).toBe(1);
    expect(info?.scoreMate).toBe(3);
    expect(info?.scoreCp).toBeUndefined();
    expect(info?.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('parses a negative mate (side to move gets mated)', () => {
    const info = parseInfoLine('info depth 15 multipv 1 score mate -2 pv a7a6');
    expect(info?.scoreMate).toBe(-2);
    expect(info?.scoreCp).toBeUndefined();
  });

  it('returns null for string info lines and non-info lines', () => {
    expect(parseInfoLine('info string hello')).toBeNull();
    expect(parseInfoLine('info depth 18 string NNUE evaluation used')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('readyok')).toBeNull();
  });

  it('returns null when depth, multipv or a score is missing', () => {
    expect(parseInfoLine('info multipv 1 score cp 20 pv e2e4')).toBeNull();
    expect(parseInfoLine('info depth 18 score cp 20 pv e2e4')).toBeNull();
    expect(parseInfoLine('info depth 18 multipv 1 pv e2e4')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('parses bestmove with and without a ponder move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({
      best: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseBestMove('bestmove a7a8q')).toEqual({
      best: 'a7a8q',
      ponder: undefined,
    });
  });

  it('returns null for non-bestmove lines', () => {
    expect(parseBestMove('info depth 18 multipv 1 score cp 20 pv e2e4')).toBeNull();
    expect(parseBestMove('bestmove')).toBeNull();
  });
});

describe('parseEngineName', () => {
  it('extracts the engine name and rejects other lines', () => {
    expect(parseEngineName('id name Stockfish 17.1')).toBe('Stockfish 17.1');
    expect(parseEngineName('id author Some Author')).toBeNull();
    expect(parseEngineName('uciok')).toBeNull();
  });
});

describe('mergeInfoLine', () => {
  const info = (overrides: Partial<InfoUpdate>): InfoUpdate => ({
    depth: 18,
    multipv: 1,
    scoreCp: 20,
    pv: ['e2e4'],
    ...overrides,
  });

  it('keeps lines ordered by multipv regardless of arrival order', () => {
    let lines: EngineLine[] = [];
    lines = mergeInfoLine(lines, info({ multipv: 3, scoreCp: -10, pv: ['g1f3'] }));
    lines = mergeInfoLine(lines, info({ multipv: 1, scoreCp: 30, pv: ['e2e4'] }));
    lines = mergeInfoLine(lines, info({ multipv: 2, scoreCp: 10, pv: ['d2d4'] }));
    expect(lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(lines.map((l) => l.scoreCp)).toEqual([30, 10, -10]);
  });

  it('replaces the entry with the same multipv instead of duplicating it', () => {
    let lines: EngineLine[] = [];
    lines = mergeInfoLine(lines, info({ multipv: 1, depth: 14, scoreCp: 10 }));
    lines = mergeInfoLine(
      lines,
      info({ multipv: 1, depth: 19, scoreCp: 42, pv: ['d2d4', 'd7d5'] }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      multipv: 1,
      depth: 19,
      scoreCp: 42,
      scoreMate: undefined,
      wdl: undefined,
      pv: ['d2d4', 'd7d5'],
      nodes: undefined,
      nps: undefined,
      seldepth: undefined,
    });
  });

  it('does not mutate the input array', () => {
    const before: EngineLine[] = [{ multipv: 1, depth: 18, scoreCp: 20, pv: ['e2e4'] }];
    const after = mergeInfoLine(before, info({ multipv: 2, pv: ['d2d4'] }));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after).not.toBe(before);
  });
});
