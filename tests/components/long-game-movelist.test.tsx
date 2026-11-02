import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MoveList from '@/components/moves/MoveList';
import { useKeyboard } from '@/hooks/useKeyboard';
import { parsePgn } from '@/parsers/pgn';
import { buildPlies } from './fixture';

// Prompt 6 (bug-fix round): the 400-ply fixture game through the real
// MoveList. Virtualization: only a window of rows is mounted while
// aria-rowcount exposes the full 200 move rows. Keyboard navigation:
// the same useKeyboard map shape the review page binds (ArrowLeft /
// ArrowRight step one ply, Home / End jump) driven against a harness
// holding the current ply. Render timing below is jsdom timing (test
// environment), NOT browser timing.

const LONG_PGN = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'endings', 'long-game-400.pgn'),
  'utf8',
);

function KeyboardHarness({ totalPlies }: { totalPlies: number }) {
  const [ply, setPly] = useState(0);
  useKeyboard({
    ArrowLeft: () => setPly((p) => Math.max(0, p - 1)),
    ArrowRight: () => setPly((p) => Math.min(totalPlies, p + 1)),
    Home: () => setPly(0),
    End: () => setPly(totalPlies),
  });
  const sans: string[] = [];
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  for (let i = 0; i < 100; i++) sans.push(...cycle);
  const plies = buildPlies(
    sans,
    sans.map(() => ({})),
  );
  return (
    <div>
      <span data-testid="current-ply">{ply}</span>
      <MoveList plies={plies} currentPly={ply} onSelect={setPly} filterClass={null} showEval />
    </div>
  );
}

describe('MoveList — 400-ply fixture game', () => {
  it('parses the fixture to 400 plies and renders a virtualized window quickly', () => {
    const games = parsePgn(LONG_PGN);
    expect(games[0].moves).toHaveLength(400);
    expect(games[0].fens).toHaveLength(401);
    expect(games[0].termination?.kind).toBe('repetition-fivefold');

    const plies = buildPlies(
      games[0].moves,
      games[0].moves.map(() => ({})),
    );
    const started = performance.now();
    const { container } = render(
      <MoveList plies={plies} currentPly={400} onSelect={() => {}} filterClass={null} showEval />,
    );
    const elapsedMs = performance.now() - started;
    // jsdom render timing (not browser timing): logged for the report.
    console.log(`[bench] MoveList 400-ply fixture render (jsdom): ${elapsedMs.toFixed(1)}ms`);
    expect(elapsedMs).toBeLessThan(5000);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-rowcount', '200');
    const renderedRows = container.querySelectorAll('li[aria-rowindex]').length;
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(60); // a window, not all 200 rows
  });

  it('keyboard navigation steps and jumps across the 400-ply list', () => {
    render(<KeyboardHarness totalPlies={400} />);
    const current = () => screen.getByTestId('current-ply').textContent;
    expect(current()).toBe('0');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(current()).toBe('1');
    expect(screen.getAllByText('Nf3').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(current()).toBe('2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(current()).toBe('1');
    fireEvent.keyDown(window, { key: 'End' });
    expect(current()).toBe('400');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(current()).toBe('399');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(current()).toBe('0');
  });
});
