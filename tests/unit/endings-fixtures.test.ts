import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePgn } from '@/parsers/pgn';
import { analyzeGame, terminalEval } from '@/engine/analyzer';
import { terminationBannerText } from '@/components/review/TerminationBanner';
import { t, type Locale, type MessageKey } from '@/i18n';
import type { EngineLine, GameResultToken, TerminationKind } from '@/lib/types';
import type { StockfishClient } from '@/engine/stockfish.worker';

// Prompt 6 (bug-fix round): table-driven verification of every game
// ending against a real PGN fixture on disk. Final-eval assertions are
// made at the two levels the architecture exposes:
//   - parse/termination level: terminalEval(finalFen) for endings that
//     are facts of the bare final position (mate, stalemate, move
//     counters, insufficient material);
//   - analyzer level: analyzeGame with a fake engine for repetition
//     draws (a bare FEN carries no repetition history) and for the
//     "ending event gets no blunder label" guarantee.

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'endings');
const load = (file: string) => readFileSync(join(DIR, file), 'utf8');

class FakeClient {
  calls: string[] = [];
  async newGame(): Promise<void> {}
  stop(): void {}
  async analyze(req: {
    fen: string;
    depth: number;
    multiPv: number;
  }): Promise<{ best: string; lines: EngineLine[]; stopped: boolean }> {
    this.calls.push(req.fen);
    const line: EngineLine = {
      multipv: 1,
      depth: req.depth,
      scoreCp: 20,
      pv: ['e2e4', 'e7e5'],
    };
    return { best: 'e2e4', lines: [line], stopped: false };
  }
}

async function analyzeFixture(file: string) {
  const games = parsePgn(load(file));
  const client = new FakeClient();
  const review = await analyzeGame(
    client as unknown as StockfishClient,
    games[0],
    { name: 'Fake', mode: 'single' },
    {
      depth: 18,
      movetimeMs: 100,
      multiPv: 1,
      openingIndex: null,
      token: { cancelled: false },
      presetName: 'standard',
    },
  );
  return { games, client, review };
}

type EvalExpect = 'zero' | 'mate' | 'not-terminal';
interface EndingCase {
  file: string;
  kind: TerminationKind;
  result: GameResultToken;
  winner: 'white' | 'black' | null;
  plies: number;
  /** terminalEval(finalFen) expectation at the parse level. */
  evalExpect: EvalExpect;
}

const CASES: EndingCase[] = [
  {
    file: 'checkmate.pgn',
    kind: 'checkmate',
    result: '0-1',
    winner: 'black',
    plies: 4,
    evalExpect: 'mate',
  },
  {
    file: 'stalemate.pgn',
    kind: 'stalemate',
    result: '1/2-1/2',
    winner: null,
    plies: 1,
    evalExpect: 'zero',
  },
  {
    file: 'threefold.pgn',
    kind: 'repetition-threefold',
    result: '1/2-1/2',
    winner: null,
    plies: 8,
    evalExpect: 'not-terminal',
  },
  {
    file: 'fivefold.pgn',
    kind: 'repetition-fivefold',
    result: '1/2-1/2',
    winner: null,
    plies: 16,
    evalExpect: 'not-terminal',
  },
  {
    file: 'fifty-move.pgn',
    kind: 'fifty-move',
    result: '1/2-1/2',
    winner: null,
    plies: 2,
    evalExpect: 'zero',
  },
  {
    file: 'seventyfive-move.pgn',
    kind: 'seventyfive-move',
    result: '1/2-1/2',
    winner: null,
    plies: 2,
    evalExpect: 'zero',
  },
  {
    file: 'insufficient-material.pgn',
    kind: 'insufficient-material',
    result: '1/2-1/2',
    winner: null,
    plies: 1,
    evalExpect: 'zero',
  },
  {
    file: 'agreement.pgn',
    kind: 'agreement',
    result: '1/2-1/2',
    winner: null,
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'resignation.pgn',
    kind: 'resignation',
    result: '1-0',
    winner: 'white',
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'timeout.pgn',
    kind: 'timeout',
    result: '0-1',
    winner: 'black',
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'timeout-vs-insufficient.pgn',
    kind: 'timeout-vs-insufficient-material',
    result: '1/2-1/2',
    winner: null,
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'abandonment.pgn',
    kind: 'abandonment',
    result: '1-0',
    winner: 'white',
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'abandonment-aborted.pgn',
    kind: 'abandonment',
    result: '*',
    winner: null,
    plies: 4,
    evalExpect: 'not-terminal',
  },
  {
    file: 'unfinished.pgn',
    kind: 'unfinished',
    result: '*',
    winner: null,
    plies: 4,
    evalExpect: 'not-terminal',
  },
];

