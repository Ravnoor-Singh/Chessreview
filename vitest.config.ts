import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        // Worker entry points run inside dedicated workers; they are
        // exercised by the e2e/integration suites, not unit tests.
        'src/engine/stockfish.worker.ts',
        'src/vision/vision.worker.ts',
        // Generated engine manifest data.
        'src/engine/engineManifest.ts',
      ],
    },
    // Top-level worker cap (see the Round 2 gate-repair note in the unit
    // project below): in Vitest 3 `maxWorkers` is a root/project-pool
    // option, not a per-project `test` key — placing it inside a project
    // fails tsc. At the root it caps every project's pool.
    maxWorkers: 2,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/unit/setup.ts'],
          // Worker cap (Round 2 gate repair): several files are heavily
          // CPU-bound (vision fixtures, classification property tests,
          // real-index analyzer tests) and carry wall-clock budgets that
          // measure the CODE (e.g. mean recognition < 1.5 s). At the
          // default core-count parallelism on the 4-core reference VM,
          // co-scheduled heavy files inflated each other's wall times
          // ~1.9x and randomly pushed a different marginal test over its
          // budget on every full-suite run (measured: vision mean
          // 921 ms standalone vs 1,703 ms in-suite). Two workers keep
          // per-test inflation near 1x without touching any assertion or
          // timeout; the suite wall time grows, which is the honest cost.
          // (The cap itself is set once at the root of this config —
          // Vitest 3 does not accept it as a per-project key.)
        },
      },
      {
        resolve: { alias },
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/components/setup.ts'],
        },
      },
    ],
  },
});
