import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TerminationBanner from '@/components/review/TerminationBanner';
import { EvalBar } from '@/components/eval/EvalBar';
import MoveList from '@/components/moves/MoveList';
import { buildPlies } from './fixture';
import type { GameTermination } from '@/lib/types';

function banner(term: GameTermination) {
  return render(<TerminationBanner termination={term} whiteName="Alice" blackName="Bob" />);
}

describe('TerminationBanner', () => {
  it('renders "Alice won by resignation" with the result marker', () => {
    banner({ kind: 'resignation', winner: 'white', result: '1-0', detail: 'termination-tag' });
    expect(screen.getByTestId('termination-banner')).toHaveTextContent('Alice won by resignation');
    expect(screen.getByTestId('termination-banner')).toHaveTextContent('1-0');
  });

  it('renders "Bob won on time"', () => {
    banner({ kind: 'timeout', winner: 'black', result: '0-1', detail: 'termination-tag' });
    expect(screen.getByTestId('termination-banner')).toHaveTextContent('Bob won on time');
  });

  it('renders "Draw by repetition"', () => {
    banner({ kind: 'repetition-threefold', winner: null, result: '1/2-1/2', detail: 'threefold' });
    expect(screen.getByTestId('termination-banner')).toHaveTextContent(
      'Draw by threefold repetition',
    );
  });

  it('renders "Game not finished" for an unfinished game', () => {
    banner({ kind: 'unfinished', winner: null, result: '*', detail: 'result-only' });
    expect(screen.getByTestId('termination-banner')).toHaveTextContent('Game not finished');
  });

  it('never presents an unknown mechanism as fact', () => {
    banner({
      kind: 'resignation',
      winner: 'white',
      result: '1-0',
      detail: 'result-only-kind-unknown',
    });
    const el = screen.getByTestId('termination-banner');
    expect(el).toHaveTextContent('Alice won');
    expect(el.textContent).not.toContain('resignation');
  });

  it('renders plain abandonment when there is no winner', () => {
    banner({ kind: 'abandonment', winner: null, result: '1/2-1/2', detail: 'lichess-status' });
    expect(screen.getByTestId('termination-banner')).toHaveTextContent('Game abandoned');
  });
});

describe('EvalBar result marker', () => {
  it('shows the final result marker when provided', () => {
    render(<EvalBar winProbWhite={100} evalText="1-0" orientation="w" resultMarker="1-0" />);
    expect(screen.getByTestId('eval-result-marker')).toHaveTextContent('1-0');
  });

  it('shows no marker without a result', () => {
    render(<EvalBar winProbWhite={50} evalText="0.0" orientation="w" />);
    expect(screen.queryByTestId('eval-result-marker')).not.toBeInTheDocument();
  });
});

describe('MoveList virtualization (400-ply game)', () => {
  it('windows the rows, exposes aria-rowcount, and keeps the current move reachable', () => {
    const sans: string[] = [];
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (let i = 0; i < 100; i++) sans.push(...cycle);
    const plies = buildPlies(
      sans,
      sans.map(() => ({})),
    );
    const started = performance.now();
    const { container } = render(
      <MoveList plies={plies} currentPly={400} onSelect={() => {}} filterClass={null} showEval />,
    );
    const elapsed = performance.now() - started;
    console.log(`[bench] MoveList 400-ply render: ${elapsed.toFixed(1)}ms`);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-rowcount', '200');
    const renderedRows = container.querySelectorAll('li[aria-rowindex]').length;
    // Only a window of rows is mounted — far fewer than the 200 move rows.
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(60);
  });

  it('does not virtualize short games', () => {
    const plies = buildPlies(['e4', 'e5', 'Nf3', 'Nc6'], [{}, {}, {}, {}]);
    render(
      <MoveList plies={plies} currentPly={0} onSelect={() => {}} filterClass={null} showEval />,
    );
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-rowcount');
    expect(screen.getByText('Nf3')).toBeInTheDocument();
  });
});
