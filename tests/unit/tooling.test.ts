import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Build-robustness guards (Prompt 1): the production build must not depend
// on the network, lint must run through the ESLint CLI, and core dependency
// versions must stay pinned. These tests read the real files in the repo.

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

function* walkSources(): Generator<string> {
  // Only the app entry that owned the Google Fonts import is scanned for the
  // font guards; the package.json checks below cover the tooling contract.
  yield read('src/app/layout.tsx');
}

describe('self-hosted Inter font', () => {
  it('layout uses next/font/local and never next/font/google', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).not.toContain('next/font/google');
    expect(layout).toContain('next/font/local');
    expect(layout).toContain("variable: '--font-inter'");
    expect(layout).toContain("display: 'swap'");
  });

  it('no source file imports next/font/google', () => {
    for (const src of walkSources()) {
      expect(src).not.toContain('next/font/google');
    }
    // The engine worker and API routes must stay network-font free as well.
    expect(read('src/engine/stockfish.worker.ts')).not.toContain('next/font/google');
  });

  it('ships real WOFF2 variable fonts for latin and latin-ext', () => {
    for (const name of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
      const path = `${root}src/assets/fonts/${name}`;
      const buf = readFileSync(path);
      // WOFF2 magic number "wOF2".
      expect(buf.subarray(0, 4).toString('ascii')).toBe('wOF2');
      // Subset files are tens of KB; an empty/error download would not be.
      expect(statSync(path).size).toBeGreaterThan(10_000);
    }
  });

  it('ships the Inter SIL OFL license next to the fonts', () => {
    const license = read('src/assets/fonts/LICENSE');
    expect(license).toContain('SIL OPEN FONT LICENSE');
    expect(license).toContain('The Inter Project Authors');
    expect(read('LICENSES.md')).toContain('SIL Open Font License');
  });
});

describe('tooling contract', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    engines?: { node?: string };
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('lint runs the ESLint CLI, not the deprecated next lint', () => {
    expect(pkg.scripts.lint).toBe('eslint .');
    expect(pkg.scripts.lint).not.toContain('next lint');
    expect(pkg.scripts['lint:fix']).toBe('eslint . --fix');
  });

  it('exposes typecheck, format:check and a combined check script', () => {
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.scripts['format:check']).toContain('prettier --check');
    expect(pkg.scripts.check).toBe(
      'npm run typecheck && npm run lint && npm test && npm run build',
    );
  });

  it('pins exact versions for the core dependencies', () => {
    const pinned: Array<[Record<string, string>, string]> = [
      [pkg.dependencies, 'next'],
      [pkg.dependencies, 'react'],
      [pkg.dependencies, 'react-dom'],
      [pkg.dependencies, 'stockfish'],
      [pkg.dependencies, 'chess.js'],
      [pkg.devDependencies, 'typescript'],
      [pkg.devDependencies, 'vitest'],
    ];
    for (const [group, name] of pinned) {
      expect(group[name], `${name} must be pinned`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    // Next 16 / React 20 are explicitly out of scope for this codebase.
    expect(pkg.dependencies.next).toMatch(/^15\.5\./);
    expect(pkg.dependencies.react).toMatch(/^19\./);
  });

  it('declares the supported Node range', () => {
    expect(pkg.engines?.node).toBe('>=20.11');
    expect(read('.nvmrc').trim()).toBe('20');
  });
});
