// Localized display helpers for domain enums (Prompt 10). The internal
// enum keys stay English everywhere (MoveClass, ClassificationReason,
// performance bands); only their DISPLAY strings come from the catalogue.

import type { ClassificationReason, MoveClass } from '@/lib/types';
import { t, type Locale, type MessageKey } from './index';

export function classificationLabel(locale: Locale, cls: MoveClass): string {
  return t(locale, `classifications.${cls}` as MessageKey);
}

export function classificationPhrase(locale: Locale, cls: MoveClass): string {
  return t(locale, `classificationPhrases.${cls}` as MessageKey);
}

const REASON_KEY: Record<ClassificationReason, MessageKey> = {
  forced: 'feedback.reasonTextForced',
  book: 'feedback.reasonTextBook',
  only_move: 'feedback.reasonTextOnlyMove',
  turning_point: 'feedback.reasonTextTurningPoint',
  critical_moment: 'feedback.reasonTextCriticalMoment',
  mate_threat: 'feedback.reasonTextMateThreat',
  sacrifice_piece: 'feedback.reasonTextSacrificePiece',
  sacrifice_exchange: 'feedback.reasonTextSacrificeExchange',
  sacrifice_queen: 'feedback.reasonTextSacrificeQueen',
  sacrifice_mate: 'feedback.reasonTextSacrificeMate',
  trivial_recapture_blocked: 'feedback.reasonTextTrivialRecapture',
  recapture_not_sacrifice: 'feedback.reasonTextRecapture',
  epl_threshold: 'feedback.reasonTextEplThreshold',
  best_move: 'feedback.reasonTextBestMove',
  missed_tactic: 'feedback.reasonTextMissedTactic',
};

/** Localized "Why this label?" body text for a classification reason. */
export function reasonText(
  locale: Locale,
  reason: ClassificationReason | undefined,
): string | undefined {
  if (!reason) return undefined;
  const key = REASON_KEY[reason];
  return key ? t(locale, key) : undefined;
}

export type PerformanceBand = 'beginner' | 'club' | 'strong-club' | 'expert' | 'master';

const BAND_KEY: Record<PerformanceBand, MessageKey> = {
  master: 'performance.master',
  expert: 'performance.expert',
  'strong-club': 'performance.strongClub',
  club: 'performance.club',
  beginner: 'performance.beginner',
};

export function performanceBandLabel(locale: Locale, band: PerformanceBand): string {
  return t(locale, BAND_KEY[band]);
}
