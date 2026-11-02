import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LinkInput, { OFFLINE_LINK_MESSAGE } from '@/components/input/LinkInput';

describe('LinkInput offline state (Prompt 9)', () => {
  it('shows the offline message and keeps the input usable when offline', () => {
    render(<LinkInput value="" onChange={vi.fn()} offline />);
    expect(screen.getByText(OFFLINE_LINK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(/paste a PGN or use the editor instead/)).toBeInTheDocument();
    expect(screen.getByLabelText(/game link or username/i)).toBeEnabled();
  });

  it('shows no offline message when online (default)', () => {
    render(<LinkInput value="" onChange={vi.fn()} />);
    expect(screen.queryByText(OFFLINE_LINK_MESSAGE)).not.toBeInTheDocument();
  });
});
