import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guard test (Round 2, Prompt 3, req 5/7): per-preset classification
// agreement with a fixed depth-18 reference, measured in a REAL browser
// by scripts/bench-browser.mjs + scripts/agreement.mjs and committed to
// tests/fixtures/bench/agreement-runtime.json. This test is
// deterministic — it re-derives the statistics from the committed
// per-move classification arrays and asserts them against the DOCUMENTED
// ceilings in PERFORMANCE_BASELINE.md.
//
// HONEST TARGET STATUS: the spec's original targets (Standard ≤ 8%,
// Deep ≤ 4% classification difference vs fixed d18) were proven
// unreachable on the 4-core reference VM and are recorded as MISSED in
// PERFORMANCE_BASELINE.md and in known issue K4 — not silently dropped.
// The presets are time-boxed; the browser engine sustains ~315–440k
// nodes/sec here, so Standard reaches mean depth 14.8 and Deep 16.6 vs
// the reference's uniform 18, and Stockfish's own best move differs from
// its depth-18 choice on ~20–26% of positions at those depths — move
// classes cannot agree more often than the evaluations do. Final
// measured pooled values (286 moves, clean re-measurement 2026-11-01):
// quick 28.7%, standard 25.9%, deep 19.6% classification difference;
// ~81% of Standard's differences are a single band (2+-band shifts:
// standard 4.9%, deep 3.8%); pooled mean |Δcp| standard 40.5, deep 28.8
// (Round 1's runtime measured 132.6). The ceilings below are those
// measured values plus headroom for run-to-run variance; tightening them
// requires re-measuring, not editing this file.

interface PresetStats {
  compared: number;
  meanAbsCp: number;
  classDiff: number;
  classDiffPct: number;
  moves: number;
}
interface AgreementFile {
  fixtures: Record<
    string,
    {
      fixedClasses: string[];
      presets: Record<string, { stats: PresetStats; adaptiveClasses: string[] }>;
    }
  >;
  fixedFreq: { brilliantPer40: number; greatPer40: number; moves: number };
  quickFreq: { brilliantPer40: number; greatPer40: number; moves: number };
  standardFreq: { brilliantPer40: number; greatPer40: number; moves: number };
  deepFreq: { brilliantPer40: number; greatPer40: number; moves: number };
}

// Severity ladder for band-distance measurement (book/forced carry no
// quality judgement and are excluded from distance counts).
const LADDER = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
] as const;

const file = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'fixtures',
      'bench',
      'agreement-runtime.json',
    ),
    'utf8',
  ),
) as AgreementFile;

function pooled(preset: string) {
  let moves = 0;
  let classDiff = 0;
  let farShifts = 0;
  let judged = 0;
  let cpWeighted = 0;
  let compared = 0;
  for (const fx of Object.values(file.fixtures)) {
    const entry = fx.presets[preset];
    if (!entry) continue;
    moves += entry.stats.moves;
    classDiff += entry.stats.classDiff;
    cpWeighted += entry.stats.meanAbsCp * entry.stats.compared;
    compared += entry.stats.compared;
    fx.fixedClasses.forEach((fixed, i) => {
      const adaptive = entry.adaptiveClasses[i];
      const a = LADDER.indexOf(fixed as (typeof LADDER)[number]);
      const b = LADDER.indexOf(adaptive as (typeof LADDER)[number]);
      if (a < 0 || b < 0) return;
      judged += 1;
      if (Math.abs(a - b) >= 2) farShifts += 1;
    });
  }
  return {
    moves,
    classDiffPct: (classDiff / moves) * 100,
    farShiftPct: (farShifts / judged) * 100,
    meanAbsCp: cpWeighted / compared,
  };
}

describe('preset agreement guard (committed real-browser classifications)', () => {
  it('covers all three bench fixtures and all presets', () => {
    expect(Object.keys(file.fixtures).sort()).toEqual(['41', '86', 'opera']);
    for (const fx of Object.values(file.fixtures)) {
      expect(Object.keys(fx.presets).sort()).toEqual(['deep', 'quick', 'standard']);
    }
  });

  it('stored statistics match the committed classification arrays', () => {
    for (const fx of Object.values(file.fixtures)) {
      for (const p of Object.values(fx.presets)) {
        expect(p.adaptiveClasses.length).toBe(fx.fixedClasses.length);
        const recomputed = p.adaptiveClasses.filter((c, i) => c !== fx.fixedClasses[i]).length;
        expect(recomputed).toBe(p.stats.classDiff);
        expect(p.stats.moves).toBe(fx.fixedClasses.length);
      }
    }
  });

  it('classification difference stays within the documented ceilings', () => {
    // Measured pooled (286 moves): quick 28.7%, standard 25.9%, deep 19.6%.
    expect(pooled('quick').classDiffPct).toBeLessThanOrEqual(34);
    expect(pooled('standard').classDiffPct).toBeLessThanOrEqual(30);
    expect(pooled('deep').classDiffPct).toBeLessThanOrEqual(24);
    expect(pooled('deep').classDiffPct).toBeLessThanOrEqual(pooled('standard').classDiffPct);
  });

  it('large (2+ band) classification shifts stay rare', () => {
    // Measured: standard 4.9%, deep 3.8% of judged moves.
    expect(pooled('standard').farShiftPct).toBeLessThanOrEqual(7);
    expect(pooled('deep').farShiftPct).toBeLessThanOrEqual(6);
  });

  it('mean |Δcp| vs fixed-18 stays within the documented bounds', () => {
    // Measured pooled: standard 40.5 cp, deep 28.8 cp (Round 1: 132.6 cp).
    expect(pooled('standard').meanAbsCp).toBeLessThanOrEqual(50);
    expect(pooled('deep').meanAbsCp).toBeLessThanOrEqual(38);
  });

  it('Brilliant/Great frequencies under the runtime budget stay in the calibrated family', () => {
    // Runtime recalibration check (req 5): the calibration targets —
    // Brilliant < ~2/40, Great ~1–4/40 in master games — must also hold
    // for classifications produced by the actual runtime budget.
    // Measured on the bench fixtures: Brilliant 0/40 at every preset;
    // Great 1.68/40 (fixed, quick, deep) and 1.96/40 (standard).
    for (const freq of [file.fixedFreq, file.quickFreq, file.standardFreq, file.deepFreq]) {
      expect(freq.brilliantPer40).toBeLessThan(2);
      expect(freq.greatPer40).toBeGreaterThanOrEqual(0.5);
      expect(freq.greatPer40).toBeLessThanOrEqual(4.5);
    }
  });
});
