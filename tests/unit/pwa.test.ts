import { describe, expect, it } from 'vitest';
import { computeInstallUiState, isIosUserAgent, shouldRegisterServiceWorker } from '@/lib/pwa';

describe('computeInstallUiState', () => {
  const base = { hasDeferredPrompt: false, isIos: false, standalone: false, dismissed: false };

  it('shows the real prompt button when beforeinstallprompt was captured', () => {
    expect(computeInstallUiState({ ...base, hasDeferredPrompt: true })).toBe('prompt');
  });

  it('falls back to the iOS hint on iOS without a prompt event', () => {
    expect(computeInstallUiState({ ...base, isIos: true })).toBe('ios-hint');
    expect(computeInstallUiState({ ...base, isIos: true, hasDeferredPrompt: true })).toBe('prompt');
  });

  it('hides everything when standalone or dismissed', () => {
    expect(computeInstallUiState({ ...base, hasDeferredPrompt: true, standalone: true })).toBe(
      'hidden',
    );
    expect(computeInstallUiState({ ...base, isIos: true, dismissed: true })).toBe('hidden');
    expect(computeInstallUiState({ ...base, hasDeferredPrompt: true, dismissed: true })).toBe(
      'hidden',
    );
  });

  it('hides on desktop browsers that never fired the prompt', () => {
    expect(computeInstallUiState(base)).toBe('hidden');
  });
});

describe('isIosUserAgent', () => {
  it('matches iPhone/iPad/iPod and not desktop/Android', () => {
    expect(
      isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),
    ).toBe(true);
    expect(
      isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),
    ).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(false);
    expect(isIosUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe(false);
  });
});

describe('shouldRegisterServiceWorker', () => {
  it('registers in production only', () => {
    expect(shouldRegisterServiceWorker('production')).toBe(true);
    expect(shouldRegisterServiceWorker('development')).toBe(false);
    expect(shouldRegisterServiceWorker('test')).toBe(false);
    expect(shouldRegisterServiceWorker(undefined)).toBe(false);
  });
});
