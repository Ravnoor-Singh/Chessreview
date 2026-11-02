import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { decodeChessComMoveList, normalizeArchiveGame } from '@/parsers/chesscom';
import { parseUci } from '@/lib/san';

interface CallbackFixture {
  gameId: string;
  moveList: string;
  sans: string[];
}

function loadFixture(name: string): CallbackFixture {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as CallbackFixture;
}

/** Play UCI moves from the start position and return the SAN sequence. */
function sansOfUcis(ucis: string[]): string[] {
  const chess = new Chess();
  return ucis.map((uci) => {
    const { from, to, promotion } = parseUci(uci);
    return chess.move({ from, to, promotion }).san;
  });
}

describe('decodeChessComMoveList vs recorded callback fixtures', () => {
  it('decodes the plain fixture to exactly the recorded SAN sequence', () => {
    const fixture = loadFixture('chesscom-callback-plain.json');
    const ucis = decodeChessComMoveList(fixture.moveList);
    expect(ucis).toHaveLength(fixture.sans.length);
    expect(ucis[0]).toBe('d2d4'); // pair "lB": l = d2, B = d4 in the square table
    expect(sansOfUcis(ucis)).toEqual(fixture.sans);
  });

  it('decodes the promotion fixture (incl. the queen promotion) exactly', () => {
    const fixture = loadFixture('chesscom-callback-promo.json');
    const ucis = decodeChessComMoveList(fixture.moveList);
    expect(ucis).toHaveLength(fixture.sans.length);
    expect(sansOfUcis(ucis)).toEqual(fixture.sans);
    // The promotion: fixture SAN "g1=Q" must decode to g2g1q ('~' = queen push).
    const promoIndex = fixture.sans.indexOf('g1=Q');
    expect(promoIndex).toBeGreaterThanOrEqual(0);
    expect(ucis[promoIndex]).toBe('g2g1q');
  });

  it('returns [] for an empty move list', () => {
    expect(decodeChessComMoveList('')).toEqual([]);
  });

  it('throws the documented error on undecodable input', () => {
    expect(() => decodeChessComMoveList('abc')).toThrowError(
      'Could not decode chess.com move list',
    );
    // a1->a1 is not a legal move for the rook on a1, and no alternative
    // decoding of the pair exists.
    expect(() => decodeChessComMoveList('aa')).toThrowError('Could not decode chess.com move list');
  });
});

describe('normalizeArchiveGame', () => {
  const pgn = [
    '[Event "Live Chess"]',
    '[Site "Chess.com"]',
    '[Date "2026.01.01"]',
    '[White "Alice"]',
    '[Black "Bob"]',
    '[Result "1-0"]',
    '',
    '1. e4 e5 2. Nf3 Nc6 1-0',
  ].join('\n');

  const rawGame = {
    rules: 'chess',
    url: 'https://www.chess.com/game/live/12345678',
    pgn,
    white: { username: 'Alice', rating: 1500, result: 'win' },
    black: { username: 'Bob', rating: 1400, result: 'checkmated' },
    time_class: 'blitz',
    // 2026-01-01T00:00:00Z
    end_time: 1767225600,
  };

  it('normalises a standard archive game into a summary', () => {
    const summary = normalizeArchiveGame(rawGame);
    expect(summary).not.toBeNull();
    expect(summary).toEqual({
      id: '12345678', // last URL segment
      white: 'Alice',
      black: 'Bob',
      whiteElo: 1500,
      blackElo: 1400,
      result: '1-0', // white "win" maps to 1-0
      date: '2026-01-01', // from end_time, ISO date part
      event: 'Live Chess',
      timeClass: 'blitz',
      url: 'https://www.chess.com/game/live/12345678',
      pgn,
    });
  });

  it('maps agreed draws to 1/2-1/2', () => {
    const summary = normalizeArchiveGame({
      ...rawGame,
      white: { username: 'Alice', rating: 1500, result: 'agreed' },
      black: { username: 'Bob', rating: 1400, result: 'agreed' },
    });
    expect(summary?.result).toBe('1/2-1/2');
  });

  it('returns null for chess960 and other variants', () => {
    expect(normalizeArchiveGame({ ...rawGame, rules: 'chess960' })).toBeNull();
    expect(normalizeArchiveGame({ ...rawGame, rules: 'bughouse' })).toBeNull();
  });

  it('returns null when the PGN or a player is missing', () => {
    expect(normalizeArchiveGame({ ...rawGame, pgn: undefined })).toBeNull();
    expect(normalizeArchiveGame({ ...rawGame, white: { rating: 1500 } })).toBeNull();
    expect(normalizeArchiveGame(null)).toBeNull();
    expect(normalizeArchiveGame('not an object')).toBeNull();
  });
});
