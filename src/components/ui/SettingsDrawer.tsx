'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { EngineBuildPreference } from '@/engine/engineManifest';
import { formatFileSize } from '@/engine/engineManifest';
import { DEPTH_PRESETS, type ClassificationProfileName } from '@/lib/constants';
import type { AnalysisDepth } from '@/lib/types';
import { budgetRulesSummary } from '@/engine/budget';
import { getCacheStats, type CacheStats } from '@/engine/cache';
import { boardThemeTokens } from '@/lib/boardThemes';
import type { CustomBackgroundSettings } from '@/themes/customBackground';
import { PIECE_SETS, pieceSetInfo } from '@/lib/pieces';
import { PieceImage } from '@/components/board/Piece';
import StorageSection from '@/components/ui/StorageSection';
import InstallAppButton from '@/components/pwa/InstallAppButton';
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale, type MessageKey } from '@/i18n';
import type { UserPreset } from '@/themes/userPresets';
import { useMessages } from '@/i18n/useMessages';
import { useEngineAvailability } from '@/hooks/useEngineManifest';
import { findManifestFile, ENGINE_FILES } from '@/engine/engineManifest';

/** Where board coordinates render (Prompt 7; replaces the old boolean). */
export type CoordinatesMode = 'inside' | 'outside' | 'off';

/**
 * Settings shape owned by this file — the coordinator's settings store
 * imports `SettingsState` from here.
 */
export interface SettingsState {
  theme: 'dark' | 'light';
  /** Board theme id — a registry id (src/themes/boards.ts); validated in migration. */
  boardTheme: string;
  /** Piece set id — a registry id (src/themes/pieces.ts); validated in migration. */
  pieceSet: string;
  sounds: boolean;
  coordinates: CoordinatesMode;
  /** Board max-width in px (320–760), applied to review + input boards. */
  boardSizePx: number;
  showArrows: boolean;
  animationMs: number;
  depth: 'quick' | 'standard' | 'deep';
  multiPv: number;
  threads: number;
  hashMb: number;
  parallelWorkers: boolean;
  engineBuild: EngineBuildPreference;
  /** Classification strictness profile (Prompt 4). Optional for persisted-settings compatibility. */
  classification?: ClassificationProfileName;
  /** UI locale (Prompt 10). Optional for persisted-settings compatibility. */
  locale?: Locale;
  /** Page background theme id (Themes & Presets, Stage A). Registry: src/themes/backgrounds.ts. */
  backgroundId: string;
  /** Sound theme id (Themes & Presets, Stage A). Registry: src/themes/sounds.ts. */
  soundThemeId: string;
  /** Piece animation style id (Themes & Presets, Stage A). Registry: src/themes/animations.ts. */
  animationStyleId: string;
  /** How the last-move highlight is drawn (Themes & Presets, Stage A). */
  highlightStyle: 'solid' | 'ring';
  /** How legal-move hints are drawn (Themes & Presets, Stage A). */
  moveHintStyle: 'dots' | 'rings' | 'none';
  /** Favorite theme assets, stored as `<kind>:<id>` (Themes & Presets, Stage A). */
  favorites: string[];
  /** User-created presets (Themes & Presets, Stage A). */
  userPresets: UserPreset[];
  /** Apply a random theme combination whenever a new game review starts. */
  randomizeThemesAfterGame: boolean;
  /** User-built background values (color/gradient/scrim) (Themes & Presets, Stage B). */
  customBackground: CustomBackgroundSettings;
  /** Disable animated page backgrounds (Themes & Presets, Stage B). */
  lowPowerBackgrounds: boolean;
  /** Master volume for move sounds, 0..1 (Themes & Presets, Stage C). */
  soundVolume: number;
  /** Hide all pieces on the board (Themes & Presets, Stage C). */
  blindfoldMode: boolean;
}

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
  onClearCache: () => void;
}

const DEPTH_KEY: Record<AnalysisDepth, MessageKey> = {
  quick: 'input.depthQuick',
  standard: 'input.depthStandard',
  deep: 'input.depthDeep',
};

