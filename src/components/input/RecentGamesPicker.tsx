'use client';

import { useMemo, useState } from 'react';
import { useMessages } from '@/i18n/useMessages';
import type { ImportedGameSummary } from '@/lib/types';

export interface RecentGamesPickerProps {
  games: ImportedGameSummary[];
  onPick: (game: ImportedGameSummary) => void;
}

/**
 * Recent-games picker for username browsing (Round 2, Prompt 2): the
 * list plus the filters that were missing — a player-name search box,
 * time-control, result and month filters. Filter options are derived
 * from the games actually present, so an option can never be empty.
 */
export default function RecentGamesPicker({ games, onPick }: RecentGamesPickerProps) {
  const { t } = useMessages();
  const [search, setSearch] = useState('');
  const [timeClass, setTimeClass] = useState('all');
  const [result, setResult] = useState('all');
  const [month, setMonth] = useState('all');

  const timeClasses = useMemo(
    () => [...new Set(games.map((g) => g.timeClass).filter((x): x is string => !!x))].sort(),
    [games],
  );
  const months = useMemo(
    () =>
      [...new Set(games.map((g) => g.date.slice(0, 7)).filter((x) => x.length === 7))]
        .sort()
        .reverse(),
    [games],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      if (q && !`${g.white} ${g.black}`.toLowerCase().includes(q)) return false;
      if (timeClass !== 'all' && g.timeClass !== timeClass) return false;
      if (result !== 'all' && g.result !== result) return false;
      if (month !== 'all' && !g.date.startsWith(month)) return false;
      return true;
    });
  }, [games, search, timeClass, result, month]);

  const hasFilters = search !== '' || timeClass !== 'all' || result !== 'all' || month !== 'all';
  const selectClass =
    'rounded-base border border-line bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none';

  return (
    <div
      className="mt-4 rounded-base border border-line bg-panel2 p-3"
      data-testid="recent-games-picker"
    >
      <p className="mb-2 text-sm font-semibold">{t('input.recentGamesPick')}</p>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="min-w-36 flex-1">
          <label htmlFor="picker-search" className="text-xs font-semibold text-muted">
            {t('input.filterSearchLabel')}
          </label>
          <input
            id="picker-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('input.filterSearchPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 w-full rounded-base border border-line bg-panel px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="picker-timeclass" className="text-xs font-semibold text-muted">
            {t('input.filterTimeControl')}
          </label>
          <select
            id="picker-timeclass"
            value={timeClass}
            onChange={(e) => setTimeClass(e.target.value)}
            className={`mt-1 block ${selectClass}`}
          >
            <option value="all">{t('input.filterAll')}</option>
            {timeClasses.map((tc) => (
              <option key={tc} value={tc}>
                {tc}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="picker-result" className="text-xs font-semibold text-muted">
            {t('input.filterResult')}
          </label>
          <select
            id="picker-result"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            className={`mt-1 block ${selectClass}`}
          >
            <option value="all">{t('input.filterAll')}</option>
            <option value="1-0">{t('input.resultWhiteWins')}</option>
            <option value="0-1">{t('input.resultBlackWins')}</option>
            <option value="1/2-1/2">{t('input.resultDraw')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="picker-month" className="text-xs font-semibold text-muted">
            {t('input.filterMonth')}
          </label>
          <select
            id="picker-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={`mt-1 block ${selectClass}`}
          >
            <option value="all">{t('input.filterAll')}</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setTimeClass('all');
              setResult('all');
              setMonth('all');
            }}
            className="rounded-base border border-line bg-panel px-2 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
          >
            {t('input.clearFilters')}
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted">{t('input.noGamesMatchFilters')}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((g) => (
            <li key={g.id + g.date}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
                onClick={() => onPick(g)}
              >
                <span className="truncate">
                  <strong>{g.white}</strong>
                  {g.whiteElo ? ` (${g.whiteElo})` : ''} vs <strong>{g.black}</strong>
                  {g.blackElo ? ` (${g.blackElo})` : ''}
                </span>
                <span className="shrink-0 text-muted">
                  {g.result} · {g.date}
                  {g.timeClass ? ` · ${g.timeClass}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
