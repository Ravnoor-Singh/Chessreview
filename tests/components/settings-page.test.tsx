import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/components/settings/SettingsPage';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

/**
 * Settings page (Themes & Presets, Stage A): the draft/preview/save
 * model — selections change only the draft until Save; Cancel discards
 * (with a confirm while dirty); tabs, keyboard grid navigation, search
 * and the preset engine all operate on the draft.
 */
beforeEach(() => {
  window.localStorage.clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

function expectChecked(name: string, checked: boolean): void {
  expect(radio(name)).toHaveAttribute('aria-checked', String(checked));
}

describe('settings page — Board & Pieces', () => {
  it('renders the Boards tab by default with the current board selected', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Boards' })).toHaveAttribute('aria-selected', 'true');
    expectChecked('Green', true);
    expectChecked('Purple', false);
    // Save starts disabled: nothing is dirty yet.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('selection changes only the draft until Save (preview-only)', () => {
    render(<SettingsPage />);
    fireEvent.click(radio('Purple'));
    expectChecked('Purple', true);
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    expect(useSettingsStore.getState().settings.boardTheme).toBe('green');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useSettingsStore.getState().settings.boardTheme).toBe('purple');
    expect(screen.getByText('Settings saved.')).toBeInTheDocument();
  });

  it('Cancel discards the draft after confirming', () => {
    render(<SettingsPage />);
    fireEvent.click(radio('Brown'));
    expectChecked('Brown', true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.confirm).toHaveBeenCalled();
    expectChecked('Green', true);
    expect(useSettingsStore.getState().settings.boardTheme).toBe('green');
  });

  it('Esc cancels the draft', () => {
    render(<SettingsPage />);
    fireEvent.click(radio('Blue'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expectChecked('Green', true);
  });

  it('Ctrl+S saves the draft', () => {
    render(<SettingsPage />);
    fireEvent.click(radio('Blue'));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(useSettingsStore.getState().settings.boardTheme).toBe('blue');
  });

  it('arrow keys move focus and selection inside the boards grid', () => {
    render(<SettingsPage />);
    radio('Green').focus();
    fireEvent.keyDown(radio('Green'), { key: 'ArrowRight' });
    expectChecked('Brown', true);
    expect(document.activeElement).toBe(radio('Brown'));
    fireEvent.keyDown(radio('Brown'), { key: 'ArrowLeft' });
    expectChecked('Green', true);
  });

  it('Pieces and Background tabs edit the same draft', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Pieces' }));
    fireEvent.click(radio('Neo'));
    fireEvent.click(screen.getByRole('tab', { name: 'Background' }));
    fireEvent.click(radio('Forest'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const s = useSettingsStore.getState().settings;
    expect(s.pieceSet).toBe('neo');
    expect(s.backgroundId).toBe('forest');
  });

  it('board options: coordinates switch, highlight and hint styles reach the store on Save', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show board coordinates' }));
    fireEvent.click(radio('Ring'));
    fireEvent.click(radio('Rings'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const s = useSettingsStore.getState().settings;
    expect(s.coordinates).toBe('off');
    expect(s.highlightStyle).toBe('ring');
    expect(s.moveHintStyle).toBe('rings');
  });

  it('search finds a theme and applies it to the draft', () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'Purple' } });
    fireEvent.click(screen.getByRole('button', { name: /Purple/ }));
    expectChecked('Purple', true);
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
  });
});

describe('settings page — presets', () => {
  it('applying a sample preset fills the draft; Save persists it', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Warm Wood' }));
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const s = useSettingsStore.getState().settings;
    expect(s.boardTheme).toBe('wood');
    expect(s.pieceSet).toBe('staunton-wood');
    expect(s.backgroundId).toBe('classic');
  });

  it('save current as preset, then duplicate and delete it', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Presets' }));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'My Look' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create preset' }));
    expect(screen.getByRole('button', { name: 'Apply preset My Look' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useSettingsStore.getState().settings.userPresets).toHaveLength(1);
    expect(useSettingsStore.getState().settings.userPresets[0].name).toBe('My Look');

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByRole('button', { name: 'Apply preset My Look (2)' })).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: /Apply preset My Look/ })).not.toBeInTheDocument();
  });
});

describe('settings page — other sections', () => {
  it('Sounds section: switching the sound theme saves through', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sounds' }));
    fireEvent.click(radio('Silent'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useSettingsStore.getState().settings.soundThemeId).toBe('silent');
  });

  it('Gameplay section renders inside the page shell', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Gameplay' }));
    expect(screen.getByLabelText('Analysis depth')).toBeInTheDocument();
  });

  it('preview pane is labelled and present', () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText('Preview')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Preview')).getByText('Preview')).toBeInTheDocument();
  });
});