const THEME_NAME_KEY: Record<string, MessageKey> = {
  green: 'settings.themeGreen',
  brown: 'settings.themeBrown',
  blue: 'settings.themeBlue',
  grey: 'settings.themeGrey',
  purple: 'settings.themePurple',
  wood: 'settings.themeWood',
};

/**
 * The drawer is the QUICK picker: it shows the original six boards
 * (the full 34-board catalogue lives on the /settings page, linked
 * at the top of this drawer).
 */
const QUICK_BOARD_IDS = ['green', 'brown', 'blue', 'grey', 'purple', 'wood'] as const;
/** The drawer stays a quick picker: the original five sets only — the full catalogue lives on the settings page. */
const QUICK_PIECE_IDS = ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast'] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-sm text-ink">{label}</span>
      <span className="flex min-w-0 items-center">{children}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-panel2 ring-1 ring-inset ring-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

const SELECT_CLASS =
  'min-w-0 max-w-full rounded bg-panel2 px-2 py-1.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-accent';
const NUMBER_CLASS =
  'w-20 max-w-full rounded bg-panel2 px-2 py-1.5 text-sm tabular-nums text-ink ring-1 ring-line focus:outline-none focus:ring-accent';

/** Build-preference values in display order ('auto' is always offered). */
const BUILD_OPTIONS = ['auto', 'multi', 'single', 'lite'] as const;

