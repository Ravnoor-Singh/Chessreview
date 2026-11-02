'use client';

// React access to the i18n catalogue (Prompt 10): a small hook reading
// the locale straight from the settings store (Zustand) — no new context
// provider. Returns the active dictionary plus a locale-bound `t` and
// Intl formatters, so components never thread locale props by hand.

import { useEffect, useReducer } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import {
  ensureDictionary,
  getDictionary,
  onDictionaryLoaded,
  formatDate as fmtDate,
  formatDecimal1 as fmtDec1,
  formatNumber as fmtNum,
  formatPercentFraction as fmtPct,
  t as translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Messages,
} from './index';

export interface MessagesApi {
  locale: Locale;
  messages: Messages;
  t: (key: MessageKey, params?: MessageParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDecimal1: (value: number) => string;
  formatPercentFraction: (fraction: number) => string;
  formatDate: (date: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

export function useMessages(): MessagesApi {
  const locale: Locale = useSettingsStore((s) => s.settings.locale) ?? 'en';
  // Lazy dictionaries (Prompt 6): trigger the active locale's load and
  // re-render when any dictionary lands, so components swap from the
  // English fallback to the real catalogue without a reload.
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onDictionaryLoaded(bump), []);
  useEffect(() => {
    void ensureDictionary(locale);
  }, [locale]);
  return {
    locale,
    messages: getDictionary(locale),
    t: (key, params) => translate(locale, key, params),
    formatNumber: (value, options) => fmtNum(locale, value, options),
    formatDecimal1: (value) => fmtDec1(locale, value),
    formatPercentFraction: (fraction) => fmtPct(locale, fraction),
    formatDate: (date, options) => fmtDate(locale, date, options),
  };
}
