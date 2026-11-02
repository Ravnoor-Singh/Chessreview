// Review-workflow library (Round 2, Prompt 10): CSV serialization and
// validation for the native-speaker review round-trip.
//
// A reviewer gets i18n/review/<locale>.csv with columns:
//   key, english, translation, context, max_length, reviewer, status
// They edit `translation`, fill `reviewer`, and set `status` to
// `reviewed`. The import script validates every row before merging:
//   - key must exist in the English catalogue,
//   - translation must be non-empty,
//   - placeholders must match the English string's placeholder set
//     EXACTLY (a dropped {san} would break rendering),
//   - translation length must be <= max_length when one is set
//     (a guidance budget for UI strings, ~1.3x the English length).
// Only rows whose status is `reviewed` are merged; anything else is
// carried as machine-assisted and left untouched.

export const CSV_COLUMNS = [
  'key',
  'english',
  'translation',
  'context',
  'max_length',
  'reviewer',
  'status',
];

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/** Minimal RFC-4180 parser: quoted fields, embedded commas/quotes/newlines. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let sawAny = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === ',') pushField();
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim());
  if (header.join(',') !== CSV_COLUMNS.join(','))
    throw new Error(`CSV header must be exactly: ${CSV_COLUMNS.join(',')}`);
  return rows
    .slice(1)
    .filter((cells) => cells.length === CSV_COLUMNS.length)
    .map((cells) => Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, cells[i]])));
}

export function placeholdersOf(template) {
  const names = new Set();
  for (const match of String(template).matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)) names.add(match[1]);
  return [...names].sort();
}

/**
 * Validate parsed rows against the flattened English catalogue.
 * Returns a list of human-readable problems (empty = valid).
 */
export function validateReviewRows(rows, enFlat) {
  const problems = [];
  const seen = new Set();
  for (const row of rows) {
    const where = `key "${row.key}"`;
    if (!(row.key in enFlat)) {
      problems.push(`${where}: not in the English catalogue`);
      continue;
    }
    if (seen.has(row.key)) problems.push(`${where}: duplicate row`);
    seen.add(row.key);
    if (row.status !== 'reviewed') continue; // only reviewed rows are merged/validated deeply
    const translation = row.translation ?? '';
    if (translation.trim().length === 0) problems.push(`${where}: translation is empty`);
    const want = placeholdersOf(enFlat[row.key]);
    const got = placeholdersOf(translation);
    if (want.join('|') !== got.join('|'))
      problems.push(
        `${where}: placeholders differ — English has {${want.join('}, {')}}, translation has {${got.join('}, {')}}`,
      );
    const max = Number(row.max_length);
    if (Number.isFinite(max) && max > 0 && [...translation].length > max)
      problems.push(
        `${where}: translation is ${[...translation].length} chars, over the ${max} budget`,
      );
  }
  return problems;
}