export default function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  onClearCache,
}: SettingsDrawerProps) {
  const { t, locale } = useMessages();
  // prefers-reduced-motion (Prompt 6 audit): framer-motion animations are
  // JS-driven, so the global CSS kill-switch cannot reach them — honor
  // the media query here by removing the slide/fade entirely.
  const reduceMotion = useReducedMotion();
  // Engine availability for THIS deployment (Prompt 7): the manifest lists
  // exactly the builds the active ENGINE_BUNDLE profile shipped. Null =
  // unknown (still loading / manifest unavailable) → offer every build.
  const engineAvailability = useEngineAvailability();
  const shippedModes = engineAvailability?.modes ?? null;
  const liteOnlyDeployment =
    shippedModes !== null && shippedModes.length === 1 && shippedModes[0] === 'lite';
  const buildOptionVisible = (value: (typeof BUILD_OPTIONS)[number]): boolean =>
    value === 'auto' || shippedModes === null || shippedModes.includes(value);
  const savedBuild = settings.engineBuild ?? 'auto';
  // A saved preference for a build this deployment did not ship cannot be
  // honored: display Auto (the loader's manifest-filtered fallback does
  // the same at runtime) without rewriting the saved setting.
  const buildSelectValue = buildOptionVisible(savedBuild) ? savedBuild : 'auto';
  const buildSizeSuffix = (value: (typeof BUILD_OPTIONS)[number]): string => {
    if (value === 'auto' || !engineAvailability) return '';
    const entry = findManifestFile(engineAvailability.manifest, ENGINE_FILES[value].wasm);
    return entry ? ` · ${formatFileSize(entry.size)}` : '';
  };
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  // Cache statistics (position count + approximate size), refreshed when
  // the drawer opens and after a clear.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getCacheStats().then((s) => {
      if (alive) setCacheStats(s);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const handleClearCache = (): void => {
    onClearCache();
    // The clear is fire-and-forget at the call site; re-read shortly after.
    setTimeout(() => {
      void getCacheStats().then(setCacheStats);
    }, 350);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label={t('common.closeSettings')}
            onClick={onClose}
            className="fixed inset-0 z-40 h-full w-full cursor-default bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('common.settings')}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-panel shadow-2xl ring-1 ring-line"
            initial={{ x: reduceMotion ? 0 : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: reduceMotion ? 0 : '100%' }}
            transition={
              reduceMotion ? { duration: 0 } : { type: 'tween', duration: 0.22, ease: 'easeOut' }
            }
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-lg font-bold text-ink">{t('settings.title')}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.closeSettings')}
                className="flex h-8 w-8 items-center justify-center rounded bg-panel2 text-lg text-ink hover:bg-hover"
              >
                ×
              </button>
            </div>

            <div className="border-b border-line px-4 py-2.5">
              <Link
                href="/settings"
                onClick={onClose}
                className="text-sm font-semibold text-accent hover:underline"
              >
                {t('settings.fullSettingsPage')} →
              </Link>
            </div>

            <div className="flex-1 divide-y divide-line overflow-y-auto px-4">
              <section className="py-3" aria-label={t('settings.appearance')}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  {t('settings.appearance')}
                </h3>
                <Row label={t('settings.theme')}>
                  <select
                    className={SELECT_CLASS}
                    value={settings.theme}
                    onChange={(e) => onChange({ theme: e.target.value as SettingsState['theme'] })}
                    aria-label={t('settings.theme')}
                  >
                    <option value="dark">{t('settings.themeDark')}</option>
                    <option value="light">{t('settings.themeLight')}</option>
                  </select>
                </Row>
                <Row label={t('settings.language')}>
                  <select
                    className={SELECT_CLASS}
                    value={settings.locale ?? 'en'}
                    onChange={(e) => onChange({ locale: e.target.value as Locale })}
                    aria-label={t('settings.languageLabel')}
                  >
                    {LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {LOCALE_NATIVE_NAMES[l]}
                        {/* Review status (Prompt 10): English is the source
                            catalogue; the other three are machine-assisted
                            and pending native-speaker review — say so in
                            the list itself, per the honesty rule. */}
                        {l !== 'en' ? ` — ${t('settings.machineAssistedShort')}` : ''}
                      </option>
                    ))}
                  </select>
                </Row>
                <div className="py-2">
                  <span className="text-sm text-ink">{t('settings.boardTheme')}</span>
                  <div
                    className="mt-2 grid grid-cols-3 gap-2"
                    role="group"
                    aria-label={t('settings.boardTheme')}
                  >
                    {QUICK_BOARD_IDS.map((id) => {
                      const tokens = boardThemeTokens(id);
                      const active =
                        settings.boardTheme === id ||
                        (id === 'grey' && settings.boardTheme === 'gray');
                      const name = t(THEME_NAME_KEY[id] ?? 'settings.themeGreen');
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          aria-label={t('settings.boardThemeName', { name })}
                          onClick={() => onChange({ boardTheme: id })}
                          className={`overflow-hidden rounded ring-2 transition ${
                            active ? 'ring-accent' : 'ring-line hover:ring-muted'
                          }`}
                        >
                          <span className="grid grid-cols-2" aria-hidden>
                            <span
                              className="h-6"
                              style={{
                                backgroundColor: tokens.light,
                                backgroundImage: tokens.textureLight,
                              }}
                            />
                            <span
                              className="h-6"
                              style={{
                                backgroundColor: tokens.dark,
                                backgroundImage: tokens.textureDark,
                              }}
                            />
                            <span
                              className="h-6"
                              style={{
                                backgroundColor: tokens.dark,
                                backgroundImage: tokens.textureDark,
                              }}
                            />
                            <span
                              className="h-6"
                              style={{
                                backgroundColor: tokens.light,
                                backgroundImage: tokens.textureLight,
                              }}
                            />
                          </span>
                          <span className="block bg-panel2 py-1 text-center text-[11px] font-semibold text-ink">
                            {name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="py-2">
                  <span className="text-sm text-ink">{t('settings.pieceSet')}</span>
                  <div
                    className="mt-2 grid grid-cols-3 gap-2"
                    role="group"
                    aria-label={t('settings.pieceSet')}
                  >
                    {PIECE_SETS.filter((set) =>
                      (QUICK_PIECE_IDS as readonly string[]).includes(set.id),
                    ).map((set) => {
                      const tokens = boardThemeTokens(settings.boardTheme);
                      const active = settings.pieceSet === set.id;
                      return (
                        <button
                          key={set.id}
                          type="button"
                          aria-pressed={active}
                          aria-label={t('settings.pieceSetName', { name: set.name })}
                          onClick={() => onChange({ pieceSet: set.id })}
                          className={`overflow-hidden rounded ring-2 transition ${
                            active ? 'ring-accent' : 'ring-line hover:ring-muted'
                          }`}
                        >
                          <span className="grid grid-cols-2" aria-hidden>
                            <span
                              className="flex h-10 items-center justify-center"
                              style={{ backgroundColor: tokens.light }}
                            >
                              <span className="block h-9 w-9">
                                <PieceImage piece="wN" pieceSet={set.id} />
                              </span>
                            </span>
                            <span
                              className="flex h-10 items-center justify-center"
                              style={{ backgroundColor: tokens.dark }}
                            >
                              <span className="block h-9 w-9">
                                <PieceImage piece="bQ" pieceSet={set.id} />
                              </span>
                            </span>
                          </span>
                          <span className="block bg-panel2 px-1 py-1 text-center text-[11px] font-semibold leading-tight text-ink">
                            {set.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted">
                    {pieceSetInfo(settings.pieceSet).name} —{' '}
                    {pieceSetInfo(settings.pieceSet).credit}.
                  </p>
                </div>
                <Row label={t('settings.sounds')}>
                  <Toggle
                    checked={settings.sounds}
                    onChange={(v) => onChange({ sounds: v })}
                    label={t('settings.sounds')}
                  />
                </Row>
                <Row label={t('settings.boardCoordinates')}>
                  <select
                    className={SELECT_CLASS}
                    value={settings.coordinates}
                    onChange={(e) => onChange({ coordinates: e.target.value as CoordinatesMode })}
                    aria-label={t('settings.boardCoordinates')}
                  >
                    <option value="inside">{t('settings.coordInside')}</option>
                    <option value="outside">{t('settings.coordOutside')}</option>
                    <option value="off">{t('settings.coordOff')}</option>
                  </select>
                </Row>
                <Row label={t('settings.boardSize', { px: settings.boardSizePx })}>
                  <input
                    type="range"
                    min={320}
                    max={760}
                    step={10}
                    value={settings.boardSizePx}
                    onChange={(e) => onChange({ boardSizePx: Number(e.target.value) })}
                    aria-label={t('settings.boardSizeLabel')}
                    className="w-36 max-w-full accent-[#81b64c]"
                  />
                </Row>
                <Row label={t('settings.bestMoveArrows')}>
                  <Toggle
                    checked={settings.showArrows}
                    onChange={(v) => onChange({ showArrows: v })}
                    label={t('settings.bestMoveArrows')}
                  />
                </Row>
                <Row label={t('settings.animationSpeed', { ms: settings.animationMs })}>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={10}
                    value={settings.animationMs}
                    onChange={(e) => onChange({ animationMs: Number(e.target.value) })}
                    aria-label={t('settings.animationSpeedLabel')}
                    className="w-36 max-w-full accent-[#81b64c]"
                  />
                </Row>
              </section>

              <section className="py-3" aria-label={t('settings.engineSection')}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  {t('settings.engineSection')}
                </h3>
                <Row label={t('settings.analysisDepth')}>
                  <select
                    className={SELECT_CLASS}
                    value={settings.depth}
                    onChange={(e) => onChange({ depth: e.target.value as SettingsState['depth'] })}
                    aria-label={t('settings.analysisDepth')}
                    title={budgetRulesSummary(settings.depth, locale)}
                  >
                    {(Object.keys(DEPTH_PRESETS) as AnalysisDepth[]).map((k) => (
                      <option key={k} value={k} title={budgetRulesSummary(k, locale)}>
                        {t(DEPTH_KEY[k])}
                      </option>
                    ))}
                  </select>
                </Row>
                <p className="py-1 text-[11px] leading-relaxed text-muted">
                  {budgetRulesSummary(settings.depth, locale)} {t('settings.budgetExtra')}
                </p>
                <Row label={t('settings.classification')}>
                  <select
                    className={SELECT_CLASS}
                    value={settings.classification ?? 'balanced'}
                    onChange={(e) =>
                      onChange({ classification: e.target.value as ClassificationProfileName })
                    }
                    aria-label={t('settings.classificationProfile')}
                  >
                    <option value="strict">{t('settings.classificationStrict')}</option>
                    <option value="balanced">{t('settings.classificationBalanced')}</option>
                    <option value="generous">{t('settings.classificationGenerous')}</option>
                  </select>
                </Row>
                <p className="py-1 text-[11px] leading-relaxed text-muted">
                  {t('settings.classificationHelp')}
                </p>
                <Row label={t('settings.engineBuild')}>
                  <select
                    className={SELECT_CLASS}
                    value={buildSelectValue}
                    onChange={(e) =>
                      onChange({ engineBuild: e.target.value as SettingsState['engineBuild'] })
                    }
                    aria-label={t('settings.engineBuild')}
                  >
                    {BUILD_OPTIONS.filter(buildOptionVisible).map((value) => (
                      <option key={value} value={value}>
                        {t(
                          value === 'auto'
                            ? 'settings.buildAuto'
                            : value === 'multi'
                              ? 'settings.buildMulti'
                              : value === 'single'
                                ? 'settings.buildSingle'
                                : 'settings.buildLite',
                        )}
                        {buildSizeSuffix(value)}
                      </option>
                    ))}
                  </select>
                </Row>
                {liteOnlyDeployment ? (
                  <p className="py-1 text-[11px] leading-relaxed text-muted" role="note">
                    {t('settings.engineBundleLiteOnly')}
                  </p>
                ) : null}
                <p className="py-1 text-[11px] leading-relaxed text-muted">
                  {t('settings.engineBuildHelp')}
                </p>
                <Row label={t('settings.linesMultiPv')}>
                  <input
                    type="number"
                    className={NUMBER_CLASS}
                    min={1}
                    max={5}
                    step={1}
                    value={settings.multiPv}
                    onChange={(e) =>
                      onChange({
                        multiPv: Math.max(1, Math.min(5, Math.trunc(Number(e.target.value) || 1))),
                      })
                    }
                    aria-label={t('settings.linesLabel')}
                  />
                </Row>
                <Row label={t('settings.threads')}>
                  <input
                    type="number"
                    className={NUMBER_CLASS}
                    min={1}
                    max={8}
                    step={1}
                    value={settings.threads}
                    onChange={(e) =>
                      onChange({
                        threads: Math.max(1, Math.min(8, Math.trunc(Number(e.target.value) || 1))),
                      })
                    }
                    aria-label={t('settings.threadsLabel')}
                  />
                </Row>
                <Row label={t('settings.hash')}>
                  <input
                    type="number"
                    className={NUMBER_CLASS}
                    min={16}
                    max={512}
                    step={16}
                    value={settings.hashMb}
                    onChange={(e) =>
                      onChange({
                        hashMb: Math.max(
                          16,
                          Math.min(512, Math.trunc(Number(e.target.value) || 16)),
                        ),
                      })
                    }
                    aria-label={t('settings.hashLabel')}
                  />
                </Row>
                <Row label={t('settings.parallelWorkers')}>
                  <Toggle
                    checked={settings.parallelWorkers}
                    onChange={(v) => onChange({ parallelWorkers: v })}
                    label={t('settings.parallelWorkers')}
                  />
                </Row>
                <div className="py-3">
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="rounded bg-panel2 px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:bg-hover"
                  >
                    {t('settings.clearEngineCache')}
                  </button>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {t('settings.cacheHelp')}
                    {cacheStats
                      ? ` ${t('settings.cacheCurrently', { count: cacheStats.count, size: formatFileSize(cacheStats.approxBytes) })}`
                      : ''}
                  </p>
                </div>
              </section>

              <section className="py-3" aria-label={t('settings.storageSection')}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  {t('settings.storageSection')}
                </h3>
                <StorageSection />
              </section>

              <section className="py-3" aria-label={t('settings.appSection')}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  {t('settings.appSection')}
                </h3>
                <InstallAppButton />
                <p className="py-1 text-[11px] leading-relaxed text-muted">
                  {t('settings.appHelp')}
                </p>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
