'use client';

import { useEffect, useState } from 'react';
import {
  INSTALL_DISMISSED_KEY,
  computeInstallUiState,
  isBeforeInstallPromptEvent,
  isIosUserAgent,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent,
  type InstallUiState,
} from '@/lib/pwa';
import { useMessages } from '@/i18n/useMessages';

export interface InstallAppButtonProps {
  /** Injectable for tests; defaults to the live navigator UA. */
  userAgent?: string;
  /** Injectable for tests; defaults to the live display-mode check. */
  standalone?: boolean;
}

/**
 * "Install app" UI for the Settings drawer's App section (Prompt 9):
 * - Chromium: captures beforeinstallprompt and shows a real install button
 *   (only when the event actually fired);
 * - iOS Safari (no prompt event exists): one-line Add-to-Home-Screen
 *   instructions behind a button;
 * - dismissal is persisted in localStorage and respected on later visits.
 */
export default function InstallAppButton({ userAgent, standalone }: InstallAppButtonProps) {
  const { t } = useMessages();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(
    () =>
      typeof window !== 'undefined' && window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1',
  );
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event)) return;
      event.preventDefault();
      setDeferred(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const isStandalone =
    standalone ?? (typeof window !== 'undefined' ? isStandaloneDisplay(window) : false);
  const state: InstallUiState = computeInstallUiState({
    hasDeferredPrompt: deferred !== null,
    isIos: isIosUserAgent(ua),
    standalone: isStandalone,
    dismissed,
  });

  if (state === 'hidden') {
    return <p className="text-[11px] leading-relaxed text-muted">{t('pwa.installHidden')}</p>;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // Private mode etc. — dismissal just won't persist.
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        {state === 'prompt' ? (
          <button
            type="button"
            className="rounded bg-accent px-3 py-2 text-sm font-bold text-white shadow-[0_3px_0_var(--accent-shadow)] active:translate-y-0.5"
            onClick={() => {
              const promptEvent = deferred;
              if (!promptEvent) return;
              void promptEvent
                .prompt()
                .then(() => promptEvent.userChoice)
                .then((choice) => {
                  if (choice.outcome === 'accepted') setDeferred(null);
                  dismiss();
                })
                .catch(() => undefined);
            }}
          >
            {t('pwa.installApp')}
          </button>
        ) : (
          <button
            type="button"
            className="rounded bg-panel2 px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:bg-hover"
            aria-expanded={showIosSteps}
            onClick={() => setShowIosSteps((v) => !v)}
          >
            {t('pwa.installApp')}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('pwa.dismissInstall')}
          className="rounded px-2 py-1 text-sm text-muted hover:bg-hover hover:text-ink"
        >
          ✕
        </button>
      </div>
      {state === 'ios-hint' && showIosSteps && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{t('pwa.iosSteps')}</p>
      )}
      {state === 'prompt' && (
        <p className="mt-1.5 text-[11px] text-muted">{t('pwa.installPitch')}</p>
      )}
    </div>
  );
}
