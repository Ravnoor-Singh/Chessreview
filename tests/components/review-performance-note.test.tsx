import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { setPseudoEnabled } from '@/i18n';
import { buildReview } from './fixture';
import type { GameReview } from '@/lib/types';

// Review-page tooltip localization (Prompt 10 review fix, finding 1):
// the "Performance estimate" label in the summary table carries a
// title tooltip that must follow the active locale — it previously
// rendered the English PERFORMANCE_ESTIMATE_NOTE constant in every
// locale. This renders the REAL review page (summary screen, seeded
// saved-review hand-off) with locale=hi and asserts the Hindi note.

const reviewHolder = vi.hoisted(() => ({ review: null as GameReview | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useEngine', () => ({
  useEngine: () => ({ ready: true, error: null, loadProgress: null }),
  getEngineClient: vi.fn(async () => {
    throw new Error('engine not available in component test');
  }),
  getEnginePool: () => null,
}));

vi.mock('@/engine/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/cache')>();
  return {
    ...actual,
    getReview: vi.fn(async () => reviewHolder.review ?? undefined),
    saveReview: vi.fn(async () => undefined),
    clearPositionCache: vi.fn(async () => undefined),
    getCacheStats: vi.fn(async () => ({ count: 0, approxBytes: 0 })),
  };
});

// Imported after the mocks are registered.
import ReviewPage from '@/app/review/page';

const HINDI_NOTE = 'सटीकता और औसत सेंटिपawn हानि से मोटा एकल-गेम अनुमान — यह रेटिंग नहीं है।';
const ENGLISH_NOTE =
  'Rough single-game band from accuracy and average centipawn loss — not a rating.';

function seededReview(): GameReview {
  const review = buildReview(['e4', 'e5', 'Nf3', 'Nc6']);
  return {
    ...review,
    performance: {
      white: { band: 'master', label: 'Master-level play' },
      black: { band: 'club', label: 'Club-level play' },
    },
  };
}

function setLocale(locale: 'en' | 'hi') {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, locale } });
}

beforeEach(() => {
  // jsdom has no ResizeObserver (used by EvalGraph's effect).
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as typeof ResizeObserver;
  }
  setPseudoEnabled(false);
  reviewHolder.review = seededReview();
  window.sessionStorage.setItem(
    'chess-review:pending',
    JSON.stringify({ reviewId: reviewHolder.review.id }),
  );
});

afterEach(() => {
  setPseudoEnabled(false);
  setLocale('en');
  useGameStore.getState().reset();
  window.sessionStorage.clear();
});

describe('review page performance-estimate tooltip', () => {
  it('shows the Hindi note as the tooltip when locale=hi', async () => {
    setLocale('hi');
    render(<ReviewPage />);
    const label = await screen.findByText('प्रदर्शन अनुमान', {}, { timeout: 10_000 });
    expect(label).toHaveAttribute('title', HINDI_NOTE);
    expect(label.getAttribute('title')).not.toBe(ENGLISH_NOTE);
  });

  it('shows the English note as the tooltip when locale=en', async () => {
    setLocale('en');
    render(<ReviewPage />);
    const label = await screen.findByText('Performance estimate', {}, { timeout: 10_000 });
    expect(label).toHaveAttribute('title', ENGLISH_NOTE);
  });
});
