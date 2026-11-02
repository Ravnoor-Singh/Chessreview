import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageInput from '@/components/input/ImageInput';
import { recognizeScreenshot } from '@/vision/client';
import { fenToSquares } from '@/vision/validate';
import type { SquareResult } from '@/vision/types';

vi.mock('@/vision/client', () => ({ recognizeScreenshot: vi.fn() }));

const mockRecognize = vi.mocked(recognizeScreenshot);
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 180° rotation: each side's pieces travel with it — White's back rank is
// now on rank 8 (still uppercase), Black's on rank 1 (still lowercase).
const FLIPPED_FEN = 'RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr w KQkq - 0 1';

function startSquares(lowIndex = 52): SquareResult[] {
  const pieces = fenToSquares(START_FEN);
  return pieces.map((piece, i) => ({ piece, confidence: i === lowIndex ? 0.5 : 0.95 }));
}

function okOutcome(meanConfidence: number, squares = startSquares()) {
  return {
    outcome: {
      status: 'ok' as const,
      result: {
        board: { x: 24, y: 24, size: 512, confidence: 0.9 },
        squares,
        meanConfidence,
      },
      detectMs: 40,
      recognizeMs: 90,
      path: 'rect' as const,
    },
    totalMs: 1234,
  };
}

function chooseFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['fake-png-bytes'], 'board.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  mockRecognize.mockReset();
});

describe('ImageInput screenshot recognition flow', () => {
  it('idle state shows the privacy line, the Beta label, and the manual path', () => {
    const onOpenEditor = vi.fn();
    render(<ImageInput onOpenEditor={onOpenEditor} />);
    expect(screen.getByText(/Images never leave your device/)).toBeInTheDocument();
    // Beta was restored in Round 2 Prompt 8 under the spec's label rule:
    // real screenshots measure 100% (≥95% needed) but photographs of
    // physical boards measure ~29% (< the 85% needed to drop the label).
    expect(screen.getByText('Beta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /set up a position manually/ }));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it('recognized: review step shows confidence, highlights, prefilled editor; swap flips; analyze routes the FEN', async () => {
    mockRecognize.mockResolvedValue(okOutcome(0.94));
    const onAnalyzeFen = vi.fn();
    const { container } = render(<ImageInput onOpenEditor={vi.fn()} onAnalyzeFen={onAnalyzeFen} />);
    chooseFile(container);

    // Review step: overall confidence + timing, editor prefilled with the
    // recognized FEN, low-confidence square (e2 @ 0.5) ringed 'low'.
    expect(await screen.findByText(/Recognition confidence:/)).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText(START_FEN)).toBeInTheDocument();
    const lowCell = container.querySelector('[data-highlight="low"]');
    expect(lowCell?.getAttribute('aria-label')).toMatch(/^e2/);
    // Mean confidence 0.94 >= 0.9: no low-confidence warning banner.
    expect(screen.queryByText(/Recognition confidence is low/)).not.toBeInTheDocument();

    // Swap orientation: editor remounts with the 180°-rotated position and
    // the low-confidence ring follows the square (e2 -> d7).
    fireEvent.click(screen.getByRole('button', { name: /Swap orientation/ }));
    expect(await screen.findByText(FLIPPED_FEN)).toBeInTheDocument();
    const flippedLow = container.querySelector('[data-highlight="low"]');
    expect(flippedLow?.getAttribute('aria-label')).toMatch(/^d7/);

    // The only path into analysis is the editor's confirm button.
    fireEvent.click(screen.getByRole('button', { name: 'Analyze this position' }));
    expect(onAnalyzeFen).toHaveBeenCalledWith(FLIPPED_FEN);
  });

  it('low mean confidence shows the check-every-highlighted-square warning', async () => {
    mockRecognize.mockResolvedValue(okOutcome(0.72));
    const { container } = render(<ImageInput onOpenEditor={vi.fn()} onAnalyzeFen={vi.fn()} />);
    chooseFile(container);
    expect(await screen.findByText(/Recognition confidence is low/)).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('detection failure: clear message and an empty editor beside the image', async () => {
    mockRecognize.mockResolvedValue({
      outcome: { status: 'not-found' as const, detectMs: 55 },
      totalMs: 800,
    });
    const { container } = render(<ImageInput onOpenEditor={vi.fn()} onAnalyzeFen={vi.fn()} />);
    chooseFile(container);
    expect(await screen.findByText(/No board could be detected in this image/)).toBeInTheDocument();
    // Empty editor is offered (its FEN line shows the empty board), and the
    // uploaded image stays visible for comparison.
    expect(screen.getByText('8/8/8/8/8/8/8/8 w - - 0 1')).toBeInTheDocument();
    expect(screen.getByAltText(/Uploaded board screenshot/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze this position' })).toBeDisabled();
  });

  it('worker error surfaces a message, not a fake position', async () => {
    mockRecognize.mockRejectedValue(new Error('worker exploded'));
    const { container } = render(<ImageInput onOpenEditor={vi.fn()} onAnalyzeFen={vi.fn()} />);
    chooseFile(container);
    expect(await screen.findByText(/Recognition failed: worker exploded/)).toBeInTheDocument();
    expect(screen.queryByText(/Recognition confidence:/)).not.toBeInTheDocument();
  });
});
