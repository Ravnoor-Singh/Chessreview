// Share links (spec Section 11): round-trip + the share-link size
// budget added by the 2026-11-02 security audit
// (share-link-unbounded-pgn-autoload).

import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { MAX_SHARE_PGN_CHARS, pgnFromShareHash, shareUrlForPgn } from '@/lib/export';

const SAMPLE = '[Event "Casual game"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 *';

describe('pgnFromShareHash', () => {
  it('round-trips a normal game PGN through shareUrlForPgn', () => {
    const url = shareUrlForPgn(SAMPLE, 'https://example.test');
    const hash = url.slice(url.indexOf('#'));
    expect(pgnFromShareHash(hash)).toBe(SAMPLE);
  });

  it('returns null when the hash carries no pgn parameter', () => {
    expect(pgnFromShareHash('')).toBeNull();
    expect(pgnFromShareHash('#other=1')).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(pgnFromShareHash('#pgn=%%%not-lz%%%')).toBeNull();
  });

  it('rejects a decompressed payload above the share-link budget', () => {
    const oversized = 'x'.repeat(MAX_SHARE_PGN_CHARS + 1);
    const hash = `#pgn=${compressToEncodedURIComponent(oversized)}`;
    expect(pgnFromShareHash(hash)).toBeNull();
  });

  it('accepts a payload exactly at the budget', () => {
    const atBudget = 'y'.repeat(MAX_SHARE_PGN_CHARS);
    const hash = `#pgn=${compressToEncodedURIComponent(atBudget)}`;
    expect(pgnFromShareHash(hash)).toBe(atBudget);
  });
});
