import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/parsers/pgn';

function promoGame(san: string): string {
  return `[Event "Promo"]\n[SetUp "1"]\n[FEN "1k6/P7/8/8/8/8/8/K7 w - - 0 1"]\n[Result "*"]\n\n1. ${san} *\n`;
}

describe('PGN recovery — truncated / corrupt movetext', () => {
  it('keeps the valid prefix and reports ply, SAN and legal moves', () => {
    const games = parsePgn('[Event "T"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 BADMOVE 3. Bb5 a6 *\n');
    expect(games).toHaveLength(1);
    const g = games[0];
    expect(g.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(g.parseError?.ply).toBe(4);
    expect(g.parseError?.san).toBe('BADMOVE');
    expect(g.parseError?.validMoves).toBe(3);
    expect(g.parseError?.message).toContain('BADMOVE');
    expect(g.parseError?.legalMoves).toContain('Nc6');
    // The stored pgn is a clean re-serialization of the prefix only.
    expect(g.pgn).toContain('Nf3');
    expect(g.pgn).not.toContain('BADMOVE');
    expect(g.result).toBe('*');
  });

  it('still throws when the very first move is illegal (nothing to recover)', () => {
    expect(() => parsePgn('[Event "X"]\n\n1. e9 Ke2 nonsense')).toThrowError(/Failed to parse PGN/);
  });
});

describe('PGN edge cases', () => {
  it('accepts 0-0 and 0-0-0 castling spellings', () => {
    const games = parsePgn(
      '[Event "T"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. 0-0 Nf6 5. d3 0-0 *\n',
    );
    expect(games[0].moves).toContain('O-O');
    expect(games[0].parseError).toBeUndefined();
  });

  it.each(['a8=Q', 'a8=R', 'a8=B', 'a8=N'])('parses promotion to %s', (san) => {
    const games = parsePgn(promoGame(san));
    // chess.js canonical SAN may add a check suffix (a8=Q+ / a8=R+).
    expect(games[0].moves[0].replace(/[+#]$/, '')).toBe(san);
  });

  it('parses en passant', () => {
    const games = parsePgn('[Event "T"]\n[Result "*"]\n\n1. e4 a6 2. e5 d5 3. exd6 *\n');
    expect(games[0].moves).toEqual(['e4', 'a6', 'e5', 'd5', 'exd6']);
  });

  it('handles a UTF-8 BOM and mixed line endings', () => {
    const text = '\uFEFF[Event "T"]\r\n[Result "*"]\r\n\r\n1. e4 e5\r2. Nf3 Nc6 *\n';
    const games = parsePgn(text);
    expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('handles nested variations, nested comments, NAGs and [%eval] annotations', () => {
    const pgn =
      '[Event "T"]\n[Result "1-0"]\n\n1. e4 {[%eval 0.3] [%clk 0:05:00]} e5 (1... c5 (1... e6 2. d4) 2. Nf3 d6) 2. Nf3 $1 {outer comment} Nc6 $14 3. Bb5 a6 1-0\n';
    const games = parsePgn(pgn);
    expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(games[0].clocksMs[0]).toBe(300000);
    expect(games[0].result).toBe('1-0');
  });

  it('preserves unusual headers', () => {
    const pgn =
      '[Event "Weird, \\"Quoted\\" Event"]\n[White "Doe, John"]\n[Black "Roe, Jane"]\n[ECO "C50"]\n[Annotator "someone"]\n[PlyCount "4"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1\n';
    const games = parsePgn(pgn);
    expect(games[0].headers.White).toBe('Doe, John');
    expect(games[0].headers.ECO).toBe('C50');
    expect(games[0].headers.Annotator).toBe('someone');
    expect(games[0].result).toBe('0-1');
  });

  it('tolerates a trailing second result token', () => {
    const games = parsePgn('[Event "T"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n');
    expect(games[0].moves).toHaveLength(4);
    expect(games[0].result).toBe('1-0');
  });
});

describe('Chess960 detection (rejected, never analyzed as standard)', () => {
  it('detects a [Variant "Chess960"] game', () => {
    const pgn =
      '[Event "960"]\n[Variant "Chess960"]\n[SetUp "1"]\n[FEN "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *\n';
    const games = parsePgn(pgn);
    expect(games[0].isChess960).toBe(true);
  });

  it('detects a Fischer Random start FEN with a castling move and no Variant tag', () => {
    // Back rank RQB BKNNR: king e1 with rooks a1/h1, so O-O is shaped
    // like standard castling — detection must come from the start array.
    const pgn =
      '[Event "960"]\n[SetUp "1"]\n[FEN "rqbbknnr/pppppppp/8/8/8/8/PPPPPPPP/RQBBKNNR w KQkq - 0 1"]\n[Result "*"]\n\n1. Nf3 Nf6 2. Ng3 Ng6 3. e3 e6 4. O-O *\n';
    const games = parsePgn(pgn);
    expect(games[0].moves).toContain('O-O');
    expect(games[0].isChess960).toBe(true);
  });

  it('does not flag standard games or ordinary SetUp positions', () => {
    expect(parsePgn('[Event "T"]\n\n1. e4 e5 *\n')[0].isChess960).toBeUndefined();
    const study = parsePgn(
      '[Event "S"]\n[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/6p1/K7 w - - 0 1"]\n\n1. a8=Q *\n',
    );
    expect(study[0].isChess960).toBeUndefined();
  });
});

describe('very long games', () => {
  it('parses a 400-ply game and resolves fivefold repetition', () => {
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      const n = i * 2 + 1;
      parts.push(`${n}. ${cycle[0]} ${cycle[1]} ${n + 1}. ${cycle[2]} ${cycle[3]}`);
    }
    const games = parsePgn(`[Event "Long"]\n[Result "1/2-1/2"]\n\n${parts.join(' ')} 1/2-1/2\n`);
    expect(games[0].moves).toHaveLength(400);
    expect(games[0].fens).toHaveLength(401);
    expect(games[0].termination?.kind).toBe('repetition-fivefold');
  });
});
