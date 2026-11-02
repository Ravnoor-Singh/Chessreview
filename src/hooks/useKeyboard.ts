'use client';

import { useEffect } from 'react';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Global keyboard shortcuts (spec 10.11). Keys are matched case-insensitively;
 * special keys use their KeyboardEvent.key names ('ArrowLeft', ' ', 'Escape'…).
 * Ignores events while typing in inputs/textareas (except Escape).
 */
export function useKeyboard(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (typing && key !== 'Escape') return;
      const fn = map[key] ?? map[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [map, enabled]);
}
