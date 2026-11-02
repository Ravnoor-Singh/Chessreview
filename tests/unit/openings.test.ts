import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildOpeningIndex, epdOf, findOpening, parseOpeningsTsv } from '@/analysis/openings';

const TSV = [
  'eco\tname\tpgn',
  'B90\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  'B20\tSicilian Defense\t1. e4 c5',
  "D06\tQueen's Gambit\t1. d4 d5 2. c4",
  'C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4',
  '',
].join('\n');

function fensForSans(sans: string[]): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

describe('parseOpeningsTsv', () => {
  it('parses entries and skips the header and blank lines', () => {
    const entries = parseOpeningsTsv(TSV);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
      pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    });
  });
});

describe('epdOf', () => {
  it('keeps the first four FEN fields', () => {
    expect(epdOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });
});

describe('buildOpeningIndex + findOpening', () => {
  const index = buildOpeningIndex(parseOpeningsTsv(TSV));

  it('finds the Najdorf for its move sequence (deepest match wins)', () => {
    const fens = fensForSans(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    const match = findOpening(fens, index);
    expect(match).not.toBeNull();
    expect(match?.eco).toBe('B90');
    expect(match?.name).toContain('Najdorf');
    expect(match?.matchedPly).toBe(10);
    expect(match?.sequenceSan).toEqual([
      'e4',
      'c5',
      'Nf3',
      'd6',
      'd4',
      'cxd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'a6',
    ]);
  });

  it('stops at the Sicilian when the game leaves the Najdorf line', () => {
    const fens = fensForSans(['e4', 'c5', 'Nf3', 'Nc6']);
    const match = findOpening(fens, index);
    expect(match?.eco).toBe('B20');
    expect(match?.matchedPly).toBe(2);
    expect(match?.sequenceSan).toEqual(['e4', 'c5']);
  });

  it("finds the Queen's Gambit", () => {
    const fens = fensForSans(['d4', 'd5', 'c4']);
    const match = findOpening(fens, index);
    expect(match?.eco).toBe('D06');
    expect(match?.name).toContain("Queen's Gambit");
    expect(match?.matchedPly).toBe(3);
  });

  it('returns null for an unknown position', () => {
    const fens = fensForSans(['h3', 'a6']);
    expect(findOpening(fens, index)).toBeNull();
    expect(findOpening([], index)).toBeNull();
  });

  it('matches by position, not by move order (transposition-safe EPD)', () => {
    // 1. Nf3 d5 2. d4 reaches the same EPD family as 1. d4 d5 2. Nf3 —
    // but the Queen's Gambit entry needs c4, so instead check the Italian
    // reached via a transposed order still resolves:
    const fens = fensForSans(['Nf3', 'Nc6', 'e4', 'e5', 'Bc4']);
    const match = findOpening(fens, index);
    expect(match?.eco).toBe('C50');
  });
});

// --- Task-spec fixture: a tiny two-entry index ------------------------------

describe('openings task-spec fixture (Najdorf + Queen\u2019s Gambit only)', () => {
  const tinyTsv = [
    'eco\tname\tpgn',
    'B90\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    "D06\tQueen's Gambit\t1. d4 d5 2. c4",
  ].join('\n');
  const tinyIndex = buildOpeningIndex(parseOpeningsTsv(tinyTsv));

  it('parses exactly the two entries with their ECO codes and PGNs', () => {
    const entries = parseOpeningsTsv(tinyTsv);
    expect(entries).toHaveLength(2);
    expect(entries[0].eco).toBe('B90');
    expect(entries[1]).toEqual({
      eco: 'D06',
      name: "Queen's Gambit",
      pgn: '1. d4 d5 2. c4',
    });
  });

  it('finds the Najdorf at matchedPly 10 (position after 5...a6)', () => {
    const fens = fensForSans(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(fens).toHaveLength(11); // fens[0] is the start position
    const match = findOpening(fens, tinyIndex);
    expect(match?.name).toContain('Najdorf');
    expect(match?.matchedPly).toBe(10);
    expect(match?.eco).toBe('B90');
  });

  it('returns null for a French Defense game that is not in the tiny index', () => {
    const fens = fensForSans(['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6']);
    expect(findOpening(fens, tinyIndex)).toBeNull();
  });
});
