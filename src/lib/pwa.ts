// PWA client logic (Prompt 9): pure helpers for the install prompt, the
// iOS Add-to-Home-Screen fallback, and service-worker registration/update
// decisions. Everything here is side-effect-free and unit-tested; the
// components in src/components/pwa/ wire these to the DOM.

/** localStorage flag: the user dismissed the install UI — don't nag again. */
export const INSTALL_DISMISSED_KEY = 'chess-review:install-dismissed';

/** The (non-standard) event Chromium fires when the app is installable. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return event.type === 'beforeinstallprompt' && 'prompt' in event;
}

/** iPhone/iPad/iPod Safari-style user agents (iPadOS desktop UA excluded on purpose: it gets the prompt-less hint only via the touch check below). */
export function isIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * iOS Safari capable of manual Add-to-Home-Screen: iOS UA and not already
 * running standalone. (Chrome-on-iOS etc. also land here — the Share →
 * Add to Home Screen flow exists there too, so the hint stays correct.)
 */
export function isStandaloneDisplay(win: {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: unknown;
}): boolean {
  try {
    const nav = win.navigator as { standalone?: boolean } | undefined;
    if (nav?.standalone === true) return true;
    return win.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}

export type InstallUiState = 'prompt' | 'ios-hint' | 'hidden';

/**
 * Which install UI to show (pure; unit-tested):
 * - a captured beforeinstallprompt wins ('prompt');
 * - otherwise iOS + not standalone gets the manual instructions ('ios-hint');
 * - a dismissal hides both, and standalone installs show nothing.
 */
export function computeInstallUiState(input: {
  hasDeferredPrompt: boolean;
  isIos: boolean;
  standalone: boolean;
  dismissed: boolean;
}): InstallUiState {
  if (input.standalone || input.dismissed) return 'hidden';
  if (input.hasDeferredPrompt) return 'prompt';
  if (input.isIos) return 'ios-hint';
  return 'hidden';
}

/** Register the SW only in production builds; dev unregisters (stale-chunk pain). */
export function shouldRegisterServiceWorker(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/**
 * Registration options for /sw.js (Prompt 2): `updateViaCache: 'none'`
 * makes the browser bypass the HTTP cache entirely when checking for a
 * service-worker update, so a new worker can never hide behind a cached
 * copy of the old script — the HTTP-level `Cache-Control: no-cache` on
 * /sw.js (see next.config.js) is the second half of the same guard for
 * the initial registration fetch. Pure / constant so it is unit-tested.
 */
export function swRegistrationOptions(): { updateViaCache: 'none' } {
  return { updateViaCache: 'none' };
}

/** True once per waiting worker: the page should offer the update reload. */
export function registrationHasWaitingUpdate(reg: { waiting: ServiceWorker | null }): boolean {
  return reg.waiting != null;
}
