import { describe, expect, it } from 'vitest';
import { parsePgn, splitPgnGames } from '@/parsers/pgn';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const GAME_WITH_EVERYTHING = `[Event "Test Match"]
[Site "Chess Review"]
[Date "2026.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 {[%clk 0:05:00]} e5 (1... c5 2. Nf3 d6) 2. Nf3 $1 {[%clk 0:04:58]} Nc6 {a comment} 3. Bb5 a6 1-0
`;

const SECOND_GAME = `[Event "Second Game"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1
`;

describe('parsePgn', () => {
  it('parses moves, fens, clocks and headers through comments/variations/NAGs', () => {
    const games = parsePgn(GAME_WITH_EVERYTHING);
    expect(games).toHaveLength(1);
    const game = games[0];
    expect(game.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(game.fens).toHaveLength(7);
    expect(game.fens[0]).toBe(START);
    expect(game.startFen).toBe(START);
    // [%clk] annotates the preceding move: e4 → 5:00, Nf3 → 4:58.
    expect(game.clocksMs).toEqual([300000, null, 298000, null, null, null]);
    expect(game.headers.White).toBe('Alice');
    expect(game.headers.Black).toBe('Bob');
    expect(game.headers.Event).toBe('Test Match');
    expect(game.result).toBe('1-0');
    expect(game.pgn).toContain('[Event "Test Match"]');
    expect(game.pgn).toContain('(1... c5'); // original text preserved verbatim
  });

  it('splits and parses a multi-game PGN', () => {
    const text = `${GAME_WITH_EVERYTHING}\n${SECOND_GAME}`;
    expect(splitPgnGames(text)).toHaveLength(2);
    const games = parsePgn(text);
    expect(games).toHaveLength(2);
    expect(games[0].headers.Event).toBe('Test Match');
    expect(games[1].headers.Event).toBe('Second Game');
    expect(games[1].moves).toEqual(['d4', 'd5', 'c4', 'e6']);
    expect(games[1].result).toBe('0-1');
    expect(games[1].clocksMs).toEqual([null, null, null, null]);
    expect(games[1].pgn).toContain('Second Game');
    expect(games[0].pgn).not.toContain('Second Game');
  });

  it('honours a custom SetUp/FEN start position', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const pgn = `[Event "From FEN"]
[SetUp "1"]
[FEN "${fen}"]
[Result "*"]

2. Nf3 Nc6 3. Bb5 *
`;
    const games = parsePgn(pgn);
    expect(games).toHaveLength(1);
    expect(games[0].startFen).toBe(fen);
    expect(games[0].fens[0]).toBe(fen);
    expect(games[0].moves).toEqual(['Nf3', 'Nc6', 'Bb5']);
    expect(games[0].fens).toHaveLength(4);
    expect(games[0].result).toBe('*');
  });

  it('tolerates a missing result', () => {
    const pgn = `[Event "No Result"]
[White "Alice"]
[Black "Bob"]

1. e4 e5 2. Nf3
`;
    const games = parsePgn(pgn);
    expect(games).toHaveLength(1);
    expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(games[0].result).toBe('*');
  });

  it('handles CRLF and a BOM', () => {
    const crlf = GAME_WITH_EVERYTHING.replace(/\n/g, '\r\n');
    const games = parsePgn(`\uFEFF${crlf}`);
    expect(games).toHaveLength(1);
    expect(games[0].moves).toHaveLength(6);
  });

  it('throws a readable Error on garbage', () => {
    expect(() => parsePgn('   ')).toThrowError(/Failed to parse PGN/);
    expect(() => parsePgn('[Event "X"]\n\n1. e9 Ke2 nonsense')).toThrowError(/Failed to parse PGN/);
  });
});

describe('splitPgnGames', () => {
  it('does not split on an [Event mention inside a comment', () => {
    const pgn = `[Event "One"]
[Result "*"]

1. e4 {not a new game: [Event "fake"]} e5 *
`;
    expect(splitPgnGames(pgn)).toHaveLength(1);
  });

  it('returns a single game unchanged in content', () => {
    const games = splitPgnGames(GAME_WITH_EVERYTHING);
    expect(games).toHaveLength(1);
    expect(games[0]).toContain('Test Match');
  });
});
