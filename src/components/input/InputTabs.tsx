'use client';

import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';

export type InputTab = 'pgn' | 'fen' | 'link' | 'image';

export interface InputTabsProps {
  tab: InputTab;
  onChange: (tab: InputTab) => void;
}

const TABS: { id: InputTab; labelKey: MessageKey }[] = [
  { id: 'pgn', labelKey: 'input.tabPgn' },
  { id: 'fen', labelKey: 'input.tabFen' },
  { id: 'link', labelKey: 'input.tabLink' },
  { id: 'image', labelKey: 'input.tabImage' },
];

export default function InputTabs({ tab, onChange }: InputTabsProps) {
  const { t } = useMessages();
  return (
    <div
      className="flex flex-wrap gap-1 rounded-base bg-panel p-1"
      role="tablist"
      aria-label={t('input.inputMethodLabel')}
    >
      {TABS.map((tabDef) => {
        const active = tabDef.id === tab;
        return (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tabDef.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-panel2 text-white shadow-sm ring-1 ring-line'
                : 'text-muted hover:bg-hover hover:text-ink'
            }`}
          >
            {t(tabDef.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
