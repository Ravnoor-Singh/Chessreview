import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StorageSection from '@/components/ui/StorageSection';
import * as storage from '@/lib/storage';

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    getStorageReport: vi.fn(async () => ({
      engineBytes: 99_000_000,
      engineCacheNames: ['chess-review-sw-engine-v19.0.1'],
      reviewsCount: 2,
      reviewsApproxBytes: 2048,
      positionsCount: 10,
      positionsApproxBytes: 4096,
      totalUsage: 120_000_000,
      totalQuota: 1_000_000_000,
      persisted: false,
    })),
    clearEngineFileCaches: vi.fn(async () => ['chess-review-sw-engine-v19.0.1']),
    requestPersistentStorage: vi.fn(async () => true),
  };
});

describe('StorageSection (Prompt 9)', () => {
  it('renders per-area usage: engine files, reviews, positions, total', async () => {
    render(<StorageSection />);
    expect(await screen.findByText('Downloaded engine files')).toBeInTheDocument();
    expect(screen.getByText(/94\.4 MB/)).toBeInTheDocument();
    expect(screen.getByText(/^2 · ~2\.0 KB$/)).toBeInTheDocument();
    expect(screen.getByText('Saved reviews', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('Position cache', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('Persistent storage', { selector: 'dt' })).toBeInTheDocument();
  });

  it('warns that clearing re-downloads ~95 MB and needs a confirming second click', async () => {
    render(<StorageSection />);
    expect(await screen.findByText(/re-download \(~95 MB/)).toBeInTheDocument();
    const clear = screen.getByRole('button', { name: /clear downloaded engine files/i });
    fireEvent.click(clear);
    // First click only arms the confirmation — nothing cleared yet.
    expect(storage.clearEngineFileCaches).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm clear/i }));
    await waitFor(() => expect(storage.clearEngineFileCaches).toHaveBeenCalledOnce());
  });

  it('requests persistent storage from the panel', async () => {
    render(<StorageSection />);
    await screen.findByText('Downloaded engine files');
    fireEvent.click(screen.getByRole('button', { name: /keep storage persistent/i }));
    await waitFor(() => expect(storage.requestPersistentStorage).toHaveBeenCalledOnce());
    expect(await screen.findByText('On')).toBeInTheDocument();
  });
});
