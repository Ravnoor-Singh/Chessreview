'use client';

import { useRef, useState } from 'react';
import { useMessages } from '@/i18n/useMessages';
import { getBackgroundDef } from '@/themes/backgrounds';
import { getBoardThemeDef } from '@/themes/boards';
import { PRESET_DEFS, randomSelection, type PresetDef } from '@/themes/presets';
import {
  addUserPreset,
  createUserPreset,
  duplicateUserPreset,
  removeUserPreset,
  renameUserPreset,
  type UserPreset,
} from '@/themes/userPresets';
import { exportPresetJson, parsePresetImport } from '@/themes/presetTransfer';
import type { ThemeSelection } from '@/themes/types';
import MiniPreview from './MiniPreview';
import { backgroundCss, type DraftProps } from './BoardPiecesTabs';
import { Row, Toggle } from './controls';

function selectionOf(s: ThemeSelection): ThemeSelection {
  return {
    boardTheme: s.boardTheme,
    pieceSet: s.pieceSet,
    backgroundId: s.backgroundId,
    soundThemeId: s.soundThemeId,
    animationStyleId: s.animationStyleId,
  };
}

function sameSelection(a: ThemeSelection, b: ThemeSelection): boolean {
  const x = selectionOf(a);
  const y = selectionOf(b);
  return (
    x.boardTheme === y.boardTheme &&
    x.pieceSet === y.pieceSet &&
    x.backgroundId === y.backgroundId &&
    x.soundThemeId === y.soundThemeId &&
    x.animationStyleId === y.animationStyleId
  );
}

function PresetCard({
  name,
  selection,
  active,
  onApply,
  onPreview,
  onPreviewEnd,
}: {
  name: string;
  selection: ThemeSelection;
  active: boolean;
  onApply: () => void;
  onPreview: () => void;
  onPreviewEnd: () => void;
}): React.JSX.Element {
  const board = getBoardThemeDef(selection.boardTheme);
  const bg = getBackgroundDef(selection.backgroundId);
  if (!board) return <></>;
  return (
    <button
      type="button"
      onClick={onApply}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreview}
      onBlur={onPreviewEnd}
      aria-pressed={active}
      aria-label={name}
      className={`relative overflow-hidden rounded-lg bg-panel text-left ring-2 transition ${
        active ? 'ring-accent' : 'ring-line hover:ring-muted'
      }`}
    >
      <span
        className="flex items-center justify-center px-2 py-3"
        style={bg ? backgroundCss(bg) : undefined}
      >
        <MiniPreview
          board={board}
          pieceSet={selection.pieceSet}
          coordinates="inside"
          highlightStyle="solid"
          moveHintStyle="dots"
          size={22}
        />
      </span>
      <span className="block px-2 py-1.5 text-xs font-semibold text-ink">{name}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-white shadow"
        >
          ✓
        </span>
      )}
    </button>
  );
}

