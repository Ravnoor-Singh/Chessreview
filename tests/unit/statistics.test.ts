import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { computeGameStatistics, isEndgameFen, nonPawnMaterial } from '@/analysis/statistics';
import type { GameReview, MoveClass, PlyAnalysis } from '@/lib/types';

interface MoveSpec {
  classification?: MoveClass;
  epl?: number;
  clockMs?: number;
  timeSpentMs?: number;
  fenOverride?: string;
}

/** Build a GameReview fixture by playing SANs on a real board (real FENs). */
function makeReview(
  sans: string[],
  specs: MoveSpec[],
  extras: Partial<GameReview> = {},
): GameReview {
  const chess = new Chess();
  const plies: PlyAnalysis[] = [
    {
      ply: 0,
      fen: chess.fen(),
      evalWhiteCp: 0,
      lines: [],
      depth: 0,
      winProbWhite: 50,
    },
  ];
  sans.forEach((san, i) => {
    const mv = chess.move(san);
    const spec = specs[i] ?? {};
    plies.push({
      ply: i + 1,
      fen: spec.fenOverride ?? chess.fen(),
      san,
      uci: mv.from + mv.to + (mv.promotion ?? ''),
      color: mv.color,
      evalWhiteCp: 0,
      lines: [],
      depth: 0,
      winProbWhite: 50,
      classification: spec.classification,
      epl: spec.epl,
      clockMs: spec.clockMs,
      timeSpentMs: spec.timeSpentMs,
    });
  });
  const counts = () => ({
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    forced: 0,
  });
  return {
    id: 'fixture',
    pgn: '',
    headers: { White: 'White', Black: 'Black' },
    plies,
    accuracy: { white: null, black: null },
    counts: { white: counts(), black: counts() },
    acpl: { white: 24, black: 41 },
    engine: { name: 'Stockfish', depth: 18, mode: 'multi' },
    createdAt: 0,
    ...extras,
  };
}

const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];

