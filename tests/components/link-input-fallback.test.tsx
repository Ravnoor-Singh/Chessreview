import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LinkInput from '@/components/input/LinkInput';

describe('LinkInput chess.com fallback panel (Prompt 11)', () => {
  it('renders instructions + one-click PGN switch when showFallback is set', () => {
    const onSwitchToPgn = vi.fn();
    render(
      <LinkInput
        value="https://www.chess.com/game/live/123"
        onChange={vi.fn()}
        error="This import method is disabled on this server. Paste the PGN instead."
        showFallback
        onSwitchToPgn={onSwitchToPgn}
      />,
    );
    expect(screen.getByTestId('chesscom-fallback-panel')).toBeInTheDocument();
    expect(screen.getByText(/Chess.com link import is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Share → PGN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /paste the PGN instead/i }));
    expect(onSwitchToPgn).toHaveBeenCalledTimes(1);
  });

  it('no panel by default', () => {
    render(<LinkInput value="" onChange={vi.fn()} error="boom" />);
    expect(screen.queryByTestId('chesscom-fallback-panel')).not.toBeInTheDocument();
  });
});
