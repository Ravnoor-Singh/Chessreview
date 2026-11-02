import { describe, expect, it } from 'vitest';
import { resolveTermination, kindFromTerminationPhrase } from '@/analysis/termination';
import { parsePgn } from '@/parsers/pgn';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MID = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

function pgnWith(extraTags: string, movetext: string, result = '1-0'): string {
  return `[Event "T"]\n[White "Alice"]\n[Black "Bob"]\n[Result "${result}"]\n${extraTags}\n${movetext}\n`;
}

describe('resolveTermination — board-derived endings win', () => {
  it('checkmate from the position (Fool\u2019s mate), ignoring a contradictory tag', () => {
    const games = parsePgn(
      pgnWith('[Termination "White won by resignation"]', '1. f3 e5 2. g4 Qh4# 0-1', '0-1'),
    );
    expect(games[0].termination).toEqual({
      kind: 'checkmate',
      winner: 'black',
      result: '0-1',
      detail: 'position',
    });
  });

  it('stalemate from the position', () => {
    const t = resolveTermination({
      finalFen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
      fens: ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'],
      result: '1/2-1/2',
    });
    expect(t).toEqual({ kind: 'stalemate', winner: null, result: '1/2-1/2', detail: 'position' });
  });

  it('insufficient material from the position', () => {
    const t = resolveTermination({ finalFen: '8/8/8/8/8/3k4/8/3KB3 w - - 0 1', result: '1/2-1/2' });
    expect(t.kind).toBe('insufficient-material');
    expect(t.winner).toBeNull();
  });

  it('threefold repetition from the game history', () => {
    const games = parsePgn(
      pgnWith('', '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2', '1/2-1/2'),
    );
    expect(games[0].termination?.kind).toBe('repetition-threefold');
    expect(games[0].termination?.detail).toBe('threefold');
  });

  it('fivefold repetition from the game history', () => {
    const cycle = 'Nf3 Nf6 Ng1 Ng8';
    const moves = Array.from(
      { length: 4 },
      (_, i) =>
        `${i * 2 + 1}. ${cycle.split(' ').slice(0, 2).join(' ')} ${i * 2 + 2}. ${cycle.split(' ').slice(2).join(' ')}`,
    ).join(' ');
    const games = parsePgn(pgnWith('', `${moves} 1/2-1/2`, '1/2-1/2'));
    expect(games[0].moves).toHaveLength(16);
    expect(games[0].termination?.kind).toBe('repetition-fivefold');
  });

  it('fifty-move rule from the halfmove clock', () => {
    const t = resolveTermination({
      finalFen: 'r3k3/8/8/8/8/8/8/R3K3 w Qq - 100 55',
      result: '1/2-1/2',
    });
    expect(t).toEqual({
      kind: 'fifty-move',
      winner: null,
      result: '1/2-1/2',
      detail: 'move-counter',
    });
  });

  it('seventyfive-move rule from the halfmove clock', () => {
    const t = resolveTermination({
      finalFen: 'r3k3/8/8/8/8/8/8/R3K3 w Qq - 150 80',
      result: '1/2-1/2',
    });
    expect(t.kind).toBe('seventyfive-move');
  });
});