describe('computeGameStatistics', () => {
  it('passes ACPL through and counts moves per player', () => {
    const stats = computeGameStatistics(makeReview(LINE, []));
    expect(stats.white.acpl).toBe(24);
    expect(stats.black.acpl).toBe(41);
    expect(stats.white.moveCount).toBe(5);
    expect(stats.black.moveCount).toBe(5);
  });

  it('computes the longest best-or-better streak per player (book breaks a run)', () => {
    const specs: MoveSpec[] = [
      { classification: 'best' }, // W1 -> run 1
      { classification: 'good' }, // B1
      { classification: 'excellent' }, // W2 -> run 2
      { classification: 'best' }, // B2 -> black run 1
      { classification: 'book' }, // W3 -> breaks white's run
      { classification: 'excellent' }, // B3 -> black run 2
      { classification: 'brilliant' }, // W4 -> run 1
      { classification: 'good' }, // B4 -> breaks black
      { classification: 'great' }, // W5 -> run 2
      { classification: 'best' }, // B5 -> run 1
    ];
    const stats = computeGameStatistics(makeReview(LINE, specs));
    expect(stats.white.longestBestStreak).toBe(2);
    expect(stats.black.longestBestStreak).toBe(2);
  });

  it('finds the biggest single-move eval swing with SAN and move number', () => {
    const specs: MoveSpec[] = [
      { epl: 0.02 },
      { epl: 0.05 },
      { epl: 0.11 },
      { epl: 0.43 },
      { epl: 0.03 },
      { epl: 0.01 },
      { epl: 0.07 },
      { epl: 0.02 },
      { epl: 0.0 },
      { epl: 0.09 },
    ];
    const stats = computeGameStatistics(makeReview(LINE, specs));
    expect(stats.black.biggestSwing).toMatchObject({
      san: 'Nc6',
      moveNumber: 2,
      epl: 0.43,
      ply: 4,
    });
    expect(stats.white.biggestSwing).toMatchObject({
      san: 'Nf3',
      moveNumber: 2,
      epl: 0.11,
      ply: 3,
    });
  });

  it('sums time by phase: book plies are opening, the rest middlegame without an endgame', () => {
    const specs: MoveSpec[] = LINE.map((_, i) => ({ timeSpentMs: (i + 1) * 1000 }));
    const review = makeReview(LINE, specs, {
      opening: { eco: 'C70', name: 'Ruy Lopez', leftBookAtPly: 5, sequenceSan: LINE.slice(0, 4) },
    });
    const stats = computeGameStatistics(review);
    // Opening = plies 1..4 (leftBookAtPly 5 - 1). White opening plies 1,3 -> 1s+3s.
    expect(stats.openingEndPly).toBe(4);
    expect(stats.endgameStartPly).toBeNull();
    expect(stats.white.phaseTimes).toEqual({ openingMs: 4000, middlegameMs: 21_000, endgameMs: 0 });
    expect(stats.black.phaseTimes).toEqual({ openingMs: 6000, middlegameMs: 24_000, endgameMs: 0 });
    expect(stats.hasClocks).toBe(true);
  });

  it('uses the first 10 moves as the opening when there is no book info', () => {
    const specs: MoveSpec[] = LINE.map(() => ({ timeSpentMs: 1000 }));
    const stats = computeGameStatistics(makeReview(LINE, specs));
    expect(stats.openingEndPly).toBe(10); // whole 10-ply fixture is "first 10 moves" territory
    expect(stats.white.phaseTimes?.openingMs).toBe(5000);
  });

  it('splits off the endgame at the first position meeting the material rule', () => {
    const endgameFen = '8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 w - - 0 30';
    const specs: MoveSpec[] = LINE.map((_, i) => ({
      timeSpentMs: 1000,
      fenOverride: i >= 6 ? endgameFen : undefined, // from ply 7 on
    }));
    const stats = computeGameStatistics(
      makeReview(LINE, specs, {
        opening: { eco: 'C70', name: 'Ruy Lopez', leftBookAtPly: 3, sequenceSan: LINE.slice(0, 2) },
      }),
    );
    expect(stats.endgameStartPly).toBe(7);
    // White plies 1,3,5,7,9: opening <=2 -> ply1; endgame >=7 -> plies 7,9; middle ply 3,5? ply3 > openingEnd(2) and <7 -> middle; ply5 middle.
    expect(stats.white.phaseTimes).toEqual({
      openingMs: 1000,
      middlegameMs: 2000,
      endgameMs: 2000,
    });
  });

  it('reports no phase times when the game has no clocks', () => {
    const stats = computeGameStatistics(makeReview(LINE, []));
    expect(stats.hasClocks).toBe(false);
    expect(stats.white.phaseTimes).toBeNull();
    expect(stats.black.phaseTimes).toBeNull();
  });

  it('counts time-trouble moves (<30 s, or <10% of base)', () => {
    const specs: MoveSpec[] = [
      { clockMs: 500_000 },
      { clockMs: 25_000 },
      { clockMs: 15_000 },
      { clockMs: 400_000 },
      { clockMs: 100_000 },
      { clockMs: 90_000 },
      {},
      {},
      {},
      {},
    ];
    const review = makeReview(LINE, specs);
    const plain = computeGameStatistics(review);
    expect(plain.white.timeTroubleCount).toBe(1); // only the 15 s clock
    expect(plain.black.timeTroubleCount).toBe(1); // only the 25 s clock
    const withBase = computeGameStatistics(review, { baseTimeMs: 1_800_000 });
    expect(withBase.white.timeTroubleCount).toBe(2); // 15 s and 100 s (< 180 s = 10%)
    expect(withBase.black.timeTroubleCount).toBe(2); // 25 s and 90 s
  });
});

describe('isEndgameFen / nonPawnMaterial', () => {
  it('scores non-pawn material per side', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(nonPawnMaterial(start, 'w')).toBe(31);
    expect(nonPawnMaterial(start, 'b')).toBe(31);
  });
  it('start position is not an endgame; bare rook endings are', () => {
    expect(isEndgameFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false);
    expect(isEndgameFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 40')).toBe(true);
    expect(isEndgameFen('8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 b - - 0 30')).toBe(true);
  });
  it('a queen + rook middlegame (both sides above 13) is not an endgame', () => {
    // White: Q+R+B = 17, Black: Q+R+N = 17.
    expect(isEndgameFen('r2qk2n/8/8/8/8/8/8/2BQRK2 w - - 0 25')).toBe(false);
  });
});
