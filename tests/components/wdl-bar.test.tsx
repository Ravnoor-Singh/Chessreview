import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WdlBar from '@/components/review/WdlBar';
import EngineLines from '@/components/engine/EngineLines';
import { EvalBar } from '@/components/eval/EvalBar';
import type { EngineLine } from '@/lib/types';

describe('WdlBar', () => {
  // Note: WdlBar keeps role="img" (a three-segment W/D/L strip is not a
  // single meter value); the EvalBar below it became role="meter" in
  // Prompt 6. The queries in each describe target their own component.
  it('renders W/D/L percentages from White perspective when White is to move', () => {
    render(<WdlBar wdl={[380, 520, 100]} sideToMove="w" />);
    expect(screen.getByText('W 38% · D 52% · L 10%')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('W 38% · D 52% · L 10%'),
    );
  });

  it('flips W and L when Black is to move', () => {
    render(<WdlBar wdl={[380, 520, 100]} sideToMove="b" />);
    expect(screen.getByText('W 10% · D 52% · L 38%')).toBeInTheDocument();
  });

  it('renders nothing when the line has no WDL', () => {
    const { container } = render(<WdlBar wdl={undefined} sideToMove="w" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EvalBar WDL tooltip', () => {
  it('includes WDL in the title/aria text when provided', () => {
    render(
      <EvalBar winProbWhite={62} evalText="+0.8" orientation="w" wdlText="W 38% · D 52% · L 10%" />,
    );
    const bar = screen.getByRole('meter');
    expect(bar.getAttribute('aria-label')).toContain(
      'Win draw loss for White: W 38% · D 52% · L 10%',
    );
    expect(bar.getAttribute('title')).toContain('W 38% · D 52% · L 10%');
  });
  it('keeps the plain label when no WDL is available', () => {
    render(<EvalBar winProbWhite={62} evalText="+0.8" orientation="w" />);
    expect(screen.getByRole('meter').getAttribute('aria-label')).not.toContain('Win draw loss');
  });
});

describe('EngineLines WDL integration', () => {
  const line = (wdl?: [number, number, number]): EngineLine => ({
    multipv: 1,
    depth: 18,
    scoreCp: 30,
    pv: ['e2e4'],
    wdl,
  });
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('shows the WDL bar when the top line carries WDL', () => {
    render(
      <EngineLines
        fen={fen}
        lines={[line([380, 520, 100])]}
        thinking={false}
        depth={18}
        onPreviewPv={() => {}}
        onPlayPv={() => {}}
      />,
    );
    expect(screen.getByText('W 38% · D 52% · L 10%')).toBeInTheDocument();
  });

  it('hides cleanly when the top line has no WDL', () => {
    render(
      <EngineLines
        fen={fen}
        lines={[line(undefined)]}
        thinking={false}
        depth={18}
        onPreviewPv={() => {}}
        onPlayPv={() => {}}
      />,
    );
    expect(screen.queryByText(/W \d+% · D \d+% · L \d+%/)).not.toBeInTheDocument();
  });
});