describe('ending fixtures — parse + termination resolution', () => {
  it.each(CASES)('$file → $kind ($result)', (c) => {
    const games = parsePgn(load(c.file)); // must not crash / throw
    expect(games).toHaveLength(1);
    const g = games[0];
    expect(g.parseError).toBeUndefined();
    expect(g.moves).toHaveLength(c.plies);
    expect(g.result).toBe(c.result);
    expect(g.termination?.kind).toBe(c.kind);
    expect(g.termination?.result).toBe(c.result);
    expect(g.termination?.winner).toBe(c.winner);

    // Final eval at the parse/termination level.
    const finalFen = g.fens[g.fens.length - 1];
    const term = terminalEval(finalFen);
    if (c.evalExpect === 'zero') {
      expect(term?.evalWhiteCp).toBe(0);
    } else if (c.evalExpect === 'mate') {
      expect(term?.mate).toBe(0);
    } else {
      // Resignation / timeout / agreement / abandonment / unfinished and
      // repetition draws are NOT bare-position terminals: the final
      // position keeps its engine evaluation by design.
      expect(term).toBeNull();
    }

    // Banner/result text resolves in English and Hindi (all banner keys
    // exist in all four locales — enforced by i18n:check).
    const bind =
      (locale: Locale) =>
      (key: MessageKey, params?: Record<string, string | number>): string =>
        t(locale, key, params);
    for (const locale of ['en', 'hi'] as const) {
      const text = terminationBannerText(bind(locale), g.termination!, 'Alice', 'Bob');
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('termination.');
    }
    const enText = terminationBannerText(bind('en'), g.termination!, 'Alice', 'Bob');
    if (c.kind === 'checkmate') expect(enText).toContain('checkmate');
    if (c.kind === 'resignation') expect(enText).toContain('resignation');
    if (c.kind === 'timeout') expect(enText).toContain('on time');
  });
});

describe('ending fixtures — analyzer-level final eval for rule draws', () => {
  it.each([
    'stalemate.pgn',
    'threefold.pgn',
    'fivefold.pgn',
    'fifty-move.pgn',
    'seventyfive-move.pgn',
    'insufficient-material.pgn',
  ])('%s final position is scored exactly 0.0 / 50%', async (file) => {
    const { review } = await analyzeFixture(file);
    const last = review!.plies[review!.plies.length - 1];
    expect(last.evalWhiteCp).toBe(0);
    expect(last.winProbWhite).toBe(50);
  });

  it('checkmate fixture: final ply is mate 0, 0% for the mated side', async () => {
    const { review } = await analyzeFixture('checkmate.pgn');
    const last = review!.plies[review!.plies.length - 1];
    expect(last.mate).toBe(0);
    expect(last.winProbWhite).toBe(0);
    expect(review!.termination?.kind).toBe('checkmate');
  });
});

describe('ending fixtures — the ending event itself is never a blunder', () => {
  it.each(['resignation.pgn', 'timeout.pgn'])(
    '%s: no extra ply, and no move is labelled blunder/mistake merely for ending the game',
    async (file) => {
      const { games, review } = await analyzeFixture(file);
      // Exactly one ply per played move plus the start position: the
      // resignation / flag-fall itself creates no ply and therefore can
      // receive no classification at all.
      expect(review!.plies).toHaveLength(games[0].moves.length + 1);
      for (const ply of review!.plies) {
        expect(ply.classification).not.toBe('blunder');
        expect(ply.classification).not.toBe('mistake');
      }
    },
  );
});
