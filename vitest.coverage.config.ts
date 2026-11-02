import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Coverage run (Round 2, Prompt 5). Same projects as the base config, with:
//
// 1. Coverage thresholds enforced (below): the critical game-logic modules
//    (src/analysis/**, src/engine/analyzer.ts, src/engine/cache.ts,
//    src/parsers/**) are held to the Prompt 5 bar — lines/statements >= 90,
//    functions >= 85, branches >= 80. The global floor is set from the
//    measured coverage of this configuration and only ever ratchets up.
//
// 2. Three wall-clock-budget test files are EXCLUDED from the instrumented
//    run (vision-fixtures, fixtures-property — both projects inherit the
//    exclusion). Reason, measured on this VM: V8 coverage counters inflate
//    hot-path wall time ~3x (EPL-monotonicity property test 1.9 s
//    uninstrumented -> >5 s instrumented; vision clean set 119 s -> >300 s;
//    phone-screenshot mean recognition 0.92 s -> 3.29 s), so their speed
//    budgets — which exist to measure the UNINSTRUMENTED code — cannot
//    hold under instrumentation. No assertion is changed or weakened: the
//    files run, budgets enforced, in the plain `npm test` step of
//    `test:all` and CI.
//
// 3. maxWorkers is 1 here (the base suite uses 2): the analyzer suite's
//    real-index test measures 20.6 s instrumented standalone against its
//    30 s budget, and a second co-scheduled heavy worker inflates it past
//    the budget. Serial execution keeps every remaining test's wall time
//    at its standalone instrumented value. No timeout is raised anywhere.

const EXCLUDED_UNDER_COVERAGE = [
  'tests/unit/vision-fixtures.test.ts',
  'tests/unit/fixtures-property.test.ts',
];

const baseTest = (base as { test?: Record<string, unknown> }).test ?? {};
const baseProjects = (baseTest.projects ?? []) as { test?: Record<string, unknown> }[];

const projects = baseProjects.map((project) => ({
  ...project,
  test: {
    ...project.test,
    exclude: ['**/node_modules/**', '**/dist/**', ...EXCLUDED_UNDER_COVERAGE],
  },
}));

export default defineConfig({
  resolve: (base as { resolve?: unknown }).resolve as never,
  test: {
    maxWorkers: 1,
    projects,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/engine/stockfish.worker.ts',
        'src/vision/vision.worker.ts',
        'src/engine/engineManifest.ts',
      ],
      thresholds: {
        // Global floor, set from the measured totals of this configuration
        // (2026-11-01: lines 74.23, statements 74.23, functions 69.92,
        // branches 80.66) with ~2 points of headroom; ratchet up only.
        lines: 72,
        statements: 72,
        functions: 67,
        branches: 78,
        'src/analysis/**': { lines: 90, statements: 90, functions: 85, branches: 80 },
        'src/engine/analyzer.ts': { lines: 90, statements: 90, functions: 85, branches: 80 },
        'src/engine/cache.ts': { lines: 90, statements: 90, functions: 85, branches: 80 },
        'src/parsers/**': { lines: 90, statements: 90, functions: 85, branches: 80 },
      },
    },
  },
});
