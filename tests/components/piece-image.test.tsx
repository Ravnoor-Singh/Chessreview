import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PieceImage } from '@/components/board/Piece';
import { useSettingsStore } from '@/store/settingsStore';

function imgSrc(container: HTMLElement): string | null {
  return container.querySelector('img')?.getAttribute('src') ?? null;
}

describe('PieceImage piece-set routing', () => {
  afterEach(() => {
    act(() => {
      useSettingsStore.getState().update({ pieceSet: 'cburnett' });
    });
  });

  it('renders from the active settings-store set and switches instantly with it', () => {
    const { container } = render(<PieceImage piece="wN" />);
    expect(imgSrc(container)).toBe('/pieces/cburnett/wN.svg');

    act(() => {
      useSettingsStore.getState().update({ pieceSet: 'neo' });
    });
    expect(imgSrc(container)).toBe('/pieces/neo/wN.svg');

    act(() => {
      useSettingsStore.getState().update({ pieceSet: 'high-contrast' });
    });
    expect(imgSrc(container)).toBe('/pieces/high-contrast/wN.svg');
  });

  it('an explicit pieceSet prop wins over the store (settings swatches)', () => {
    const { container } = render(<PieceImage piece="bQ" pieceSet="minimal" />);
    expect(imgSrc(container)).toBe('/pieces/minimal/bQ.svg');
  });
});
