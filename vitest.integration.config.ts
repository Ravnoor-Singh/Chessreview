import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration project (Round 2, Prompt 5): drives the REAL Stockfish 19
// engine (the `stockfish` npm package, single-thread build) through the
// app's own budget/analysis code in Node. Kept out of the default
// `npm test` run — it loads a ~99 MB WASM engine and takes seconds per
// position — and run explicitly via `npm run test:integration` (and as
// part of `test:all` / CI).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
  },
});
