import { describe, expect, it } from 'vitest';
import { decimateDots } from '@/components/eval/EvalGraph';
import type { PlyAnalysis } from '@/lib/types';

function ply(i: number, classification?: PlyAnalysis['classification']): PlyAnalysis {
  return { ply: i, classification } as PlyAnalysis;
}

describe('decimateDots (Prompt 6)', () => {
  it('is the identity when every classified ply has its own pixel column', () => {
    const plies = [ply(0), ply(1, 'blunder'), ply(2, 'great'), ply(3, 'mistake')];
    const out = decimateDots(plies, (i) => i * 10);
    expect(out.map((d) => d.i)).toEqual([1, 2, 3]);
  });

  it('keeps only the most severe classification per pixel column', () => {
    // Columns: plies 1..3 all land on x=5 (within rounding), ply 4 on x=50.
    const plies = [ply(0), ply(1, 'great'), ply(2, 'blunder'), ply(3, 'mistake'), ply(4, 'great')];
    const out = decimateDots(plies, (i) => (i <= 3 ? 5 : 50));
    expect(out.map((d) => [d.i, d.p.classification])).toEqual([
      [2, 'blunder'],
      [4, 'great'],
    ]);
  });

  it('skips unclassified plies and non-dot classifications', () => {
    const plies = [ply(0), ply(1, 'best'), ply(2), ply(3, 'brilliant')];
    const out = decimateDots(plies, (i) => i);
    expect(out.map((d) => d.i)).toEqual([3]);
  });
});
