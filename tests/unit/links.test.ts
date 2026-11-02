import { describe, expect, it } from 'vitest';
import { detectInput, isLichessStudyUrl, parseChessComUrl, parseLichessUrl } from '@/parsers/links';

describe('parseChessComUrl', () => {
  it('parses live and daily game URLs', () => {
    expect(parseChessComUrl('https://www.chess.com/game/live/12345678')).toEqual({
      kind: 'game',
      id: '12345678',
      gameType: 'live',
    });
    expect(parseChessComUrl('https://www.chess.com/game/daily/87654321')).toEqual({
      kind: 'game',
      id: '87654321',
      gameType: 'daily',
    });
  });

  it('parses analysis game URLs', () => {
    expect(parseChessComUrl('https://www.chess.com/analysis/game/live/12345678')).toEqual({
      kind: 'game',
      id: '12345678',
      gameType: 'live',
    });
    expect(
      parseChessComUrl('https://www.chess.com/analysis/game/daily/87654321?tab=analysis'),
    ).toEqual({ kind: 'game', id: '87654321', gameType: 'daily' });
  });

  it('parses /live/game/{id} URLs', () => {
    expect(parseChessComUrl('https://www.chess.com/live/game/11223344')).toEqual({
      kind: 'game',
      id: '11223344',
      gameType: 'live',
    });
  });

  it('parses member and archive user URLs', () => {
    expect(parseChessComUrl('https://www.chess.com/member/ravnoor2409')).toEqual({
      kind: 'user',
      username: 'ravnoor2409',
    });
    expect(parseChessComUrl('https://www.chess.com/games/archive/ravnoor2409')).toEqual({
      kind: 'user',
      username: 'ravnoor2409',
    });
  });

  it('accepts a bare chess.com domain without protocol', () => {
    expect(parseChessComUrl('www.chess.com/game/live/12345678')).toEqual({
      kind: 'game',
      id: '12345678',
      gameType: 'live',
    });
  });

  it('rejects non-game chess.com pages and foreign hosts', () => {
    expect(parseChessComUrl('https://www.chess.com/home')).toBeNull();
    expect(parseChessComUrl('https://www.chess.com/game/live/abc')).toBeNull();
    expect(parseChessComUrl('https://lichess.org/game/live/12345678')).toBeNull();
    expect(parseChessComUrl('not a url at all')).toBeNull();
  });
});

describe('parseLichessUrl', () => {
  it('parses 8-char and 12-char game ids', () => {
    expect(parseLichessUrl('https://lichess.org/abcd1234')).toEqual({
      gameId: 'abcd1234',
    });
    expect(parseLichessUrl('https://lichess.org/abcd1234efgh')).toEqual({
      gameId: 'abcd1234efgh',
    });
  });

  it('accepts /white and /black suffixes and #ply anchors', () => {
    expect(parseLichessUrl('https://lichess.org/abcd1234/white')).toEqual({
      gameId: 'abcd1234',
    });
    expect(parseLichessUrl('https://lichess.org/abcd1234efgh/black')).toEqual({
      gameId: 'abcd1234efgh',
    });
    expect(parseLichessUrl('https://lichess.org/abcd1234#42')).toEqual({
      gameId: 'abcd1234',
    });
  });

  it('rejects study URLs and other lichess paths', () => {
    expect(parseLichessUrl('https://lichess.org/study/abcd1234/efgh5678')).toBeNull();
    expect(parseLichessUrl('https://lichess.org/player')).toBeNull();
    expect(parseLichessUrl('https://lichess.org/abc')).toBeNull();
  });
});

describe('isLichessStudyUrl', () => {
  it('detects study URLs only', () => {
    expect(isLichessStudyUrl('https://lichess.org/study/abcd1234/efgh5678')).toBe(true);
    expect(isLichessStudyUrl('https://lichess.org/abcd1234')).toBe(false);
    expect(isLichessStudyUrl('https://www.chess.com/game/live/12345678')).toBe(false);
  });
});

describe('detectInput', () => {
  it('detects PGN by tag section or by move text', () => {
    expect(detectInput('[Event "X"]\n\n1. e4 e5')).toEqual({ type: 'pgn' });
    expect(detectInput('1. e4 e5 2. Nf3 Nc6')).toEqual({ type: 'pgn' });
    expect(detectInput('  1. d4 d5')).toEqual({ type: 'pgn' });
  });

  it('detects a FEN (6 fields with a piece-placement first field)', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(detectInput(fen)).toEqual({ type: 'fen', fen });
    const midgame = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    expect(detectInput(midgame)).toEqual({ type: 'fen', fen: midgame });
  });

  it('detects chess.com game and user URLs', () => {
    expect(detectInput('https://www.chess.com/game/live/12345678')).toEqual({
      type: 'chesscom-game',
      id: '12345678',
      gameType: 'live',
    });
    expect(detectInput('https://www.chess.com/game/daily/87654321')).toEqual({
      type: 'chesscom-game',
      id: '87654321',
      gameType: 'daily',
    });
    expect(detectInput('https://www.chess.com/member/ravnoor2409')).toEqual({
      type: 'chesscom-user',
      username: 'ravnoor2409',
    });
  });

  it('detects lichess game URLs', () => {
    expect(detectInput('https://lichess.org/abcd1234')).toEqual({
      type: 'lichess',
      gameId: 'abcd1234',
    });
  });

  it('treats a bare alphanumeric token as a chess.com username', () => {
    expect(detectInput('ravnoor2409')).toEqual({
      type: 'username',
      username: 'ravnoor2409',
    });
    expect(detectInput('Hikaru')).toEqual({ type: 'username', username: 'Hikaru' });
  });

  it('returns unknown for anything else', () => {
    expect(detectInput('')).toEqual({ type: 'unknown' });
    expect(detectInput('hello world this is not valid input')).toEqual({
      type: 'unknown',
    });
    expect(detectInput('ab')).toEqual({ type: 'unknown' }); // too short for a username
    expect(detectInput('https://lichess.org/study/abcd1234/efgh5678')).toEqual({
      type: 'unknown',
    });
  });
});
