'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MessageKey } from '@/i18n';
import { useMessages } from '@/i18n/useMessages';
import { useSettingsStore } from '@/store/settingsStore';
import type { SettingsState } from '@/components/ui/SettingsDrawer';
import { getBackgroundDef } from '@/themes/backgrounds';
import { BOARD_THEME_DEFS, getBoardThemeDef } from '@/themes/boards';
import { PIECE_SET_DEFS } from '@/themes/pieces';
import { BACKGROUND_DEFS } from '@/themes/backgrounds';
import { PRESET_DEFS } from '@/themes/presets';
import MiniPreview from './MiniPreview';
import {
  BackgroundTab,
  BoardsTab,
  PiecesTab,
  backgroundCss,
  type BoardPiecesTab,
} from './BoardPiecesTabs';
import PresetsPanel from './PresetsPanel';
import {
  AccessibilitySection,
  GameplaySection,
  InterfaceSection,
  LanguageSection,
  SoundsSection,
  type SettingsSection,
} from './SectionsPanel';

const SECTIONS: { id: SettingsSection; labelKey: MessageKey }[] = [
  { id: 'board-pieces', labelKey: 'settingsPage.navBoardPieces' },
  { id: 'gameplay', labelKey: 'settingsPage.navGameplay' },
  { id: 'interface', labelKey: 'settingsPage.navInterface' },
  { id: 'sounds', labelKey: 'settingsPage.navSounds' },
  { id: 'accessibility', labelKey: 'settingsPage.navAccessibility' },
  { id: 'language', labelKey: 'settingsPage.navLanguage' },
];

const TABS: { id: BoardPiecesTab; labelKey: MessageKey }[] = [
  { id: 'boards', labelKey: 'settingsPage.tabBoards' },
  { id: 'pieces', labelKey: 'settingsPage.tabPieces' },
  { id: 'background', labelKey: 'settingsPage.tabBackground' },
  { id: 'presets', labelKey: 'settingsPage.tabPresets' },
];

interface SearchEntry {
  label: string;
  hint: string;
  go: () => void;
}

