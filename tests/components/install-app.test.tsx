import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import InstallAppButton from '@/components/pwa/InstallAppButton';
import { INSTALL_DISMISSED_KEY } from '@/lib/pwa';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

describe('InstallAppButton (Prompt 9)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the iOS fallback instructions on iPhone Safari (no prompt event exists)', () => {
    render(<InstallAppButton userAgent={IPHONE_UA} standalone={false} />);
    fireEvent.click(screen.getByRole('button', { name: /install app/i }));
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('shows the generic explainer (no install button) on desktop before any prompt event', () => {
    render(<InstallAppButton userAgent={DESKTOP_UA} standalone={false} />);
    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
    expect(screen.getByText(/appears here when the app can be installed/i)).toBeInTheDocument();
  });

  it('respects a persisted dismissal on iOS', () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    render(<InstallAppButton userAgent={IPHONE_UA} standalone={false} />);
    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
  });

  it('shows the real install action once beforeinstallprompt fires', async () => {
    render(<InstallAppButton userAgent={DESKTOP_UA} standalone={false} />);
    const evt = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
    evt.prompt = () => Promise.resolve();
    evt.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    evt.platforms = ['web'];
    fireEvent(window, evt);
    expect(await screen.findByRole('button', { name: /install app/i })).toBeInTheDocument();
    expect(screen.getByText(/offline-ready app/i)).toBeInTheDocument();
  });
});
