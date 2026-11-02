import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MoveList from '@/components/moves/MoveList';
import { buildPlies } from './fixture';

const LINE = ['e4', 'e5', 'Nf3', 'Nc6'];

describe('MoveList time labels', () => {
  it('shows time spent per move when clocks exist', () => {
    const plies = buildPlies(LINE, [
      { timeSpentMs: 12_000, clockMs: 588_000 },
      { timeSpentMs: 3_400, clockMs: 596_600 },
      { timeSpentMs: 83_000, clockMs: 505_000 },
      { timeSpentMs: 1_000, clockMs: 595_600 },
    ]);
    render(
      <MoveList
        plies={plies}
        currentPly={0}
        onSelect={() => {}}
        filterClass={null}
        showEval
        baseTimeMs={600_000}
      />,
    );
    expect(screen.getByText('12s')).toBeInTheDocument();
    expect(screen.getByText('3.4s')).toBeInTheDocument();
    expect(screen.getByText('1:23')).toBeInTheDocument();
  });

  it('shows no time labels and no layout placeholders when there are no clocks', () => {
    const plies = buildPlies(LINE, [{}, {}, {}, {}]);
    render(
      <MoveList plies={plies} currentPly={0} onSelect={() => {}} filterClass={null} showEval />,
    );
    expect(screen.queryByText(/^\d+(\.\d)?s$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Time trouble')).not.toBeInTheDocument();
  });

  it('marks time-trouble moves with an accessible clock glyph', () => {
    const plies = buildPlies(LINE, [
      { timeSpentMs: 5_000, clockMs: 595_000 },
      { timeSpentMs: 5_000, clockMs: 15_000 }, // Black under 30 s after 1...e5
      { timeSpentMs: 5_000, clockMs: 590_000 },
      { timeSpentMs: 5_000, clockMs: 580_000 },
    ]);
    render(
      <MoveList
        plies={plies}
        currentPly={0}
        onSelect={() => {}}
        filterClass={null}
        showEval
        baseTimeMs={600_000}
      />,
    );
    expect(screen.getAllByLabelText('Time trouble')).toHaveLength(1);
  });
});
