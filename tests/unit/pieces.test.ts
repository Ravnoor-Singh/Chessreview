import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PIECE_KEYS,
  PIECE_SET_IDS,
  isPieceSetId,
  normalizePieceSet,
  pieceSetInfo,
  pieceSrc,
} from '@/lib/pieces';

const PIECES_DIR = join(process.cwd(), 'public', 'pieces');

describe('piece set registry', () => {
  it('exposes the legacy five first, then the Stage C families (36 total)', () => {
    expect(PIECE_SET_IDS.slice(0, 5)).toEqual([
      'cburnett',
      'neo',
      'staunton-wood',
      'minimal',
      'high-contrast',
    ]);
    expect(PIECE_SET_IDS.length).toBe(36);
    for (const id of PIECE_SET_IDS) {
      expect(isPieceSetId(id)).toBe(true);
      expect(pieceSetInfo(id).name.length).toBeGreaterThan(0);
      expect(pieceSetInfo(id).credit.length).toBeGreaterThan(0);
    }
    expect(pieceSetInfo('cburnett').name).toBe('Classic');
  });

  it('normalizes unknown values to cburnett and keeps valid ids', () => {
    expect(normalizePieceSet('neo')).toBe('neo');
    expect(normalizePieceSet('cburnett')).toBe('cburnett');
    expect(normalizePieceSet('chesscom-alpha')).toBe('cburnett');
    expect(normalizePieceSet(undefined)).toBe('cburnett');
    expect(normalizePieceSet(42)).toBe('cburnett');
    expect(isPieceSetId('nope')).toBe(false);
  });

  it('builds public URLs through the single helper', () => {
    expect(pieceSrc('neo', 'bQ')).toBe('/pieces/neo/bQ.svg');
    expect(pieceSrc('cburnett', 'wP')).toBe('/pieces/cburnett/wP.svg');
  });
});

describe('piece set assets on disk', () => {
  for (const set of PIECE_SET_IDS) {
    it(`${set}: exactly 12 SVGs, consistent viewBox, each < 6 KB`, () => {
      for (const key of PIECE_KEYS) {
        const path = join(PIECES_DIR, set, `${key}.svg`);
        expect(existsSync(path), `${set}/${key}.svg missing`).toBe(true);
        const svg = readFileSync(path, 'utf8');
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox="0 0 45 45"');
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
        expect(statSync(path).size).toBeLessThan(6 * 1024);
      }
      // License bookkeeping ships inside every set folder.
      expect(existsSync(join(PIECES_DIR, set, 'LICENSE.txt'))).toBe(true);
    });
  }
});