export default function SettingsPage(): React.JSX.Element {
  const { t } = useMessages();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState<SettingsState>(settings);
  const [section, setSection] = useState<SettingsSection>('board-pieces');
  const [tab, setTab] = useState<BoardPiecesTab>('boards');
  const [query, setQuery] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const touched = useRef(false);

  // Until the user edits, the draft follows the store (persist
  // rehydration and changes made elsewhere, e.g. the quick drawer).
  useEffect(() => {
    if (!touched.current) setDraft(settings);
  }, [settings]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  );

  const patch = (p: Partial<SettingsState>): void => {
    touched.current = true;
    setSavedNotice(false);
    setDraft((d) => ({ ...d, ...p }));
  };

  // Hover/focus preview: cards report a temporary patch that only the
  // preview pane reflects; the draft itself changes on click/select.
  const [hoverPatch, setHoverPatch] = useState<Partial<SettingsState> | null>(null);
  const hover = (p: Partial<SettingsState> | null): void => setHoverPatch(p);
  const previewDraft: SettingsState = hoverPatch ? { ...draft, ...hoverPatch } : draft;

  const save = (): void => {
    update(draft);
    touched.current = false;
    setSavedNotice(true);
  };

  const cancel = (): void => {
    if (dirty && !window.confirm(t('settingsPage.discardConfirm'))) return;
    touched.current = false;
    setDraft(settings);
  };

  // Unsaved-changes guards: browser unload, in-app link navigation,
  // Esc (cancel) and Ctrl/Cmd+S (save).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent): void => {
      const anchor = (e.target as HTMLElement).closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('/settings')) return;
      if (!window.confirm(t('settingsPage.discardConfirm'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        cancel();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, settings]);

  const searchEntries = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];
    for (const s of SECTIONS) {
      entries.push({
        label: t(s.labelKey),
        hint: t('settingsPage.title'),
        go: () => setSection(s.id),
      });
    }
    for (const def of BOARD_THEME_DEFS) {
      entries.push({
        label: t(def.labelKey),
        hint: t('settingsPage.tabBoards'),
        go: () => {
          setSection('board-pieces');
          setTab('boards');
          patch({ boardTheme: def.id });
        },
      });
    }
    for (const def of PIECE_SET_DEFS) {
      entries.push({
        label: t(def.labelKey),
        hint: t('settingsPage.tabPieces'),
        go: () => {
          setSection('board-pieces');
          setTab('pieces');
          patch({ pieceSet: def.id });
        },
      });
    }
    for (const def of BACKGROUND_DEFS) {
      entries.push({
        label: t(def.labelKey),
        hint: t('settingsPage.tabBackground'),
        go: () => {
          setSection('board-pieces');
          setTab('background');
          patch({ backgroundId: def.id });
        },
      });
    }
    for (const def of PRESET_DEFS) {
      entries.push({
        label: t(def.labelKey),
        hint: t('settingsPage.tabPresets'),
        go: () => {
          setSection('board-pieces');
          setTab('presets');
          patch({
            boardTheme: def.boardTheme,
            pieceSet: def.pieceSet,
            backgroundId: def.backgroundId,
            soundThemeId: def.soundThemeId,
            animationStyleId: def.animationStyleId,
          });
        },
      });
    }
    return entries;
  }, [t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchEntries.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, searchEntries]);

  const draftBoard = getBoardThemeDef(previewDraft.boardTheme);
  const draftBackground = getBackgroundDef(previewDraft.backgroundId);

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="mx-auto w-full max-w-6xl px-4 py-5">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-ink hover:underline">
            <span aria-hidden="true" className="text-accent">
              ←{' '}
            </span>
            {t('common.appName')}
          </Link>
          <h1 className="text-2xl font-black">{t('settingsPage.title')}</h1>
          <div className="relative ml-auto w-full max-w-xs">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settingsPage.searchPlaceholder')}
              aria-label={t('settingsPage.searchLabel')}
              className="w-full rounded-lg bg-panel px-3 py-2 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-accent"
            />
            {query.trim() && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-panel shadow-xl ring-1 ring-line">
                {results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted">
                    {t('settingsPage.searchNoResults')}
                  </p>
                ) : (
                  results.map((r, i) => (
                    <button
                      key={`${r.label}-${i}`}
                      type="button"
                      onClick={() => {
                        r.go();
                        setQuery('');
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                    >
                      <span>{r.label}</span>
                      <span className="text-xs text-muted">{r.hint}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        {/* Mobile section picker (the sidebar collapses to a select). */}
        <label className="mt-4 block md:hidden">
          <span className="sr-only">{t('settingsPage.navLabel')}</span>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SettingsSection)}
            className="w-full rounded-lg bg-panel px-3 py-2 text-sm text-ink ring-1 ring-line"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex gap-6">
          <nav aria-label={t('settingsPage.navLabel')} className="hidden w-48 shrink-0 md:block">
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    aria-current={section === s.id ? 'page' : undefined}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      section === s.id
                        ? 'bg-panel2 text-ink ring-1 ring-line'
                        : 'text-muted hover:bg-hover hover:text-ink'
                    }`}
                  >
                    {t(s.labelKey)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <main className="min-w-0 flex-1">
            {section === 'board-pieces' && (
              <div className="flex flex-col gap-6 xl:flex-row">
                <div className="min-w-0 flex-1">
                  <div
                    role="tablist"
                    aria-label={t('settingsPage.tabsLabel')}
                    className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-panel p-1 ring-1 ring-line"
                  >
                    {TABS.map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === tb.id}
                        onClick={() => setTab(tb.id)}
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                          tab === tb.id
                            ? 'bg-accent text-[#1c2b0d]'
                            : 'text-muted hover:bg-hover hover:text-ink'
                        }`}
                      >
                        {t(tb.labelKey)}
                      </button>
                    ))}
                  </div>
                  {tab === 'boards' && <BoardsTab draft={draft} patch={patch} hover={hover} />}
                  {tab === 'pieces' && <PiecesTab draft={draft} patch={patch} hover={hover} />}
                  {tab === 'background' && (
                    <BackgroundTab draft={draft} patch={patch} hover={hover} />
                  )}
                  {tab === 'presets' && <PresetsPanel draft={draft} patch={patch} hover={hover} />}
                </div>
                <aside
                  aria-label={t('settingsPage.preview')}
                  className="shrink-0 xl:sticky xl:top-5 xl:self-start"
                >
                  <div
                    className="relative overflow-hidden rounded-lg p-4 ring-1 ring-line"
                    style={draftBackground ? backgroundCss(draftBackground) : undefined}
                  >
                    {draftBackground && draftBackground.scrim.opacity > 0 && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          backgroundColor: draftBackground.scrim.color,
                          opacity: draftBackground.scrim.opacity,
                        }}
                      />
                    )}
                    <div className="relative">
                      <h2
                        className="mb-3 text-xs font-semibold"
                        style={{
                          // The preview frame is painted with the draft
                          // background (dark for 'standard'), so the label
                          // color follows the background's own theme.
                          color: draftBackground?.forTheme === 'light' ? '#45423b' : '#b8b4aa',
                        }}
                      >
                        {t('settingsPage.preview')}
                      </h2>
                      {draftBoard && (
                        <MiniPreview
                          board={draftBoard}
                          pieceSet={previewDraft.pieceSet}
                          coordinates={previewDraft.coordinates}
                          highlightStyle={previewDraft.highlightStyle}
                          moveHintStyle={previewDraft.moveHintStyle}
                        />
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            )}
            {section === 'gameplay' && (
              <GameplaySection draft={draft} patch={patch} hover={hover} />
            )}
            {section === 'interface' && (
              <InterfaceSection draft={draft} patch={patch} hover={hover} />
            )}
            {section === 'sounds' && <SoundsSection draft={draft} patch={patch} hover={hover} />}
            {section === 'accessibility' && (
              <AccessibilitySection draft={draft} patch={patch} hover={hover} />
            )}
            {section === 'language' && (
              <LanguageSection draft={draft} patch={patch} hover={hover} />
            )}

            <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-line bg-page/95 py-3 backdrop-blur">
              <span className="text-sm text-muted" role="status" aria-live="polite">
                {dirty
                  ? t('settingsPage.unsavedChanges')
                  : savedNotice
                    ? t('settingsPage.saved')
                    : ''}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg bg-panel2 px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#1c2b0d] transition enabled:hover:opacity-90 disabled:opacity-40"
                >
                  {t('settingsPage.save')}
                </button>
              </span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
