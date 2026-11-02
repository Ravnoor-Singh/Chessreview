// Types for scripts/i18n-review-lib.mjs (review CSV workflow).

export interface ReviewRow {
  key: string;
  english: string;
  translation: string;
  context: string;
  max_length: string;
  reviewer: string;
  status: string;
}

export const CSV_COLUMNS: string[];
export function toCsv(rows: ReviewRow[]): string;
export function parseCsv(text: string): ReviewRow[];
export function placeholdersOf(template: string): string[];
export function validateReviewRows(rows: ReviewRow[], enFlat: Record<string, string>): string[];
