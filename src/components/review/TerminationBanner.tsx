'use client';

import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';
import type { GameTermination, TerminationKind } from '@/lib/types';

const KIND_KEY: Record<TerminationKind, MessageKey> = {
  checkmate: 'termination.bannerCheckmate',
  stalemate: 'termination.bannerStalemate',
  'repetition-threefold': 'termination.bannerRepetitionThreefold',
  'repetition-fivefold': 'termination.bannerRepetitionFivefold',
  'fifty-move': 'termination.bannerFiftyMove',
  'seventyfive-move': 'termination.bannerSeventyFiveMove',
  'insufficient-material': 'termination.bannerInsufficient',
  agreement: 'termination.bannerAgreement',
  resignation: 'termination.bannerResignation',
  timeout: 'termination.bannerTimeout',
  'timeout-vs-insufficient-material': 'termination.bannerTimeoutVsInsufficient',
  abandonment: 'termination.bannerAbandonment',
  forfeit: 'termination.bannerForfeit',
  unfinished: 'termination.bannerUnfinished',
};

/**
 * Localized banner text for a resolved termination. When the mechanism
 * is unknown (detail 'result-only-kind-unknown') the text deliberately
 * states only the outcome ("Alice won" / "Draw"), never a mechanism.
 * Abandonment with no winner reads as a plain "Game abandoned".
 */
export function terminationBannerText(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  termination: GameTermination,
  whiteName: string,
  blackName: string,
): string {
  if (termination.detail === 'result-only-kind-unknown') {
    if (termination.winner) {
      return t('termination.bannerDecisiveUnknown', {
        winner: termination.winner === 'white' ? whiteName : blackName,
      });
    }
    if (termination.result === '1/2-1/2') return t('termination.bannerDrawUnknown');
    return t('termination.bannerUnfinished');
  }
  if (termination.kind === 'abandonment' && !termination.winner) {
    return t('termination.bannerAbandoned');
  }
  const winnerName =
    termination.winner === 'white' ? whiteName : termination.winner === 'black' ? blackName : '';
  return t(KIND_KEY[termination.kind], { winner: winnerName });
}

export interface TerminationBannerProps {
  termination: GameTermination;
  whiteName: string;
  blackName: string;
  /** Compact rendering for the on-board (final position) instance. */
  compact?: boolean;
}

/** Localized result banner: "{winner} won by resignation" / "Draw by repetition" / … */
export default function TerminationBanner({
  termination,
  whiteName,
  blackName,
  compact = false,
}: TerminationBannerProps) {
  const { t } = useMessages();
  const text = terminationBannerText(t, termination, whiteName, blackName);
  return (
    <div
      data-testid="termination-banner"
      role="status"
      aria-label={t('termination.bannerLabel', { text })}
      className={
        compact
          ? 'rounded bg-panel2 px-2 py-1 text-center text-xs font-semibold text-ink'
          : 'border-b border-line bg-panel2 px-4 py-2 text-center text-sm font-semibold text-ink'
      }
    >
      {text}
      {termination.result !== '*' && (
        <span className="ml-2 font-mono text-muted">{termination.result}</span>
      )}
    </div>
  );
}
