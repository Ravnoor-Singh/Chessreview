// Round 2, Prompt 2: client helpers for the archive-search flow.

import { describe, expect, it } from 'vitest';
import {
  getChesscomArchiveMonths,
  ImportApiError,
  searchChesscomArchiveMonth,
  searchChesscomArchives,
} from '@/lib/importApi';

function jsonFetch(body: unknown, status = 200, capture?: (url: string) => void): typeof fetch {
  return (async (url: string) => {
    capture?.(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('archive-search client helpers', () => {
  it('getChesscomArchiveMonths builds the archiveMonths URL', async () => {
    let url = '';
    const months = await getChesscomArchiveMonths(
      'hikaru',
      'en',
      jsonFetch({ months: [{ year: 2026, month: 10 }] }, 200, (u) => (url = u)),
    );
    expect(months).toEqual([{ year: 2026, month: 10 }]);
    expect(url).toContain('op=archiveMonths');
    expect(url).toContain('user=hikaru');
  });

  it('searchChesscomArchiveMonth passes year/month and returns found + pgn', async () => {
    let url = '';
    const out = await searchChesscomArchiveMonth(
      'hikaru',
      '123456789',
      'daily',
      2026,
      5,
      'en',
      jsonFetch({ found: true, pgn: 'PGN', month: '2026-05' }, 200, (u) => (url = u)),
    );
    expect(out).toEqual({ found: true, pgn: 'PGN' });
    expect(url).toContain('op=searchArchives');
    expect(url).toContain('type=daily');
    expect(url).toContain('year=2026&month=5');
  });

  it('searchChesscomArchiveMonth miss is a value, not a throw', async () => {
    const out = await searchChesscomArchiveMonth(
      'hikaru',
      '1',
      'live',
      2026,
      5,
      'en',
      jsonFetch({ found: false, month: '2026-05' }),
    );
    expect(out.found).toBe(false);
  });

  it('searchChesscomArchives returns the PGN and throws taxonomy errors', async () => {
    const ok = await searchChesscomArchives(
      'hikaru',
      '1',
      'live',
      'en',
      jsonFetch({ found: true, pgn: 'PGN' }),
    );
    expect(ok.pgn).toBe('PGN');
    await expect(
      searchChesscomArchives(
        'hikaru',
        '1',
        'live',
        'en',
        jsonFetch({ error: { code: 'GAME_NOT_FOUND', message: 'nope', retryable: false } }, 404),
      ),
    ).rejects.toBeInstanceOf(ImportApiError);
  });
});