describe('resolveTermination — tags and importer metadata', () => {
  const cases: Array<[string, string, string, string]> = [
    // [Termination tag phrase, result, expected kind, expected detail]
    ['White won by resignation', '1-0', 'resignation', 'termination-tag'],
    ['Black won by resignation', '0-1', 'resignation', 'termination-tag'],
    ['White won on time', '1-0', 'timeout', 'termination-tag'],
    ['Black won on time', '0-1', 'timeout', 'termination-tag'],
    ['White won by checkmate', '1-0', 'checkmate', 'termination-tag'],
    ['Drawn by agreement', '1/2-1/2', 'agreement', 'termination-tag'],
    ['Game drawn by stalemate', '1/2-1/2', 'stalemate', 'termination-tag'],
    ['Drawn by repetition', '1/2-1/2', 'repetition-threefold', 'termination-tag'],
    ['Drawn by insufficient material', '1/2-1/2', 'insufficient-material', 'termination-tag'],
    ['White won by abandonment', '1-0', 'abandonment', 'termination-tag'],
    ['Black won by forfeit', '0-1', 'forfeit', 'termination-tag'],
    ['White won by time forfeit', '1-0', 'timeout', 'termination-tag'],
  ];
  it.each(cases)('phrase "%s" (%s) → %s', (phrase, result, kind) => {
    const games = parsePgn(pgnWith(`[Termination "${phrase}"]`, `1. e4 e5 ${result}`, result));
    expect(games[0].termination?.kind).toBe(kind);
    expect(games[0].termination?.detail).toBe('termination-tag');
  });

  it('chess.com per-player results via metadata', () => {
    const t = resolveTermination({
      finalFen: MID,
      result: '1-0',
      meta: { chesscomWhiteResult: 'win', chesscomBlackResult: 'resigned' },
    });
    expect(t).toEqual({
      kind: 'resignation',
      winner: 'white',
      result: '1-0',
      detail: 'chesscom-result',
    });
  });

  it('chess.com timevsinsufficient via metadata is a draw', () => {
    const t = resolveTermination({
      finalFen: MID,
      result: '1/2-1/2',
      meta: {
        chesscomWhiteResult: 'timevsinsufficient',
        chesscomBlackResult: 'timevsinsufficient',
      },
    });
    expect(t.kind).toBe('timeout-vs-insufficient-material');
    expect(t.winner).toBeNull();
  });

  it('Lichess status values via metadata', () => {
    expect(
      resolveTermination({
        finalFen: MID,
        result: '1-0',
        meta: { lichessStatus: 'resign', lichessWinner: 'white' },
      }).kind,
    ).toBe('resignation');
    expect(
      resolveTermination({
        finalFen: MID,
        result: '0-1',
        meta: { lichessStatus: 'outoftime', lichessWinner: 'black' },
      }).kind,
    ).toBe('timeout');
    expect(
      resolveTermination({ finalFen: MID, result: '1/2-1/2', meta: { lichessStatus: 'timeout' } })
        .kind,
    ).toBe('timeout-vs-insufficient-material');
    expect(
      resolveTermination({ finalFen: MID, result: '1/2-1/2', meta: { lichessStatus: 'draw' } })
        .kind,
    ).toBe('agreement');
    expect(
      resolveTermination({ finalFen: START, result: '*', meta: { lichessStatus: 'started' } }).kind,
    ).toBe('unfinished');
  });
});

describe('resolveTermination — fallbacks never crash and never invent a mechanism', () => {
  it('decisive result alone → conventional fallback with result-only-kind-unknown', () => {
    const t = resolveTermination({ finalFen: MID, result: '1-0' });
    expect(t).toEqual({
      kind: 'resignation',
      winner: 'white',
      result: '1-0',
      detail: 'result-only-kind-unknown',
    });
  });

  it('drawn result alone → agreement fallback with result-only-kind-unknown', () => {
    const t = resolveTermination({ finalFen: MID, result: '1/2-1/2' });
    expect(t.detail).toBe('result-only-kind-unknown');
    expect(t.winner).toBeNull();
  });

  it('star result → unfinished', () => {
    expect(resolveTermination({ finalFen: MID, result: '*' })).toEqual({
      kind: 'unfinished',
      winner: null,
      result: '*',
      detail: 'result-only',
    });
  });

  it('decisive tag with a star result is contradictory → unfinished, no invented winner', () => {
    const t = resolveTermination({
      finalFen: MID,
      result: '*',
      headers: { Termination: 'White won by resignation' },
    });
    expect(t.kind).toBe('unfinished');
    expect(t.winner).toBeNull();
  });

  it('garbage FEN falls back to the result token', () => {
    const t = resolveTermination({ finalFen: 'not a fen', result: '0-1' });
    expect(t).toEqual({
      kind: 'resignation',
      winner: 'black',
      result: '0-1',
      detail: 'result-only-kind-unknown',
    });
  });

  it('Lichess "Normal" termination tag is not a mechanism', () => {
    expect(kindFromTerminationPhrase('Normal')).toBeNull();
    const t = resolveTermination({
      finalFen: MID,
      result: '1-0',
      meta: { terminationTag: 'Normal' },
    });
    expect(t.detail).toBe('result-only-kind-unknown');
  });
});
