// Validation entry point (Prompt 5) — bundled on the fly by
// scripts/validate-accuracy.mjs with esbuild so the validation runs
// the REAL accuracy pipeline (src/analysis/accuracy.ts), not a
// reimplementation.
//
// Input: one fixture game's per-position evaluations from Lichess's
// own server analysis (White's perspective; mates encoded exactly as
// the app encodes them, ±(100000 − |mate|), mate 0 = side to move
// checkmated with the sign carried by evalWhiteCp — see
// tests/fixtures/lichess-reference/SOURCES.md). The evals are
// converted to accuracy win% with the production `accuracyWinPercent`
// (the ±1000 cp ceiling) and aggregated with the production
// `computeGameAccuracies` — the same wiring the analyzer uses.

import { accuracyWinPercent, computeGameAccuracies } from '@/analysis/accuracy';

export interface FixturePosition {
  evalWhiteCp: number;
  mate?: number;
}

export function accuraciesFromEvals(positions: FixturePosition[]): {
  white: number | null;
  black: number | null;
} {
  const winPercents = positions.map((p) => accuracyWinPercent(p.evalWhiteCp));
  return computeGameAccuracies(winPercents, 'w');
}
