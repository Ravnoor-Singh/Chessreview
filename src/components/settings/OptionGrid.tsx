'use client';

import { useRef, type ReactNode } from 'react';

/**
 * Radio-grid primitives for the settings page (Themes & Presets,
 * Stage A). The grid follows the WAI-ARIA radiogroup pattern: one tab
 * stop (the selected card), arrow keys move focus AND selection,
 * Home/End jump to the ends. Each card shows a check mark when
 * selected.
 */
export function OptionGrid({
  label,
  children,
  onSelectByIndex,
  count,
}: {
  label: string;
  children: ReactNode;
  /** Called with the index to select when arrow/Home/End keys move. */
  onSelectByIndex: (index: number) => void;
  count: number;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    let next = current;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (current - 1 + buttons.length) % buttons.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = buttons.length - 1;
    onSelectByIndex(next);
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      data-count={count}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {children}
    </div>
  );
}

export function OptionCard({
  selected,
  label,
  badge,
  onSelect,
  onPreview,
  onPreviewEnd,
  favorite,
  onToggleFavorite,
  favoriteLabel,
  focusable,
  children,
}: {
  selected: boolean;
  label: string;
  badge?: string;
  onSelect: () => void;
  /** Force this card to be the grid's tab stop (e.g. first visible card in a filtered grid). */
  focusable?: boolean;
  /** Hover/focus preview: show this option in the live preview without selecting it. */
  onPreview?: () => void;
  onPreviewEnd?: () => void;
  /** Favorite state; when onToggleFavorite is set a star toggle is overlaid. */
  favorite?: boolean;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  children: ReactNode;
}): React.JSX.Element {
  const card = (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      tabIndex={focusable || selected ? 0 : -1}
      onClick={onSelect}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreview}
      onBlur={onPreviewEnd}
      className={`group relative block w-full overflow-hidden rounded-lg bg-panel text-left ring-2 transition ${
        selected ? 'ring-accent' : 'ring-line hover:ring-muted'
      }`}
    >
      {children}
      <span className="block px-2 py-1.5">
        <span className="block truncate text-xs font-semibold text-ink">{label}</span>
        {badge && <span className="block text-[10px] font-medium text-muted">{badge}</span>}
      </span>
      {selected && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-white shadow"
        >
          ✓
        </span>
      )}
    </button>
  );
  if (!onToggleFavorite) return card;
  // The star is a SIBLING overlay button (never nested inside the radio
  // button — nested interactive elements are invalid and fail axe).
  return (
    <div className="relative">
      {card}
      <button
        type="button"
        aria-pressed={favorite === true}
        aria-label={favoriteLabel ?? label}
        title={favoriteLabel ?? label}
        onClick={onToggleFavorite}
        className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm shadow transition ${
          favorite ? 'bg-accent text-white' : 'bg-black/45 text-white/85 hover:bg-black/65'
        }`}
      >
        <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
      </button>
    </div>
  );
}
