'use client';

import { useEffect, useRef, useState } from 'react';
import { shouldRegisterServiceWorker } from '@/lib/pwa';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMessages } from '@/i18n/useMessages';

/**
 * Global PWA wiring (Prompt 9), mounted once from the root layout:
 * - registers /sw.js in production only; in development any existing
 *   registration is removed so stale chunks never haunt `next dev`;
 * - when an updated worker is waiting, shows "A new version is available"
 *   with a Reload button (SKIP_WAITING → controllerchange → reload once);
 * - shows a slim offline banner while navigator.onLine is false.
 */
export default function PwaManager() {
  const { t } = useMessages();
  const online = useOnlineStatus();
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const reloadingRef = useRef(false);
  /** Set only when the user clicks Reload on the update banner. */
  const updateRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (!shouldRegisterServiceWorker(process.env.NODE_ENV)) {
      // Dev: make sure no earlier production registration lingers.
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined);
      return;
    }

    let cancelled = false;
    const onControllerChange = () => {
      // The FIRST claim (clients.claim on install) also fires this event —
      // reloading then would loop the first visit. Only a user-requested
      // update takeover reloads the page.
      if (!updateRequestedRef.current || reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (cancelled) return;
        if (reg.waiting) {
          waitingRef.current = reg.waiting;
          setUpdateReady(true);
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              waitingRef.current = reg.waiting ?? installing;
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // Registration failure (e.g. unsupported) must never break the app.
      });
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = () => {
    updateRequestedRef.current = true;
    waitingRef.current?.postMessage({ type: 'SKIP_WAITING' });
    // Fallback: if controllerchange somehow doesn't fire, reload anyway.
    setTimeout(() => {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    }, 1500);
  };

  return (
    <>
      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[70] bg-[#7a4b12] px-4 py-1.5 text-center text-xs font-semibold text-white"
        >
          {t('pwa.offlineBanner')}
        </div>
      )}
      {updateReady && !updateDismissed && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 items-center gap-3 rounded-base border border-line bg-panel2 px-3.5 py-2.5 text-sm font-medium text-ink shadow-xl"
        >
          <span className="flex-1">{t('pwa.updateAvailable')}</span>
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-[0_3px_0_var(--accent-shadow)] active:translate-y-0.5"
          >
            {t('pwa.reload')}
          </button>
          <button
            type="button"
            onClick={() => setUpdateDismissed(true)}
            aria-label={t('pwa.dismissUpdate')}
            className="rounded px-1.5 py-1 text-muted hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
