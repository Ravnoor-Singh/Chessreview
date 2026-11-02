import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InputTabs from '@/components/input/InputTabs';
import SettingsDrawer from '@/components/ui/SettingsDrawer';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import { setPseudoEnabled } from '@/i18n';

// SettingsDrawer reads engine-cache stats (IndexedDB) on open; stub it.
vi.mock('@/engine/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/cache')>();
  return {
    ...actual,
    getCacheStats: vi.fn(async () => ({ count: 0, approxBytes: 0 })),
    clearPositionCache: vi.fn(async () => undefined),
  };
});

function setLocale(locale: 'en' | 'hi' | 'es' | 'pa') {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, locale } });
}

beforeEach(() => {
  setPseudoEnabled(false);
  setLocale('en');
});

afterEach(() => {
  setPseudoEnabled(false);
  setLocale('en');
});

describe('i18n component rendering (Prompt 10)', () => {
  it('renders the input tabs in Hindi when locale=hi', () => {
    setLocale('hi');
    render(<InputTabs tab="pgn" onChange={() => undefined} />);
    expect(screen.getByRole('tab', { name: 'लिंक / उपयोगकर्ता नाम' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'छवि' })).toBeInTheDocument();
    expect(screen.getByLabelText('गेम इनपुट विधि')).toBeInTheDocument();
  });

  it('renders the settings drawer language section in Hindi when locale=hi', () => {
    setLocale('hi');
    render(
      <SettingsDrawer
        open
        onClose={() => undefined}
        settings={{ ...DEFAULT_SETTINGS, locale: 'hi' }}
        onChange={() => undefined}
        onClearCache={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'सेटिंग्स' })).toBeInTheDocument();
    expect(screen.getByLabelText('भाषा')).toBeInTheDocument();
    // Native names in the picker, untranslated by design.
    // Round 2 Prompt 10: non-English options carry the machine-assisted
    // review-status suffix (in the ACTIVE locale's wording); English,
    // the source catalogue, does not.
    expect(
      screen.getByRole('option', { name: 'हिन्दी — मशीन-सहायता प्राप्त' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'ਪੰਜਾਬੀ — मशीन-सहायता प्राप्त' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Español — मशीन-सहायता प्राप्त' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByText('दिखावट')).toBeInTheDocument();
  });

  it('renders the settings drawer in Spanish when locale=es', () => {
    setLocale('es');
    render(
      <SettingsDrawer
        open
        onClose={() => undefined}
        settings={{ ...DEFAULT_SETTINGS, locale: 'es' }}
        onChange={() => undefined}
        onClearCache={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Idioma')).toBeInTheDocument();
  });

  it('pseudo mode transforms a known string in a real component', () => {
    setPseudoEnabled(true);
    render(<InputTabs tab="pgn" onChange={() => undefined} />);
    // "Link / Username" pseudo-transformed: wrapped in ⟦~ … ~⟧, accented.
    const tab = screen.getByRole('tab', { name: /Líñk/ });
    expect(tab.textContent).toContain('⟦~');
    expect(tab.textContent).toContain('~⟧');
    expect(tab.textContent).not.toBe('Link / Username');
  });
});
