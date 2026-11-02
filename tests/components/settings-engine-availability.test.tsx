import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsDrawer from '@/components/ui/SettingsDrawer';
import { DEFAULT_SETTINGS } from '@/store/settingsStore';
import type { EngineAvailability } from '@/hooks/useEngineManifest';

// SettingsDrawer reads engine-cache stats (IndexedDB) on open; stub it.
vi.mock('@/engine/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/cache')>();
  return {
    ...actual,
    getCacheStats: vi.fn(async () => ({ count: 0, approxBytes: 0 })),
    clearPositionCache: vi.fn(async () => undefined),
  };
});

// The availability hook is the unit under test's only external input:
// each case installs the deployment shape it wants to exercise.
const availability = vi.hoisted(() => ({ current: null as EngineAvailability | null }));
vi.mock('@/hooks/useEngineManifest', () => ({
  useEngineAvailability: () => availability.current,
}));

const file = (name: string, size: number) => ({ name, size, sha256: 'f'.repeat(64) });
function manifestFor(modes: Array<'multi' | 'single' | 'lite'>): EngineAvailability {
  const pairs = {
    multi: [file('stockfish-19.js', 33326), file('stockfish-19.wasm', 99076105)],
    single: [file('stockfish-19-single.js', 28130), file('stockfish-19-single.wasm', 99169054)],
    lite: [
      file('stockfish-19-lite-single.js', 28230),
      file('stockfish-19-lite-single.wasm', 1845971),
    ],
  } as const;
  return {
    manifest: {
      version: '19.0.1',
      generatedAt: '2026-11-01T00:00:00.000Z',
      files: modes.flatMap((m) => pairs[m]),
    },
    modes,
  };
}

function renderDrawer(engineBuild: 'auto' | 'multi' | 'single' | 'lite' = 'auto') {
  return render(
    <SettingsDrawer
      open
      onClose={() => undefined}
      settings={{ ...DEFAULT_SETTINGS, engineBuild }}
      onChange={() => undefined}
      onClearCache={() => undefined}
    />,
  );
}

function buildOptions(): string[] {
  const select = screen.getByLabelText('Engine build');
  return within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);
}

describe('SettingsDrawer engine availability (Prompt 7)', () => {
  it('lite-only deployment: only Auto + Lite are offered, with the weaker-engine note', () => {
    availability.current = manifestFor(['lite']);
    renderDrawer('lite');
    expect(buildOptions()).toEqual(['auto', 'lite']);
    expect(screen.getByText(/ships only the Lite engine build/)).toBeInTheDocument();
    expect(screen.getByText(/weaker Stockfish/)).toBeInTheDocument();
  });

  it('a saved preference for an unshipped build displays as Auto (setting untouched)', () => {
    availability.current = manifestFor(['lite']);
    renderDrawer('multi');
    const select = screen.getByLabelText('Engine build') as HTMLSelectElement;
    expect(select.value).toBe('auto');
  });

  it('multi+lite deployment: Single is not offered; sizes are shown', () => {
    availability.current = manifestFor(['multi', 'lite']);
    renderDrawer();
    expect(buildOptions()).toEqual(['auto', 'multi', 'lite']);
    expect(screen.queryByText(/ships only the Lite engine build/)).not.toBeInTheDocument();
    const select = screen.getByLabelText('Engine build');
    expect(within(select).getByRole('option', { name: /94\.5 MB/ })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: /1\.8 MB/ })).toBeInTheDocument();
  });

  it('unknown availability (manifest unreachable): every build is offered', () => {
    availability.current = null;
    renderDrawer();
    expect(buildOptions()).toEqual(['auto', 'multi', 'single', 'lite']);
    expect(screen.queryByText(/ships only the Lite engine build/)).not.toBeInTheDocument();
  });
});
