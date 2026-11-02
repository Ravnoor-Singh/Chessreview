import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChesscomUsernamePrompt from '@/components/input/ChesscomUsernamePrompt';
import RecentGamesPicker from '@/components/input/RecentGamesPicker';
import type { ImportedGameSummary } from '@/lib/types';

describe('ChesscomUsernamePrompt (inline, not a modal)', () => {
  it('renders pre-filled from the last username and submits it', () => {
    const onSearch = vi.fn();
    render(
      <ChesscomUsernamePrompt username="hikaru" onUsernameChange={vi.fn()} onSearch={onSearch} />,
    );
    expect(screen.getByTestId('chesscom-username-prompt')).toBeInTheDocument();
    const input = screen.getByLabelText(/chess\.com username/i) as HTMLInputElement;
    expect(input.value).toBe('hikaru');
    fireEvent.click(screen.getByRole('button', { name: /search archives/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('reports username edits and blocks search while empty', () => {
    const onUsernameChange = vi.fn();
    const onSearch = vi.fn();
    render(
      <ChesscomUsernamePrompt
        username=""
        onUsernameChange={onUsernameChange}
        onSearch={onSearch}
      />,
    );
    const input = screen.getByLabelText(/chess\.com username/i);
    fireEvent.change(input, { target: { value: 'magnus' } });
    expect(onUsernameChange).toHaveBeenCalledWith('magnus');
    expect(screen.getByRole('button', { name: /search archives/i })).toBeDisabled();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('shows month progress and a working cancel button while searching', () => {
    const onCancel = vi.fn();
    render(
      <ChesscomUsernamePrompt
        username="hikaru"
        onUsernameChange={vi.fn()}
        onSearch={vi.fn()}
        searching
        progress="Searching 2026-05…"
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Searching 2026-05…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

const GAMES: ImportedGameSummary[] = [
  {
    id: '1',
    white: 'Alice',
    black: 'Bob',
    whiteElo: 1500,
    blackElo: 1400,
    result: '1-0',
    date: '2026-10-05',
    event: '',
    timeClass: 'blitz',
    pgn: 'pgn1',
  },
  {
    id: '2',
    white: 'Alice',
    black: 'Carol',
    result: '0-1',
    date: '2026-09-14',
    event: '',
    timeClass: 'rapid',
    pgn: 'pgn2',
  },
  {
    id: '3',
    white: 'Dave',
    black: 'Bob',
    result: '1/2-1/2',
    date: '2026-09-02',
    event: '',
    timeClass: 'blitz',
    pgn: 'pgn3',
  },
];

describe('RecentGamesPicker filters', () => {
  it('lists all games and picks one', () => {
    const onPick = vi.fn();
    render(<RecentGamesPicker games={GAMES} onPick={onPick} />);
    expect(screen.getByText('Carol')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dave'));
    expect(onPick).toHaveBeenCalledWith(GAMES[2]);
  });

  it('search box filters by player name', () => {
    render(<RecentGamesPicker games={GAMES} onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/search games/i), { target: { value: 'carol' } });
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.queryByText('Dave')).not.toBeInTheDocument();
  });

  it('time-control, result and month filters combine', () => {
    render(<RecentGamesPicker games={GAMES} onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/time control/i), { target: { value: 'blitz' } });
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^result$/i), { target: { value: '1/2-1/2' } });
    expect(screen.getByText('Dave')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^month$/i), { target: { value: '2026-10' } });
    expect(screen.getByText(/no games match these filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });
});
