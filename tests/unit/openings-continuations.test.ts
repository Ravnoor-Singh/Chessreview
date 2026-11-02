import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  bookContinuations,
  bookContinuationsFromFens,
  buildOpeningIndex,
  parseOpeningsTsv,
} from '@/analysis/openings';

function indexFromTsv(tsv: string) {
  return buildOpeningIndex(parseOpeningsTsv(tsv));
}

const NAJDORF_SEQ = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
const NAJDORF_TSV = [
  'eco\tname\tpgn',
  'B90\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  'B90\tSicilian Defense: Najdorf Variation, English Attack\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3',
  'B90\tSicilian Defense: Najdorf Variation, English Attack\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6',
  'B92\tSicilian Defense: Najdorf Variation, Opocensky Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2',
  'B94\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5',
  'B96\tSicilian Defense: Najdorf Variation, Polugaevsky Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 b5',
].join('\n');

describe('bookContinuations (inline fixtures)', () => {
  it('Sicilian Najdorf deviation: returns the book 6th moves, most-played first', () => {
    const conts = bookContinuations(NAJDORF_SEQ, indexFromTsv(NAJDORF_TSV));
    expect(conts.map((c) => c.san)).toEqual(['Be3', 'Bg5', 'Be2']);
    // Be3's name comes from the entry that ends exactly on 6. Be3.
    expect(conts[0]).toMatchObject({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation, English Attack',
    });
    // The actually-played deviation (e.g. 6. a4) is never suggested as book.
    expect(conts.map((c) => c.san)).not.toContain('a4');
  });

  it("Queen's Gambit Declined deviation: continuations after 3...Nf6", () => {
    const tsv = [
      'eco\tname\tpgn',
      "D02\tQueen's Gambit Declined\t1. d4 d5 2. c4 e6 3. Nc3 Nf6",
      "D35\tQueen's Gambit Declined: Orthodox Defense\t1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5",
      "D30\tQueen's Gambit Declined: Queen's Knight Variation\t1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3",
      "D31\tQueen's Gambit Declined: Semi-Slav Defense\t1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5",
    ].join('\n');
    const conts = bookContinuations(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'], indexFromTsv(tsv));
    expect(conts.map((c) => c.san).sort()).toEqual(['Bg5', 'Nf3', 'cxd5']);
    expect(conts.find((c) => c.san === 'Bg5')?.name).toContain('Orthodox');
  });

  it('Ruy Lopez deviation: continuations after 4...Nf6', () => {
    const tsv = [
      'eco\tname\tpgn',
      'C70\tRuy Lopez: Morphy Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6',
      'C80\tRuy Lopez: Open Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4',
      'C77\tRuy Lopez: Morphy Defense, Anderssen Variation\t1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. d3',
      'C78\tRuy Lopez: Morphy Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. d4',
    ].join('\n');
    const conts = bookContinuations(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'],
      indexFromTsv(tsv),
    );
    expect(conts.map((c) => c.san).sort()).toEqual(['O-O', 'd3', 'd4']);
  });

  it('returns [] when the dataset has no continuation for the position', () => {
    const conts = bookContinuations(['e4', 'e5', 'Ke2'], indexFromTsv(NAJDORF_TSV));
    expect(conts).toEqual([]);
  });

  it('caps the result at 3 continuations', () => {
    const conts = bookContinuations(['e4'], indexFromTsv(NAJDORF_TSV));
    expect(conts.length).toBeLessThanOrEqual(3);
  });

  it('bookContinuationsFromFens reconstructs the sequence from positions', () => {
    const chess = new Chess();
    const fens = [chess.fen()];
    for (const san of NAJDORF_SEQ) {
      chess.move(san);
      fens.push(chess.fen());
    }
    const conts = bookContinuationsFromFens(fens, indexFromTsv(NAJDORF_TSV));
    expect(conts.map((c) => c.san)).toEqual(['Be3', 'Bg5', 'Be2']);
  });
});

describe('bookContinuations (real shipped dataset)', () => {
  // Building the index over the full shipped dataset takes a few seconds.
  it('a real Najdorf position returns real book continuations', { timeout: 30_000 }, () => {
    const dir = join(process.cwd(), 'public', 'openings');
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.tsv'))
      .flatMap((f) => parseOpeningsTsv(readFileSync(join(dir, f), 'utf8')));
    expect(entries.length).toBeGreaterThan(1000);
    const index = buildOpeningIndex(entries);
    const conts = bookContinuations(NAJDORF_SEQ, index);
    expect(conts.length).toBeGreaterThanOrEqual(1);
    expect(conts.length).toBeLessThanOrEqual(3);
    // Every suggested move is a genuine Najdorf sixth move from the dataset.
    const knownNajdorfSixthMoves = new Set([
      'Be2',
      'Be3',
      'Bg5',
      'Bc4',
      'Bd3',
      'f4',
      'g3',
      'g4',
      'h3',
      'Rg1',
      'a4',
      'f3',
    ]);
    for (const c of conts) {
      expect(knownNajdorfSixthMoves.has(c.san)).toBe(true);
      expect(c.name).toContain('Najdorf');
      expect(c.eco).toMatch(/^B9/);
    }
  });
});