export default function PresetsPanel({ draft, patch, hover }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applySelection = (sel: ThemeSelection): void => {
    patch(selectionOf(sel));
    setNotice(t('settingsPage.presetApplied'));
  };

  const handleImportFile = async (file: File): Promise<void> => {
    const text = await file.text();
    const result = parsePresetImport(text);
    if (!result.ok) {
      setNotice(t('settingsPage.importError'));
      return;
    }
    patch({ userPresets: addUserPreset(draft.userPresets, result.preset) });
    setNotice(
      result.replaced.length > 0
        ? t('settingsPage.importPartial')
        : t('settingsPage.importSuccess'),
    );
  };

  const handleExport = (preset: UserPreset | PresetDef): void => {
    const name = 'name' in preset ? preset.name : t(preset.labelKey);
    const json = exportPresetJson({ ...selectionOf(preset), name });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.preset.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => applySelection(randomSelection())}
          className="rounded bg-accent px-3 py-2 text-sm font-semibold text-[#1c2b0d] transition hover:opacity-90"
        >
          {t('settingsPage.surpriseMe')}
        </button>
        <span className="text-sm text-muted" role="status" aria-live="polite">
          {notice}
        </span>
      </div>
      <Row label={t('settingsPage.randomizeAfterGame')}>
        <Toggle
          checked={draft.randomizeThemesAfterGame}
          label={t('settingsPage.randomizeAfterGame')}
          onChange={(v) => patch({ randomizeThemesAfterGame: v })}
        />
      </Row>

      <h2 className="mb-2 mt-5 text-sm font-bold text-ink">{t('settingsPage.samplePresets')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PRESET_DEFS.map((preset) => (
          <PresetCard
            key={preset.id}
            name={t(preset.labelKey)}
            selection={preset}
            active={sameSelection(draft, preset)}
            onApply={() => applySelection(preset)}
            onPreview={() => hover(selectionOf(preset))}
            onPreviewEnd={() => hover(null)}
          />
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-bold text-ink">{t('settingsPage.myPresets')}</h2>
      {draft.userPresets.length === 0 ? (
        <p className="text-sm text-muted">{t('settingsPage.noUserPresets')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg bg-panel ring-1 ring-line">
          {draft.userPresets.map((preset) => (
            <li key={preset.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {editingId === preset.id ? (
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => {
                    patch({
                      userPresets: renameUserPreset(draft.userPresets, preset.id, editingName),
                    });
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  aria-label={t('settingsPage.presetNameLabel')}
                  className="min-w-0 flex-1 rounded bg-panel2 px-2 py-1 text-sm text-ink ring-1 ring-line"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink"
                  onClick={() => applySelection(preset)}
                  aria-label={t('settingsPage.applyPreset', { name: preset.name })}
                >
                  {preset.name}
                </button>
              )}
              <span className="flex gap-1">
                <button
                  type="button"
                  className="rounded bg-panel2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-hover"
                  onClick={() => {
                    setEditingId(preset.id);
                    setEditingName(preset.name);
                  }}
                >
                  {t('settingsPage.renamePreset')}
                </button>
                <button
                  type="button"
                  className="rounded bg-panel2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-hover"
                  onClick={() =>
                    patch({ userPresets: duplicateUserPreset(draft.userPresets, preset.id) })
                  }
                >
                  {t('settingsPage.duplicatePreset')}
                </button>
                <button
                  type="button"
                  className="rounded bg-panel2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-hover"
                  onClick={() => handleExport(preset)}
                >
                  {t('settingsPage.exportPreset')}
                </button>
                <button
                  type="button"
                  className="rounded bg-panel2 px-2 py-1 text-xs font-medium text-ink ring-1 ring-line hover:bg-hover"
                  onClick={() =>
                    patch({ userPresets: removeUserPreset(draft.userPresets, preset.id) })
                  }
                >
                  {t('settingsPage.deletePreset')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted">
            {t('settingsPage.presetNameLabel')}
          </span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('settingsPage.presetNamePlaceholder')}
            maxLength={60}
            className="min-w-0 rounded bg-panel2 px-2 py-2 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-accent"
          />
        </label>
        <button
          type="button"
          disabled={newName.trim().length === 0}
          onClick={() => {
            patch({
              userPresets: addUserPreset(
                draft.userPresets,
                createUserPreset(newName, selectionOf(draft)),
              ),
            });
            setNewName('');
          }}
          className="rounded bg-accent px-3 py-2 text-sm font-semibold text-[#1c2b0d] transition enabled:hover:opacity-90 disabled:opacity-40"
        >
          {t('settingsPage.createPreset')}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded bg-panel2 px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:bg-hover"
        >
          {t('settingsPage.importPreset')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label={t('settingsPage.importPresetLabel')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="mt-4 text-xs text-muted">{t('settingsPage.originalArtNote')}</p>
    </div>
  );
}
