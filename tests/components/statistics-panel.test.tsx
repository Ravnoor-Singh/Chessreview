import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StatisticsPanel from '@/components/review/StatisticsPanel';
import EplChart from '@/components/review/EplChart';
import { buildPlies, buildReview } from './fixture';

const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];

describe('StatisticsPanel', () => {
  it('is collapsed by default and renders fixture values when expanded', () => {
    const review = buildReview(LINE, [
      { classification: 'best', epl: 0.02, clockMs: 590_000, timeSpentMs: 10_000 },
      { classification: 'good', epl: 0.05, clockMs: 585_000, timeSpentMs: 15_000 },
      { classification: 'excellent', epl: 0.11, clockMs: 570_000, timeSpentMs: 20_000 },
      { classification: 'best', epl: 0.43, clockMs: 560_000, timeSpentMs: 25_000 },
      { classification: 'book', epl: 0.03, clockMs: 565_000, timeSpentMs: 5_000 },
      { classification: 'good', epl: 0.01, clockMs: 15_000, timeSpentMs: 545_000 },
    ]);
    render(<StatisticsPanel review={review} onJump={() => {}} />);
    expect(screen.queryByText('Avg. centipawn loss')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /statistics/i }));
    expect(screen.getByText('Avg. centipawn loss')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument(); // White ACPL
    expect(screen.getByText('41')).toBeInTheDocument(); // Black ACPL
    // Time-trouble row appears because clocks exist; Black flagged once (15 s).
    expect(screen.getByText(/Time-trouble moves/)).toBeInTheDocument();
  });

  it('biggest-swing button jumps to that ply', () => {
    const onJump = vi.fn();
    const review = buildReview(LINE, [
      { epl: 0.02 },
      { epl: 0.05 },
      { epl: 0.11 },
      { epl: 0.43 },
      { epl: 0.03 },
      { epl: 0.01 },
    ]);
    render(<StatisticsPanel review={review} onJump={onJump} />);
    fireEvent.click(screen.getByRole('button', { name: /statistics/i }));
    fireEvent.click(screen.getByRole('button', { name: /biggest eval swing.*Nc6/i }));
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('hides the clock rows entirely when the game has no clocks', () => {
    const review = buildReview(LINE, [{ epl: 0.1 }]);
    render(<StatisticsPanel review={review} onJump={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /statistics/i }));
    expect(screen.queryByText(/Time by phase/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Time-trouble moves/)).not.toBeInTheDocument();
  });
});

describe('EplChart', () => {
  it('renders a focusable bar per move and jumps on click', () => {
    const onJump = vi.fn();
    const plies = buildPlies(LINE, [
      { epl: 0.02 },
      { epl: 0.05 },
      { epl: 0.11 },
      { epl: 0.43 },
      { epl: 0.03 },
      { epl: 0.01 },
    ]);
    render(<EplChart plies={plies} onJump={onJump} />);
    const bar = screen.getByRole('button', { name: /Nc6.*0\.43/i });
    fireEvent.click(bar);
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('renders nothing for a moveless game', () => {
    const { container } = render(<EplChart plies={buildPlies([])} onJump={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
