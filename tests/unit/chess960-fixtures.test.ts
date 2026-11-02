import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/parsers/pgn';
import { analyzeGame } from '@/engine/analyzer';
import { buildOpeningIndex, parseOpeningsTsv } from '@/analysis/openings';
import { t, LOCALES } from '@/i18n';
import type { EngineLine } from '@/lib/types';
import type { StockfishClient } from '@/engine/stockfish.worker';

// Prompt 6 (bug-fix round): Chess960 fixture verification. The app's
// documented stance is honest rejection — chess.js 1.4 generates only
// standard castling, so a 960 game is flagged and the review page shows
// the localized "Chess960 is not supported yet" screen (see README
// "Chess960"). These tests pin each sub-part of that path:
//   detection  — Variant tag, non-standard start array, Shredder-FEN;
//   legality   — NOT supported (no chess.js 960 mode exists); the
//                KQkq-shaped fixture parses under standard move
//                generation, but the game is never analyzed as
//                standard chess because the flag blocks it upstream;
//   engine     — UCI_Chess960 is never set: 960 games are blocked
//                before analysis, and the engine client's init option
//                list (Threads/Hash/MultiPV/UCI_AnalyseMode/
//                UCI_ShowWDL in stockfish.worker.ts) has no 960 entry
//                (also pinned by tests/integration #7);
//   label      — termination.chess960Label resolves in all 4 locales
//                and is rendered on the blocked screen (e2e);
//   book       — even if a flagged game reached analyzeGame, the
//                opening book is suppressed (analyzer defense in depth).

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'chess960');
const load = (file: string) => readFileSync(join(DIR, file), 'utf8');

class FakeClient {
  async newGame(): Promise<void> {}
  stop(): void {}
  async analyze(req: {
    fen: string;
    depth: number;
    multiPv: number;
  }): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    const line: EngineLine = {
      multipv: 1,
      depth: req.depth,
      scoreCp: 20,
      pv: ['e2e4', 'e7e5'],
    };
    return { best: 'e2e4', lines: [line], stopped: false };
  }
}

describe('Chess960 fixtures — detection', () => {
  it('detects [Variant "Chess960"] with a non-standard start array', () => {
    const games = parsePgn(load('chess960-variant.pgn'));
    expect(games[0].isChess960).toBe(true);
    expect(games[0].moves).toHaveLength(4);
    expect(games[0].parseError).toBeUndefined();
  });

  it('detects a castling game from the start array alone (no Variant tag)', () => {
    const games = parsePgn(load('chess960-castling.pgn'));
    expect(games[0].isChess960).toBe(true);
    // The O-O in this fixture is shaped like standard castling (king e1,
    // rooks a1/h1), so standard move generation replays it — detection
    // comes from the RQBBKNNR start array, not from a parse failure.
    expect(games[0].moves).toContain('O-O');
    expect(games[0].moves).toHaveLength(7);
  });

  it('a Shredder-FEN (HFhf) game is flagged, not thrown as a parse failure', () => {
    // chess.js rejects the Shredder castling field itself, so no move
    // can be replayed; the parser must still return the flagged game so
    // the UI can show the Chess960 not-supported screen.
    const games = parsePgn(load('chess960-shredder-fen.pgn'));
    expect(games).toHaveLength(1);
    expect(games[0].isChess960).toBe(true);
    expect(games[0].moves).toHaveLength(0);
    expect(games[0].result).toBe('*');
  });
});

describe('Chess960 fixtures — label and opening book', () => {
  it('the "Chess960" label resolves in all four locales', () => {
    for (const locale of LOCALES) {
      expect(t(locale, 'termination.chess960Label')).toBe('Chess960');
      expect(t(locale, 'termination.chess960Title').length).toBeGreaterThan(0);
      expect(t(locale, 'termination.chess960Body').length).toBeGreaterThan(0);
    }
  });

  it('the opening book is never applied to a flagged game, even if analyzed directly', async () => {
    const games = parsePgn(load('chess960-variant.pgn'));
    const openingIndex = buildOpeningIndex(
      parseOpeningsTsv(
        ['eco\tname\tpgn', 'C20\tKing Pawn Game\t1. e4', 'C40\tKing Pawn Game\t1. e4 e5'].join(
          '\n',
        ),
      ),
    );
    const review = await analyzeGame(
      new FakeClient() as unknown as StockfishClient,
      games[0],
      { name: 'Fake', mode: 'single' },
      {
        depth: 18,
        movetimeMs: 100,
        multiPv: 1,
        openingIndex,
        token: { cancelled: false },
        presetName: 'standard',
      },
    );
    expect(review!.plies.every((p) => p.classification !== 'book')).toBe(true);
    expect(review!.opening).toBeUndefined();
  });
});
