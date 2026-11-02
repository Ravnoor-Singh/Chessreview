'use client';

import { useEffect, useState } from 'react';
import MiniPreview from '@/components/settings/MiniPreview';
import { backgroundCss } from '@/components/settings/BoardPiecesTabs';
import { PieceImage } from '@/components/board/Piece';
import { BACKGROUND_DEFS, getBackgroundDef } from '@/themes/backgrounds';
import { BOARD_THEME_DEFS, getBoardThemeDef } from '@/themes/boards';
import { PIECE_SET_DEFS } from '@/themes/pieces';
import { PRESET_DEFS } from '@/themes/presets';

/**
 * Theme gallery (Themes & Presets program) — an unlinked internal page
 * that renders EVERY registered theme asset from the real definitions:
 * boards as live mini-board previews, piece sets as their full 12
 * glyphs, backgrounds as bands with a sample panel under each def's
 * own scrim, and presets as a preview board on the preset's own
 * background. The contact-sheet e2e spec (tests/e2e/themes-gallery
 * .spec.ts) screenshots each section in dark and light UI themes:
 *   /theme-gallery?section=boards|pieces|backgrounds|presets
 * With no section param, all sections render (design review).
 *
 * This is the client half only; the route gate (dev/test-only,
 * Post-Round-2 Prompt 3) lives in the server component in page.tsx,
 * which renders this component only when the gallery is enabled.
 */

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog. 0123456789';

function scrimCss(def: (typeof BACKGROUND_DEFS)[number]): string {
  const n = parseInt(def.scrim.color.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${def.scrim.opacity})`;
}

function BoardsSection(): React.JSX.Element {
  return (
    <section data-section="boards">
      <h2 className="mb-3 text-lg font-bold text-ink">Boards ({BOARD_THEME_DEFS.length})</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {BOARD_THEME_DEFS.map((def) => (
          <figure
            key={def.id}
            data-board={def.id}
            className="rounded-lg bg-panel p-3 ring-1 ring-line"
          >
            <MiniPreview
              board={def}
              pieceSet="cburnett"
              coordinates="inside"
              highlightStyle="solid"
              moveHintStyle="dots"
              size={30}
            />
            <figcaption className="mt-2 text-xs font-semibold text-ink">{def.id}</figcaption>
            <p className="text-[11px] text-muted">{def.category}</p>
          </figure>
        ))}
      </div>
    </section>
  );
}

const PIECE_KEYS = [
  'wP',
  'wN',
  'wB',
  'wR',
  'wQ',
  'wK',
  'bP',
  'bN',
  'bB',
  'bR',
  'bQ',
  'bK',
] as const;

function PiecesSection(): React.JSX.Element {
  const green = getBoardThemeDef('green');
  const contrast = getBoardThemeDef('contrast');
  return (
    <section data-section="pieces">
      <h2 className="mb-3 text-lg font-bold text-ink">Piece sets ({PIECE_SET_DEFS.length})</h2>
      <div className="flex flex-col gap-4">
        {PIECE_SET_DEFS.map((def) => (
          <figure
            key={def.id}
            data-piece-set={def.id}
            className="rounded-lg bg-panel p-3 ring-1 ring-line"
          >
            <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
              {PIECE_KEYS.map((key, i) => {
                const board = i % 2 === 0 ? green : contrast;
                const dark = key.startsWith('b');
                return (
                  <span
                    key={key}
                    className="flex aspect-square items-center justify-center"
                    style={{
                      backgroundColor: dark ? board?.tokens.light : board?.tokens.dark,
                    }}
                  >
                    <span className="block h-[86%] w-[86%]">
                      <PieceImage piece={key} pieceSet={def.id} />
                    </span>
                  </span>
                );
              })}
            </div>
            <figcaption className="mt-2 text-xs font-semibold text-ink">
              {def.id} <span className="font-normal text-muted">· {def.category}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function BackgroundsSection(): React.JSX.Element {
  return (
    <section data-section="backgrounds">
      <h2 className="mb-3 text-lg font-bold text-ink">Backgrounds ({BACKGROUND_DEFS.length})</h2>
      <div className="flex flex-col gap-4">
        {BACKGROUND_DEFS.map((def) => (
          <figure
            key={def.id}
            data-background={def.id}
            className="relative overflow-hidden rounded-lg ring-1 ring-line"
          >
            <div className="absolute inset-0" style={backgroundCss(def)} aria-hidden="true" />
            <div
              className="absolute inset-0"
              style={{ background: scrimCss(def) }}
              aria-hidden="true"
            />
            <div className="relative flex flex-wrap items-center gap-4 p-4">
              <div className="rounded-md bg-panel px-3 py-2 ring-1 ring-line">
                <p className="text-sm font-semibold text-ink">Panel · {def.id}</p>
                <p className="text-xs text-muted">{SAMPLE_TEXT}</p>
              </div>
              <p
                className="text-sm font-semibold"
                style={{ color: def.forTheme === 'light' ? '#262522' : '#ffffff' }}
              >
                Bare text on the background — {def.id}
              </p>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

function PresetsSection(): React.JSX.Element {
  return (
    <section data-section="presets">
      <h2 className="mb-3 text-lg font-bold text-ink">Presets ({PRESET_DEFS.length})</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {PRESET_DEFS.map((def) => {
          const board = getBoardThemeDef(def.boardTheme);
          const bg = getBackgroundDef(def.backgroundId);
          if (!board) return null;
          return (
            <figure
              key={def.id}
              data-preset={def.id}
              className="relative overflow-hidden rounded-lg ring-1 ring-line"
            >
              {bg && bg.id !== 'standard' && (
                <>
                  <div className="absolute inset-0" style={backgroundCss(bg)} aria-hidden="true" />
                  <div
                    className="absolute inset-0"
                    style={{ background: scrimCss(bg) }}
                    aria-hidden="true"
                  />
                </>
              )}
              <div className="relative p-3">
                <MiniPreview
                  board={board}
                  pieceSet={def.pieceSet}
                  coordinates="inside"
                  highlightStyle="solid"
                  moveHintStyle="dots"
                  size={30}
                />
                <figcaption className="mt-2 text-xs font-semibold text-ink">{def.id}</figcaption>
                <p className="text-[11px] opacity-80">
                  {def.boardTheme} · {def.pieceSet} · {def.backgroundId} · {def.soundThemeId} ·{' '}
                  {def.animationStyleId}
                </p>
              </div>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

export default function ThemeGalleryClient(): React.JSX.Element {
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => {
    setSection(new URLSearchParams(window.location.search).get('section'));
    document.title = 'Theme Gallery — Chess Review';
  }, []);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="mb-1 text-xl font-black text-ink">Theme Gallery</h1>
      <p className="mb-6 text-sm text-muted">
        Every registered theme asset, rendered from the real definitions. Internal review page —
        piece artwork sources: see the registry provenance file.
      </p>
      {(section === null || section === 'boards') && <BoardsSection />}
      {(section === null || section === 'pieces') && <PiecesSection />}
      {(section === null || section === 'backgrounds') && <BackgroundsSection />}
      {(section === null || section === 'presets') && <PresetsSection />}
    </main>
  );
}
{
}
