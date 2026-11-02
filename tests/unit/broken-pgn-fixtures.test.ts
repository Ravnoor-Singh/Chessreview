import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/parsers/pgn';
import { t } from '@/i18n';

// Prompt 6 (bug-fix round): broken-PGN fixtures. Expected behaviour
// (already implemented by the Prompt 12 recovery path and the review
// page's pgn-recovery panel): the parser keeps the valid prefix,
// reports the failing ply + SAN + legal alternatives, and the UI
// offers "Analyze up to move N" (termination.analyzeUpTo) instead of
// failing the whole import.

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'broken');
const load = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('broken PGN fixtures', () => {
  it('illegal move: valid prefix kept, failing ply and SAN surfaced', () => {
    const games = parsePgn(load('illegal-move.pgn'));
    const g = games[0];
    expect(g.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(g.parseError?.ply).toBe(4);
    expect(g.parseError?.san).toBe('BADMOVE');
    expect(g.parseError?.validMoves).toBe(3);
    expect(g.parseError?.message).toContain('BADMOVE');
    expect(g.parseError?.legalMoves).toContain('Nc6');
    expect(g.pgn).not.toContain('BADMOVE');
    // The recovery panel's button label resolves with the prefix's
    // move number (ceil(validMoves / 2), as the review page computes).
    const label = t('en', 'termination.analyzeUpTo', {
      move: Math.max(1, Math.ceil(g.parseError!.validMoves / 2)),
    });
    expect(label).toContain('Analyze up to move 2');
    expect(t('hi', 'termination.analyzeUpTo', { move: 2 }).length).toBeGreaterThan(0);
  });

  it('truncated game (file cut mid-token): prefix kept, cut token reported', () => {
    const games = parsePgn(load('truncated.pgn'));
    const g = games[0];
    expect(g.moves).toEqual(['e4', 'e5']);
    expect(g.parseError?.ply).toBe(3);
    expect(g.parseError?.san).toBe('Nf');
    expect(g.parseError?.validMoves).toBe(2);
  });

  it('UTF-8 BOM + CRLF line endings parse cleanly', () => {
    const games = parsePgn(load('bom.pgn'));
    expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(games[0].parseError).toBeUndefined();
  });

  it('mixed line endings (CRLF / CR / LF) parse cleanly', () => {
    const games = parsePgn(load('mixed-line-endings.pgn'));
    expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(games[0].parseError).toBeUndefined();
  });

  it('0-0 and 0-0-0 castling spellings are normalized to O-O / O-O-O', () => {
    const games = parsePgn(load('zero-castling.pgn'));
    expect(games).toHaveLength(2);
    expect(games[0].moves).toContain('O-O');
    expect(games[0].moves.filter((m) => m === 'O-O')).toHaveLength(2);
    expect(games[0].parseError).toBeUndefined();
    expect(games[1].moves.filter((m) => m === 'O-O-O')).toHaveLength(2);
    expect(games[1].parseError).toBeUndefined();
    for (const g of games) {
      expect(g.moves.some((m) => m.startsWith('0-0'))).toBe(false);
    }
  });

  it('multiple result tokens: the Result header wins, moves parse fully', () => {
    const games = parsePgn(load('multiple-results.pgn'));
    expect(games[0].moves).toHaveLength(4);
    expect(games[0].result).toBe('1-0');
    expect(games[0].termination?.result).toBe('1-0');
    expect(games[0].parseError).toBeUndefined();
  });

  it('multiple result tokens without a header resolve to the last token (same as the loadPgn path)', () => {
    const games = parsePgn('[Event "T"]\n\n1. e4 e5 1-0 0-1\n');
    expect(games[0].moves).toEqual(['e4', 'e5']);
    expect(games[0].result).toBe('0-1');
  });
});
