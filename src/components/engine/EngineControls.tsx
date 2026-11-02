'use client';

import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';

export interface EngineControlsProps {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  depthLabel: string;
  mode: 'multi' | 'single' | 'lite';
  engineName: string;
}

const MODE_LABEL: Record<EngineControlsProps['mode'], MessageKey> = {
  multi: 'engine.modeMulti',
  single: 'engine.modeSingle',
  lite: 'engine.modeLite',
};

export default function EngineControls({
  enabled,
  onToggle,
  depthLabel,
  mode,
  engineName,
}: EngineControlsProps) {
  const { t } = useMessages();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-base bg-panel px-3 py-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('engine.toggleEngine')}
        onClick={() => onToggle(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          enabled ? 'bg-accent' : 'bg-panel2 ring-1 ring-inset ring-line'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            enabled ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
      <span className="text-sm font-semibold text-ink">
        {enabled ? t('engine.engineOn') : t('engine.engineOff')}
      </span>
      <span className="text-xs text-muted">{depthLabel}</span>
      <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] font-semibold text-muted">
        {t(MODE_LABEL[mode])}
      </span>
      <span className="ml-auto truncate text-[11px] text-muted">{engineName}</span>
    </div>
  );
}
