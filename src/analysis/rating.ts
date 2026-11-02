// Qualitative performance estimate from game accuracy and ACPL.
//
// Prompt 5 REPLACED the old numeric `estimateRating` (a monotonic
// interpolation over invented anchors, 50% accuracy ≈ 400 … 97% ≈ 2500,
// ± an ACPL nudge) with this qualitative band. The numeric estimate had
// no calibration data behind it, and when real calibration data was
// collected it showed why none can work: over 250 real analysed
// Lichess games (493 player samples, ratings 949–3362; dataset +
// regeneration script in tests/fixtures/rating-dataset/ and
// scripts/make-rating-dataset.mjs) the best fit of rating from
// single-game (accuracy, ACPL) — binned medians, 2-D bins, or OLS —
// leaves a residual SD of ≈430 Elo and an 80% band of ≈ ±490 Elo,
// far wider than the ≈ ±300 at which a point estimate could be called
// meaningful. Single-game accuracy is simply too noisy (and too
// opponent/position dependent) to name a rating. What it CAN honestly
// support is a rough band, labelled as such. See README,
// "How accuracy is computed".

import type { PerformanceEstimate } from '@/lib/types';
import { t, type Locale } from '@/i18n';
import { performanceBandLabel } from '@/i18n/helpers';

/** Accuracy floor for each band, best first. */
const BANDS: {
  band: PerformanceEstimate['band'];
  label: string;
  minAccuracy: number;
  maxAcpl: number;
}[] = [
  { band: 'master', label: 'Master-level play', minAccuracy: 92, maxAcpl: 30 },
  { band: 'expert', label: 'Expert-level play', minAccuracy: 86, maxAcpl: 45 },
  { band: 'strong-club', label: 'Strong club play', minAccuracy: 77, maxAcpl: 70 },
  { band: 'club', label: 'Club-level play', minAccuracy: 60, maxAcpl: 120 },
  { band: 'beginner', label: 'Beginner-level play', minAccuracy: 0, maxAcpl: Infinity },
];

/** Shown wherever a performance band is displayed. */
export const PERFORMANCE_ESTIMATE_NOTE =
  'Rough single-game band from accuracy and average centipawn loss — not a rating.';

/** Localized performance-estimate note (Prompt 10). */
export function performanceEstimateNote(locale: Locale): string {
  return t(locale, 'performance.note');
}

/**
 * The qualitative performance band for one side of one game, from its
 * accuracy (0..100) and average centipawn loss. The band is chosen by
 * accuracy, then demoted one step at a time while the ACPL is worse
 * than the band's ceiling — so the result is monotonic in both inputs
 * (higher accuracy or lower ACPL never lowers the band). Returns null
 * when accuracy is unavailable (too-short game): no band is shown
 * rather than guessing from ACPL alone.
 */
export function performanceLabel(
  accuracy: number | null,
  acpl: number,
  locale: Locale = 'en',
): PerformanceEstimate | null {
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  const safeAcpl = Number.isFinite(acpl) ? Math.max(0, acpl) : Infinity;
  let idx = BANDS.findIndex((b) => accuracy >= b.minAccuracy);
  if (idx < 0) idx = BANDS.length - 1;
  while (idx < BANDS.length - 1 && safeAcpl > BANDS[idx].maxAcpl) idx += 1;
  const { band } = BANDS[idx];
  return { band, label: locale === 'en' ? BANDS[idx].label : performanceBandLabel(locale, band) };
}
