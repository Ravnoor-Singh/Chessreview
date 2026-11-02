import { describe, expect, it } from 'vitest';
import { accuracyWinPercent, computeGameAccuracies, moveAccuracy } from '@/analysis/accuracy';
import { MATE_CP } from '@/lib/constants';

// Edge cases for the accuracy pipeline (Prompt 5, requirement 2).
// All cases run through the production wiring the analyzer uses:
// evalWhiteCp --accuracyWinPercent--> win% series
// --computeGameAccuracies--> per-side game accuracy.

const fromCps = (cps: number[]) => computeGameAccuracies(cps.map(accuracyWinPercent), 'w');
/** Quiet series: `plies` moves, eval hovering at +20 cp (nobody loses win%). */
const quietCps = (plies: number) => Array.from({ length: plies + 1 }, () => 20);

describe('mate scores in the eval series', () => {
  it('accuracy win% saturates at the ±1000 cp ceiling, never 0/100', () => {
    // Mate encodings: ±(100000 − |mate|). Lichess converts mates
    // through the same ±1000 ceiling as cp scores.
    expect(accuracyWinPercent(MATE_CP - 1)).toBeCloseTo(97.5447, 3);
    expect(accuracyWinPercent(-(MATE_CP - 3))).toBeCloseTo(2.4553, 3);
    // Mate on the move (side to move checkmated), sign from evalWhiteCp.
    expect(accuracyWinPercent(MATE_CP)).toBeCloseTo(97.5447, 3);
    expect(accuracyWinPercent(-MATE_CP)).toBeCloseTo(2.4553, 3);
    // Beyond-ceiling cp scores behave exactly like the ceiling.
    expect(accuracyWinPercent(5000)).toBe(accuracyWinPercent(1000));
    expect(accuracyWinPercent(-5000)).toBe(accuracyWinPercent(-1000));
  });

  it('a missed mate loses ≈47 win% points, not a clipped 50', () => {
    // From mate-in-1 (97.54) to a level position (50): the move is
    // bad, but its accuracy is the honest curve value ≈ 10.9 — with
    // the old unclamped 100 → 50 conversion it would read ≈ 9.5 and a
    // played mate in a merely +15.00 position would be
    // indistinguishable from a mate in 1.
    const acc = moveAccuracy(accuracyWinPercent(MATE_CP - 1), accuracyWinPercent(0));
    expect(acc).toBeCloseTo(10.85, 1);
    expect(acc).toBeGreaterThan(5);
  });

  it('a game ending in a delivered mate scores cleanly (no NaN, mating move = 100)', () => {
    // 20 quiet plies, then White mates: the final position (Black to
    // move, checkmated) is evalWhiteCp = +MATE_CP with mate 0.
    const cps = [...quietCps(20), MATE_CP];
    const res = fromCps(cps);
    expect(res.white).not.toBeNull();
    expect(res.black).not.toBeNull();
    for (const v of [res.white!, res.black!]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // The mating move itself improves White's win% (51.8 → 97.54),
    // i.e. accuracy 100, so White (who held every quiet move) is 100.
    expect(res.white).toBe(100);
    expect(res.black).toBe(100);
  });
});

describe('very short games', () => {
  it('fewer than 6 moves per side → null for that side ("Not enough moves")', () => {
    // 9 plies: White 5 moves, Black 4.
    expect(fromCps(quietCps(9))).toEqual({ white: null, black: null });
    // 11 plies: White 6 moves (enough), Black 5 (not enough).
    const res = fromCps(quietCps(11));
    expect(res.white).toBe(100);
    expect(res.black).toBeNull();
    // No moves at all.
    expect(fromCps([20])).toEqual({ white: null, black: null });
    expect(computeGameAccuracies([], 'w')).toEqual({ white: null, black: null });
  });
});

describe('resignation endings (eval series just stops)', () => {
  it('charges exactly the moves played — no manufactured final eval', () => {
    // 39 quiet plies (Black made the last move), White to move
    // resigns in a level position. The series simply stops; both
    // sides played perfectly-quiet moves.
    const resigned = fromCps(quietCps(39));
    expect(resigned.white).toBe(100);
    expect(resigned.black).toBe(100);
    // Control: had a fake terminal eval been appended (Black
    // "blunders into mate" as a phantom 40th ply), Black would be
    // charged for a move that was never played and drop below 100.
    // The pipeline must not (and does not) invent that position.
    const withFakeFinal = fromCps([...quietCps(39), MATE_CP]);
    expect(withFakeFinal.black!).toBeLessThan(100);
    expect(resigned.black!).toBeGreaterThan(withFakeFinal.black!);
  });
});

describe('forced-stalemate final position', () => {
  it('the stalemating move is scored by its real win% drop to 50', () => {
    // White is winning (+600 cp) and stalemates the game away with
    // the last move: win% 90.1 → 50, accuracy ≈ 15.8 for that move.
    const stalemateMoveAcc = moveAccuracy(accuracyWinPercent(600), accuracyWinPercent(0));
    expect(stalemateMoveAcc).toBeGreaterThan(14);
    expect(stalemateMoveAcc).toBeLessThan(17);
    // The eval ramps upward ply by ply (White's moves gain, Black's
    // moves each concede a little, ≈ 90+ accuracy), until White —
    // at +600 after Black's last move — plays the stalemating move
    // (White's 8th move) and the series ends at 0.
    const cps = [20, 60, 100, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500, 540, 600, 0];
    const res = fromCps(cps);
    expect(res.white).not.toBeNull();
    expect(res.black).not.toBeNull();
    expect(res.black!).toBeGreaterThan(85);
    expect(res.white!).toBeLessThan(res.black!);
    expect(Number.isFinite(res.white!)).toBe(true);
  });
});

describe('blundering away a won position', () => {
  // White builds steadily to +900, then throws it to −100 in one
  // move. Black's moves each nudge the eval 5 cp in Black's favour,
  // so Black's per-move accuracy is 100 throughout.
  const cps = [
    15, 30, 25, 60, 55, 120, 110, 250, 240, 450, 440, 700, 690, 900, 890, 900, 890, -100, -110, -80,
    -90,
  ];

  it('the blunder move itself scores in single digits', () => {
    const acc = moveAccuracy(accuracyWinPercent(900), accuracyWinPercent(-100));
    expect(acc).toBeGreaterThan(4);
    expect(acc).toBeLessThan(10);
  });

  it('game accuracy reflects the blunder (dragged down, not clipped to 0 or hidden)', () => {
    const res = fromCps(cps);
    expect(res.black).toBe(100);
    expect(res.white).not.toBeNull();
    expect(res.white!).toBeGreaterThan(30); // one blunder does not zero a game
    expect(res.white!).toBeLessThan(75); // …but it costs dearly
    expect(res.white!).toBeLessThan(res.black! - 25);
  });

  it('control: the same series without the blunder scores 100 for White', () => {
    const clean = [...cps];
    clean[17] = 880;
    clean[18] = 870;
    clean[19] = 860;
    clean[20] = 850;
    const res = fromCps(clean);
    expect(res.white).toBe(100);
    expect(res.black).toBe(100);
  });
});
