'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SettingsState } from '@/components/ui/SettingsDrawer';
import { PieceImage } from '@/components/board/Piece';
import ThemeFilterDefs, { FilteredSquare } from '@/components/board/ThemeFilterDefs';
import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';
import { ANIMATION_STYLE_DEFS } from '@/themes/animations';
import { BACKGROUND_DEFS, type BackgroundDef } from '@/themes/backgrounds';
import { BOARD_THEME_DEFS, getBoardThemeDef, type BoardThemeDef } from '@/themes/boards';
import {
  clearCustomBackgroundImage,
  downscaleCustomImage,
  loadCustomBackgroundImage,
  saveCustomBackgroundImage,
  validateCustomImageFile,
} from '@/themes/customBackground';
import { favoriteKey, type ThemeKind } from '@/themes/favorites';
import { PIECE_SET_DEFS } from '@/themes/pieces';
import { OptionCard, OptionGrid } from './OptionGrid';
import { Row, Segmented, Toggle } from './controls';

/* ------------------------------------------------------------------ */
/*  Category / search / favorites filtering (Stage B)                  */
/* ------------------------------------------------------------------ */

interface FilterableDef {
  id: string;
  category: string;
  labelKey: MessageKey;
}

interface ThemeFilterState<T extends FilterableDef = FilterableDef> {
  visible: T[];
  categories: string[];
  category: string;
  setCategory: (c: string) => void;
  query: string;
  setQuery: (q: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
}

function useThemeFilter<T extends FilterableDef>(
  defs: readonly T[],
  kind: ThemeKind,
  favorites: readonly string[],
): ThemeFilterState<T> {
  const { t } = useMessages();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const categories = useMemo(() => [...new Set(defs.map((d) => d.category))], [defs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defs.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (favoritesOnly && !favorites.includes(favoriteKey(kind, d.id))) return false;
      if (q && !t(d.labelKey).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [defs, category, favoritesOnly, favorites, kind, query, t]);
  return {
    visible,
    categories,
    category,
    setCategory,
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
  };
}

function ThemeFilterBar({ filter }: { filter: ThemeFilterState }): React.JSX.Element {
  const { t } = useMessages();
  const chip = (active: boolean): string =>
    `rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
      active
        ? 'bg-accent text-[#1c2b0d] ring-accent'
        : 'bg-panel text-muted ring-line hover:text-ink'
    }`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filter.query}
        onChange={(e) => filter.setQuery(e.target.value)}
        placeholder={t('settingsPage.searchThemes')}
        aria-label={t('settingsPage.searchThemesLabel')}
        className="min-w-36 flex-1 rounded-md bg-panel px-3 py-1.5 text-sm text-ink ring-1 ring-line outline-none focus:ring-accent"
      />
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t('settingsPage.categoryFilterLabel')}
      >
        <button
          type="button"
          className={chip(filter.category === 'all')}
          onClick={() => filter.setCategory('all')}
        >
          {t('themes.categories.all')}
        </button>
        {filter.categories.map((c) => (
          <button
            key={c}
            type="button"
            className={chip(filter.category === c)}
            onClick={() => filter.setCategory(c)}
          >
            {t(`themes.categories.${c}` as MessageKey)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filter.favoritesOnly}
          className={chip(filter.favoritesOnly)}
          onClick={() => filter.setFavoritesOnly(!filter.favoritesOnly)}
        >
          ★ {t('settingsPage.favoritesOnly')}
        </button>
      </div>
    </div>
  );
}

function toggleFavorite(
  draft: SettingsState,
  patch: DraftProps['patch'],
  kind: ThemeKind,
  id: string,
): void {
  const key = favoriteKey(kind, id);
  patch({
    favorites: draft.favorites.includes(key)
      ? draft.favorites.filter((f) => f !== key)
      : [...draft.favorites, key],
  });
}

/** Draft-editing props shared by all settings tabs/sections. */
export interface DraftProps {
  draft: SettingsState;
  patch: (p: Partial<SettingsState>) => void;
  /** Hover/focus preview patch for the live preview (null clears it). */
  hover: (p: Partial<SettingsState> | null) => void;
}

export type BoardPiecesTab = 'boards' | 'pieces' | 'background' | 'presets';

/* ------------------------------------------------------------------ */
/*  Boards tab                                                         */
/* ------------------------------------------------------------------ */

function BoardThumb({ tokens }: { tokens: BoardThemeDef['tokens'] }) {
  const sq = (light: boolean): React.CSSProperties => ({
    backgroundColor: light ? tokens.light : tokens.dark,
    backgroundImage: light ? tokens.textureLight : tokens.textureDark,
  });
  const cell = (light: boolean, key: number): React.JSX.Element => (
    <span key={key} className="relative block h-9 overflow-hidden" style={sq(light)}>
      {tokens.filterId ? (
        <FilteredSquare filterId={tokens.filterId} color={light ? tokens.light : tokens.dark} />
      ) : null}
    </span>
  );
  return (
    <span className="grid grid-cols-2" aria-hidden="true">
      {cell(true, 0)}
      {cell(false, 1)}
      {cell(false, 2)}
      {cell(true, 3)}
    </span>
  );
}

const SPEED_TO_MS = { off: 0, slow: 300, normal: 150, fast: 75 } as const;
type SpeedName = keyof typeof SPEED_TO_MS;

function speedNameFor(ms: number): SpeedName {
  if (ms <= 0) return 'off';
  if (ms >= 225) return 'slow';
  if (ms >= 100) return 'normal';
  return 'fast';
}

export function BoardOptions({
  draft,
  patch,
}: Pick<DraftProps, 'draft' | 'patch'>): React.JSX.Element {
  const { t } = useMessages();
  const [lastCoordMode, setLastCoordMode] = useState<'inside' | 'outside'>(
    draft.coordinates === 'outside' ? 'outside' : 'inside',
  );
  const coordsOn = draft.coordinates !== 'off';
  return (
    <section
      aria-label={t('settingsPage.boardOptions')}
      className="mt-6 rounded-lg bg-panel p-4 ring-1 ring-line"
    >
      <h2 className="mb-2 text-sm font-bold text-ink">{t('settingsPage.boardOptions')}</h2>
      <Row label={t('settingsPage.showCoordinates')}>
        <span className="flex items-center gap-3">
          <Toggle
            checked={coordsOn}
            label={t('settingsPage.showCoordinates')}
            onChange={(on) => patch({ coordinates: on ? lastCoordMode : 'off' })}
          />
          <Segmented
            label={t('settings.boardCoordinates')}
            value={draft.coordinates === 'outside' ? 'outside' : 'inside'}
            options={[
              { value: 'inside', label: t('settings.coordInside') },
              { value: 'outside', label: t('settings.coordOutside') },
            ]}
            onChange={(v) => {
              setLastCoordMode(v);
              patch({ coordinates: v });
            }}
          />
        </span>
      </Row>
      <Row label={t('settings.boardSize', { px: draft.boardSizePx })}>
        <input
          type="range"
          min={320}
          max={760}
          step={10}
          value={draft.boardSizePx}
          onChange={(e) => patch({ boardSizePx: Number(e.target.value) })}
          aria-label={t('settings.boardSizeLabel')}
          className="w-44 max-w-full accent-[#81b64c]"
        />
      </Row>
      <Row label={t('settingsPage.highlightStyle')}>
        <Segmented
          label={t('settingsPage.highlightStyle')}
          value={draft.highlightStyle}
          options={[
            { value: 'solid', label: t('settingsPage.highlightSolid') },
            { value: 'ring', label: t('settingsPage.highlightRing') },
          ]}
          onChange={(v) => patch({ highlightStyle: v })}
        />
      </Row>
      <Row label={t('settingsPage.moveHints')}>
        <Segmented
          label={t('settingsPage.moveHints')}
          value={draft.moveHintStyle}
          options={[
            { value: 'dots', label: t('settingsPage.hintsDots') },
            { value: 'rings', label: t('settingsPage.hintsRings') },
            { value: 'none', label: t('settingsPage.hintsNone') },
          ]}
          onChange={(v) => patch({ moveHintStyle: v })}
        />
      </Row>
      <Row label={t('settingsPage.animationSpeed')}>
        <Segmented
          label={t('settingsPage.animationSpeed')}
          value={speedNameFor(draft.animationMs)}
          options={[
            { value: 'off', label: t('settingsPage.speedOff') },
            { value: 'slow', label: t('settingsPage.speedSlow') },
            { value: 'normal', label: t('settingsPage.speedNormal') },
            { value: 'fast', label: t('settingsPage.speedFast') },
          ]}
          onChange={(v) => patch({ animationMs: SPEED_TO_MS[v] })}
        />
      </Row>
      <Row label={t('settingsPage.animationStyle')}>
        <Segmented
          label={t('settingsPage.animationStyle')}
          value={draft.animationStyleId}
          options={ANIMATION_STYLE_DEFS.map((d) => ({ value: d.id, label: t(d.labelKey) }))}
          onChange={(v) => patch({ animationStyleId: v })}
        />
      </Row>
      <Row label={t('settingsPage.blindfoldMode')}>
        <span className="flex items-center gap-2">
          <Toggle
            checked={draft.blindfoldMode}
            onChange={(v) => patch({ blindfoldMode: v })}
            label={t('settingsPage.blindfoldMode')}
          />
          <span className="text-xs text-muted">{t('settingsPage.blindfoldHint')}</span>
        </span>
      </Row>
    </section>
  );
}

export function BoardsTab({ draft, patch, hover }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  const filter = useThemeFilter(BOARD_THEME_DEFS, 'board', draft.favorites);
  const visible = filter.visible;
  const selectedVisible = visible.some(
    (d) => d.id === draft.boardTheme || (d.id === 'grey' && draft.boardTheme === 'gray'),
  );
  return (
    <div>
      <ThemeFilterDefs />
      <ThemeFilterBar filter={filter} />
      {visible.length === 0 ? (
        <p className="py-6 text-sm text-muted">{t('settingsPage.noResultsForFilter')}</p>
      ) : (
        <OptionGrid
          label={t('settings.boardTheme')}
          count={visible.length}
          onSelectByIndex={(i) => {
            const def = visible[i];
            if (def) patch({ boardTheme: def.id });
          }}
        >
          {visible.map((def, i) => (
            <OptionCard
              key={def.id}
              selected={
                draft.boardTheme === def.id || (def.id === 'grey' && draft.boardTheme === 'gray')
              }
              focusable={!selectedVisible && i === 0}
              label={t(def.labelKey)}
              badge={def.flags.lowReadability ? t('settingsPage.lowReadabilityBadge') : undefined}
              onSelect={() => patch({ boardTheme: def.id })}
              onPreview={() => hover({ boardTheme: def.id })}
              onPreviewEnd={() => hover(null)}
              favorite={draft.favorites.includes(favoriteKey('board', def.id))}
              favoriteLabel={t(
                draft.favorites.includes(favoriteKey('board', def.id))
                  ? 'settingsPage.favoriteRemove'
                  : 'settingsPage.favoriteAdd',
              )}
              onToggleFavorite={() => toggleFavorite(draft, patch, 'board', def.id)}
            >
              <BoardThumb tokens={def.tokens} />
            </OptionCard>
          ))}
        </OptionGrid>
      )}
      <BoardOptions draft={draft} patch={patch} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces tab                                                         */
/* ------------------------------------------------------------------ */

export function PiecesTab({ draft, patch, hover }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  const board = getBoardThemeDef(draft.boardTheme);
  const tokens = board?.tokens;
  const filter = useThemeFilter(PIECE_SET_DEFS, 'pieces', draft.favorites);
  const visible = filter.visible;
  const selectedVisible = visible.some((d) => d.id === draft.pieceSet);
  return (
    <div>
      <ThemeFilterBar filter={filter} />
      {visible.length === 0 ? (
        <p className="py-6 text-sm text-muted">{t('settingsPage.noResultsForFilter')}</p>
      ) : (
        <OptionGrid
          label={t('settings.pieceSet')}
          count={visible.length}
          onSelectByIndex={(i) => {
            const def = visible[i];
            if (def) patch({ pieceSet: def.id });
          }}
        >
          {visible.map((def, i) => (
            <OptionCard
              key={def.id}
              selected={draft.pieceSet === def.id}
              focusable={!selectedVisible && i === 0}
              label={t(def.labelKey)}
              badge={def.flags.lowReadability ? t('settingsPage.lowReadabilityBadge') : undefined}
              onSelect={() => patch({ pieceSet: def.id })}
              onPreview={() => hover({ pieceSet: def.id })}
              onPreviewEnd={() => hover(null)}
              favorite={draft.favorites.includes(favoriteKey('pieces', def.id))}
              favoriteLabel={t(
                draft.favorites.includes(favoriteKey('pieces', def.id))
                  ? 'settingsPage.favoriteRemove'
                  : 'settingsPage.favoriteAdd',
              )}
              onToggleFavorite={() => toggleFavorite(draft, patch, 'pieces', def.id)}
            >
              <span className="grid grid-cols-2" aria-hidden="true">
                <span
                  className="flex h-14 items-center justify-center"
                  style={{ backgroundColor: tokens?.light }}
                >
                  <span className="block h-11 w-11">
                    <PieceImage piece="wN" pieceSet={def.id} />
                  </span>
                </span>
                <span
                  className="flex h-14 items-center justify-center"
                  style={{ backgroundColor: tokens?.dark }}
                >
                  <span className="block h-11 w-11">
                    <PieceImage piece="bQ" pieceSet={def.id} />
                  </span>
                </span>
              </span>
            </OptionCard>
          ))}
        </OptionGrid>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Background tab                                                     */
/* ------------------------------------------------------------------ */

export function backgroundCss(def: BackgroundDef): React.CSSProperties {
  return {
    backgroundColor: def.backgroundColor,
    backgroundImage: def.backgroundImage,
    backgroundSize: def.backgroundSize ?? 'cover',
    backgroundPosition: 'center',
  };
}

export function BackgroundTab({ draft, patch, hover }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  const filter = useThemeFilter(BACKGROUND_DEFS, 'background', draft.favorites);
  const visible = filter.visible;
  const selectedVisible = visible.some((d) => d.id === draft.backgroundId);
  const selectedDef = BACKGROUND_DEFS.find((d) => d.id === draft.backgroundId);
  return (
    <div>
      <ThemeFilterBar filter={filter} />
      {visible.length === 0 ? (
        <p className="py-6 text-sm text-muted">{t('settingsPage.noResultsForFilter')}</p>
      ) : (
        <OptionGrid
          label={t('settingsPage.tabBackground')}
          count={visible.length}
          onSelectByIndex={(i) => {
            const def = visible[i];
            if (def) patch({ backgroundId: def.id });
          }}
        >
          {visible.map((def, i) => (
            <OptionCard
              key={def.id}
              selected={draft.backgroundId === def.id}
              focusable={!selectedVisible && i === 0}
              label={t(def.labelKey)}
              badge={def.flags.lowReadability ? t('settingsPage.lowReadabilityBadge') : undefined}
              onSelect={() => patch({ backgroundId: def.id })}
              onPreview={() => hover({ backgroundId: def.id })}
              onPreviewEnd={() => hover(null)}
              favorite={draft.favorites.includes(favoriteKey('background', def.id))}
              favoriteLabel={t(
                draft.favorites.includes(favoriteKey('background', def.id))
                  ? 'settingsPage.favoriteRemove'
                  : 'settingsPage.favoriteAdd',
              )}
              onToggleFavorite={() => toggleFavorite(draft, patch, 'background', def.id)}
            >
              <span className="block h-16" style={backgroundCss(def)} aria-hidden="true" />
            </OptionCard>
          ))}
        </OptionGrid>
      )}
      {selectedDef?.category === 'custom' && <CustomBackgroundEditor draft={draft} patch={patch} />}
      <p className="mt-4 text-sm text-muted">{t('settingsPage.backgroundNote')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom background editor (Stage B)                                 */
/* ------------------------------------------------------------------ */

function CustomBackgroundEditor({
  draft,
  patch,
}: Pick<DraftProps, 'draft' | 'patch'>): React.JSX.Element {
  const { t } = useMessages();
  const cb = draft.customBackground;
  const setCb = (p: Partial<SettingsState['customBackground']>): void =>
    patch({ customBackground: { ...cb, ...p } });
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'idle' | 'stored' | 'type' | 'size' | 'failed'>(
    'idle',
  );

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    void loadCustomBackgroundImage()
      .then((blob) => {
        if (alive && blob) {
          url = URL.createObjectURL(blob);
          setThumbUrl(url);
          setImageStatus('stored');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  const onImageFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const rejection = validateCustomImageFile(file);
    if (rejection) {
      setImageStatus(rejection);
      return;
    }
    try {
      const processed = await downscaleCustomImage(file);
      await saveCustomBackgroundImage(processed);
      setThumbUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(processed);
      });
      setImageStatus('stored');
    } catch {
      setImageStatus('failed');
    }
  };

  const removeImage = async (): Promise<void> => {
    await clearCustomBackgroundImage().catch(() => undefined);
    setThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageStatus('idle');
    patch({ backgroundId: 'standard' });
  };

  const colorInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ): React.JSX.Element => (
    <label className="flex items-center gap-2 text-sm text-ink">
      <span className="w-14">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-14 cursor-pointer rounded bg-panel ring-1 ring-line"
      />
      <span className="text-xs text-muted">{value}</span>
    </label>
  );

  return (
    <section
      aria-label={t('settingsPage.customEditorTitle')}
      className="mt-6 rounded-lg bg-panel p-4 ring-1 ring-line"
    >
      <h2 className="mb-3 text-sm font-bold text-ink">{t('settingsPage.customEditorTitle')}</h2>
      {draft.backgroundId === 'custom-color' && (
        <div className="flex flex-col gap-3">
          {colorInput(t('settingsPage.customColorLabel'), cb.color, (v) => setCb({ color: v }))}
          <span
            aria-hidden="true"
            className="block h-14 rounded ring-1 ring-line"
            style={{ backgroundColor: cb.color }}
          />
        </div>
      )}
      {draft.backgroundId === 'custom-gradient' && (
        <div className="flex flex-col gap-3">
          {colorInput(t('settingsPage.gradientFrom'), cb.gradientFrom, (v) =>
            setCb({ gradientFrom: v }),
          )}
          {colorInput(t('settingsPage.gradientTo'), cb.gradientTo, (v) => setCb({ gradientTo: v }))}
          <Row label={t('settingsPage.gradientAngle')}>
            <span className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={cb.gradientAngle}
                onChange={(e) => setCb({ gradientAngle: Number(e.target.value) })}
                aria-label={t('settingsPage.gradientAngle')}
                className="w-44 max-w-full accent-[#81b64c]"
              />
              <span className="text-xs text-muted">{cb.gradientAngle}°</span>
            </span>
          </Row>
          <span
            aria-hidden="true"
            className="block h-14 rounded ring-1 ring-line"
            style={{
              backgroundImage: `linear-gradient(${cb.gradientAngle}deg, ${cb.gradientFrom}, ${cb.gradientTo})`,
            }}
          />
        </div>
      )}
      {draft.backgroundId === 'custom-image' && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span>{t('settingsPage.uploadImage')}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t('settingsPage.uploadImage')}
              onChange={(e) => void onImageFile(e.target.files?.[0])}
              className="text-sm text-muted"
            />
          </label>
          <p className="text-xs text-muted">{t('settingsPage.imageHint')}</p>
          {thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview of the user's own image
            <img
              src={thumbUrl}
              alt=""
              className="h-24 w-full rounded object-cover ring-1 ring-line"
            />
          )}
          {imageStatus === 'stored' && (
            <p role="status" className="text-xs text-muted">
              {t('settingsPage.imageStored')}
            </p>
          )}
          {(imageStatus === 'type' || imageStatus === 'size' || imageStatus === 'failed') && (
            <p role="alert" className="text-xs font-semibold text-red-500">
              {t(
                imageStatus === 'type'
                  ? 'settingsPage.imageWrongType'
                  : imageStatus === 'size'
                    ? 'settingsPage.imageTooLarge'
                    : 'settingsPage.imageFailed',
              )}
            </p>
          )}
          {thumbUrl && (
            <span>
              <button
                type="button"
                onClick={() => void removeImage()}
                className="rounded-md bg-panel px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-line transition hover:ring-muted"
              >
                {t('settingsPage.removeImage')}
              </button>
            </span>
          )}
        </div>
      )}
      <Row label={t('settingsPage.scrimLabel')}>
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={cb.scrim}
            onChange={(e) => setCb({ scrim: Number(e.target.value) })}
            aria-label={t('settingsPage.scrimLabel')}
            className="w-44 max-w-full accent-[#81b64c]"
          />
          <span className="text-xs text-muted">{Math.round(cb.scrim * 100)}%</span>
        </span>
      </Row>
    </section>
  );
}
