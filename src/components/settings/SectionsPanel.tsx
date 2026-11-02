'use client';

import { DEPTH_PRESETS, type ClassificationProfileName } from '@/lib/constants';
import type { AnalysisDepth } from '@/lib/types';
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale, type MessageKey } from '@/i18n';
import { useMessages } from '@/i18n/useMessages';
import { useSound } from '@/hooks/useSound';
import { SOUND_THEME_DEFS } from '@/themes/sounds';
import type { DraftProps } from './BoardPiecesTabs';
import { Row, Segmented, SELECT_CLASS, Toggle } from './controls';

export type SettingsSection =
  'board-pieces' | 'gameplay' | 'interface' | 'sounds' | 'accessibility' | 'language';

const DEPTH_KEY: Record<AnalysisDepth, MessageKey> = {
  quick: 'input.depthQuick',
  standard: 'input.depthStandard',
  deep: 'input.depthDeep',
};

export function GameplaySection({ draft, patch }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{t('settingsPage.gameplayHelp')}</p>
      <Row label={t('settings.analysisDepth')}>
        <select
          className={SELECT_CLASS}
          value={draft.depth}
          onChange={(e) => patch({ depth: e.target.value as DraftProps['draft']['depth'] })}
          aria-label={t('settings.analysisDepth')}
        >
          {(Object.keys(DEPTH_PRESETS) as AnalysisDepth[]).map((k) => (
            <option key={k} value={k}>
              {t(DEPTH_KEY[k])}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('settings.classification')}>
        <select
          className={SELECT_CLASS}
          value={draft.classification ?? 'balanced'}
          onChange={(e) => patch({ classification: e.target.value as ClassificationProfileName })}
          aria-label={t('settings.classificationProfile')}
        >
          <option value="strict">{t('settings.classificationStrict')}</option>
          <option value="balanced">{t('settings.classificationBalanced')}</option>
          <option value="generous">{t('settings.classificationGenerous')}</option>
        </select>
      </Row>
      <Row label={t('settings.bestMoveArrows')}>
        <Toggle
          checked={draft.showArrows}
          onChange={(v) => patch({ showArrows: v })}
          label={t('settings.bestMoveArrows')}
        />
      </Row>
      <Row label={t('settings.parallelWorkers')}>
        <Toggle
          checked={draft.parallelWorkers}
          onChange={(v) => patch({ parallelWorkers: v })}
          label={t('settings.parallelWorkers')}
        />
      </Row>
    </div>
  );
}

export function InterfaceSection({ draft, patch }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{t('settingsPage.interfaceHelp')}</p>
      <Row label={t('settings.theme')}>
        <Segmented
          label={t('settings.theme')}
          value={draft.theme}
          options={[
            { value: 'dark', label: t('settings.themeDark') },
            { value: 'light', label: t('settings.themeLight') },
          ]}
          onChange={(v) => patch({ theme: v })}
        />
      </Row>
    </div>
  );
}

export function SoundsSection({ draft, patch }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  const { playPreview } = useSound();
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{t('settingsPage.soundsHelp')}</p>
      <Row label={t('settings.sounds')}>
        <Toggle
          checked={draft.sounds}
          onChange={(v) => patch({ sounds: v })}
          label={t('settings.sounds')}
        />
      </Row>
      <Row label={t('settingsPage.soundTheme')}>
        <span className="flex items-center gap-2">
          <Segmented
            label={t('settingsPage.soundTheme')}
            value={draft.soundThemeId}
            options={SOUND_THEME_DEFS.map((d) => ({ value: d.id, label: t(d.labelKey) }))}
            onChange={(v) => patch({ soundThemeId: v })}
          />
          <button
            type="button"
            onClick={() => playPreview('move', draft.soundThemeId, draft.soundVolume)}
            className="rounded bg-panel2 px-2.5 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-hover"
          >
            {t('settingsPage.testSound')}
          </button>
        </span>
      </Row>
      <Row label={t('settingsPage.soundVolume')}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(draft.soundVolume * 100)}
          onChange={(e) => patch({ soundVolume: Number(e.target.value) / 100 })}
          aria-label={t('settingsPage.soundVolume')}
          className="w-44 max-w-full accent-[#81b64c]"
        />
      </Row>
    </div>
  );
}

export function AccessibilitySection({ draft, patch }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{t('settingsPage.accessibilityHelp')}</p>
      <Row label={t('settings.boardCoordinates')}>
        <select
          className={SELECT_CLASS}
          value={draft.coordinates}
          onChange={(e) =>
            patch({ coordinates: e.target.value as DraftProps['draft']['coordinates'] })
          }
          aria-label={t('settings.boardCoordinates')}
        >
          <option value="inside">{t('settings.coordInside')}</option>
          <option value="outside">{t('settings.coordOutside')}</option>
          <option value="off">{t('settings.coordOff')}</option>
        </select>
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
      <Row label={t('settingsPage.lowPowerBackgrounds')}>
        <Toggle
          checked={draft.lowPowerBackgrounds}
          label={t('settingsPage.lowPowerBackgrounds')}
          onChange={(on) => patch({ lowPowerBackgrounds: on })}
        />
      </Row>
    </div>
  );
}

export function LanguageSection({ draft, patch }: DraftProps): React.JSX.Element {
  const { t } = useMessages();
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{t('settingsPage.languageHelp')}</p>
      <Row label={t('settings.language')}>
        <select
          className={SELECT_CLASS}
          value={draft.locale ?? 'en'}
          onChange={(e) => patch({ locale: e.target.value as Locale })}
          aria-label={t('settings.languageLabel')}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NATIVE_NAMES[l]}
              {l !== 'en' ? ` — ${t('settings.machineAssistedShort')}` : ''}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}
