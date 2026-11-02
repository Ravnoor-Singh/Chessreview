// Round 2, Prompt 10: the native-speaker review workflow's library —
// CSV round-trip fidelity (quotes, commas, Devanagari, embedded
// newlines) and the import validation rules (placeholders, length,
// empty, unknown keys, duplicates). Only rows marked "reviewed" are
// validated deeply; machine-assisted rows pass through untouched.

import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  toCsv,
  validateReviewRows,
  type ReviewRow,
} from '../../scripts/i18n-review-lib.mjs';

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  key: 'moves.bestWas',
  english: 'Best was {best}',
  translation: 'Best was {best}',
  context: 'Move list',
  max_length: '30',
  reviewer: '',
  status: 'reviewed',
  ...over,
});

describe('review CSV round-trip', () => {
  it('preserves quotes, commas, newlines and non-Latin scripts exactly', () => {
    const rows = [
      row({ translation: 'सर्वश्रेष्ठ चाल {best} थी, "वास्तव में"', reviewer: 'A. Reviewer' }),
      row({
        key: 'a.b',
        english: 'line one\nline two',
        translation: 'uno\ndos',
        status: 'machine-assisted',
      }),
      row({ key: 'c.d', english: 'plain', translation: 'ਸਧਾਰਨ' }),
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toEqual(rows);
  });

  it('rejects a file with the wrong header', () => {
    expect(() => parseCsv('a,b,c\n1,2,3\n')).toThrow(/header must be exactly/);
  });
});

describe('validateReviewRows', () => {
  const en = { 'moves.bestWas': 'Best was {best}', 'a.b': 'x' };

  it('accepts a well-formed reviewed row', () => {
    expect(validateReviewRows([row({})], en)).toEqual([]);
  });

  it('flags a dropped placeholder, an empty translation, an over-length translation, an unknown key and a duplicate', () => {
    const problems = validateReviewRows(
      [
        row({ translation: 'No placeholder here' }),
        row({ translation: '   ' }),
        row({ translation: 'This translation is far too long {best}' }),
        row({ key: 'nope.key', translation: 'x' }),
        row({}),
        row({}),
      ],
      en,
    );
    expect(problems.join('\n')).toMatch(/placeholders differ/);
    expect(problems.join('\n')).toMatch(/translation is empty/);
    expect(problems.join('\n')).toMatch(/over the 30 budget/);
    expect(problems.join('\n')).toMatch(/not in the English catalogue/);
    expect(problems.join('\n')).toMatch(/duplicate row/);
  });

  it('does not deeply validate machine-assisted rows (they are not merged)', () => {
    expect(validateReviewRows([row({ status: 'machine-assisted', translation: '' })], en)).toEqual(
      [],
    );
  });
});
