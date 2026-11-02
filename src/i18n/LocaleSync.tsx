'use client';

// Keeps <html lang> in sync with the active locale (Prompt 10). Mounted
// once from the root layout next to PwaManager.

import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { ensureDictionary, t } from './index';

export default function LocaleSync() {
  const locale = useSettingsStore((s) => s.settings.locale) ?? 'en';
  useEffect(() => {
    document.documentElement.lang = locale;
    // Start the lazy dictionary load as early as possible (Prompt 6);
    // useMessages subscribers re-render when it arrives.
    let cancelled = false;
    let observer: MutationObserver | undefined;
    void ensureDictionary(locale).then(() => {
      if (cancelled) return;
      // Localized metadata (Prompt 10): the static <title>/description in
      // the document head are the English source strings (the app is
      // statically generated and the locale lives client-side, so
      // per-locale generateMetadata cannot vary them per user); once the
      // dictionary is in, localize them in place, and point the PWA
      // manifest link at the per-locale manifest (name/short_name/
      // description/shortcuts localized; icons and start_url shared).
      const applyMetadata = () => {
        document.title = t(locale, 'meta.title');
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute('content', t(locale, 'meta.description'));
        document
          .querySelector('link[rel="manifest"]')
          ?.setAttribute(
            'href',
            locale === 'en' ? '/manifest.webmanifest' : `/manifest.${locale}.webmanifest`,
          );
      };
      applyMetadata();
      // React 19 manages the metadata <title> element and re-asserts the
      // (English) source string when the tree re-renders — on the review
      // page, which re-renders as the review loads, a one-shot write is
      // reverted within seconds (verified by probe: description and
      // manifest stuck, title reverted). Defend the localized title with
      // an observer that re-applies only on divergence.
      const localizedTitle = t(locale, 'meta.title');
      observer = new MutationObserver(() => {
        if (!cancelled && document.title !== localizedTitle) applyMetadata();
      });
      observer.observe(document.head, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [locale]);
  // Dev-only INP instrumentation (Prompt 6): logs the worst interaction
  // latency to the console; production builds never install it.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let disconnect: (() => void) | undefined;
    void import('@/lib/inp').then(({ observeInp }) => {
      disconnect = observeInp((ms) => console.info(`[inp] worst interaction ${ms} ms`));
    });
    return () => disconnect?.();
  }, []);
  return null;
}
