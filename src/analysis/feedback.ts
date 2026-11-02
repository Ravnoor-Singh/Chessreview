// Coach-style feedback text for a classified move (spec 10.7).
// Fully deterministic: the same input always yields the same sentences.
//
// Prompt 10 (i18n): every sentence is a WHOLE-SENTENCE template from the
// message catalogue (src/i18n) with placeholders for move/SAN/eval
// values — no fragment concatenation that assumes English word order.
// `deriveReason` now returns a machine-readable key, and the feedback
// generator maps it to a complete localized sentence per locale.

import { Chess } from 'chess.js';
import { PIECE_VALUES } from '@/lib/constants';
import type { ClassificationReason, MoveClass } from '@/lib/types';
import { parseUci } from '@/lib/san';
import { t, type Locale, type MessageKey } from '@/i18n';
import { reasonText } from '@/i18n/helpers';
import { seeForMove } from './sacrifice';

export interface FeedbackInput {
  san: string;
  classification: MoveClass;
  /** Machine-readable classification reason (Prompt 4 explainability). */
  classificationReason?: ClassificationReason;
  bestMoveSan?: string;
  bestEvalText?: string;
  epl: number;
  /** Evaluation lost by the move, in pawns (positive = the mover got worse). */
  evalSwingPawns: number;
  bookName?: string;
  bookEco?: string;
  fenBefore: string;
  moveUci: string;
  pvSan: string[];
  /** UI locale for the generated sentences (default 'en'). */
  locale?: Locale;
}

export interface Feedback {
  headline: string;
  detail?: string;
}

/** What the BEST move achieves, as a machine-readable key (Prompt 10). */
export type ReasonKey =
  | 'mate'
  | 'avoidsMate'
  | 'winsPiece'
  | 'winsExchange'
  | 'winsPawn'
  | 'winsMaterial'
  | 'strongAttack';

const REASON_SENTENCE: Record<ReasonKey, MessageKey> = {
  mate: 'feedback.reasonMate',
  avoidsMate: 'feedback.reasonAvoidsMate',
  winsPiece: 'feedback.reasonWinsPiece',
  winsExchange: 'feedback.reasonWinsExchange',
  winsPawn: 'feedback.reasonWinsPawn',
  winsMaterial: 'feedback.reasonWinsMaterial',
  strongAttack: 'feedback.reasonStrongAttack',
};

/** True when the side to move in `fen` has a move that delivers checkmate. */
function hasMateInOne(fen: string): boolean {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return false;
  }
  for (const move of chess.moves({ verbose: true })) {
    try {
      const copy = new Chess(fen);
      copy.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (copy.isCheckmate()) return true;
    } catch {
      // ignore an unplayable verbose move
    }
  }
  return false;
}

/**
 * Detect what the BEST move achieves, from the position. Returns a
 * ReasonKey (localized into a whole sentence by the feedback generator),
 * or undefined when nothing concrete is detected.
 */
export function deriveReason(
  fenBefore: string,
  moveUci: string,
  bestUci: string,
): ReasonKey | undefined {
  if (!bestUci) return undefined;
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return undefined;
  }
  const best = parseUci(bestUci);
  let bestMove: ReturnType<Chess['move']>;
  try {
    bestMove = chess.move({ from: best.from, to: best.to, promotion: best.promotion });
  } catch {
    return undefined;
  }
  const fenAfterBest = chess.fen();

  if (chess.isCheckmate()) return 'mate';

  // Avoids mate: the played move lets the opponent mate next move, the
  // best move does not. (Only mate-in-1 is detectable without a PV.)
  const playedFen = (() => {
    if (!moveUci || moveUci === bestUci) return undefined;
    try {
      const copy = new Chess(fenBefore);
      const played = parseUci(moveUci);
      copy.move({ from: played.from, to: played.to, promotion: played.promotion });
      return copy.fen();
    } catch {
      return undefined;
    }
  })();
  if (playedFen && hasMateInOne(playedFen) && !hasMateInOne(fenAfterBest)) {
    return 'avoidsMate';
  }

  if (bestMove.captured) {
    const net = seeForMove(fenBefore, bestUci);
    const capturedValue = PIECE_VALUES[bestMove.captured] ?? 0;
    if (net >= 3) return 'winsPiece';
    if (net === 2 && capturedValue >= 3) return 'winsExchange';
    if (net >= 1 && bestMove.captured === 'p') return 'winsPawn';
    if (net >= 1) return 'winsMaterial';
  }

  if (bestMove.san.includes('+')) return 'strongAttack';
  return undefined;
}

/** Convert a SAN best move in `fenBefore` to UCI for deriveReason. */
function sanToUci(fenBefore: string, san: string): string | undefined {
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(san);
    return move.lan.replace('-', '');
  } catch {
    return undefined;
  }
}

function joinParts(parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
  return kept.length > 0 ? kept.join(' ') : undefined;
}

/** One-line "Why this label?" explanation for a classification reason. */
export function reasonExplanation(
  reason: ClassificationReason | undefined,
  locale: Locale = 'en',
): string | undefined {
  if (!reason) return undefined;
  const text = reasonText(locale, reason);
  return text ? t(locale, 'feedback.whyLabel', { text }) : undefined;
}

const HEADLINE_KEY: Record<MoveClass, MessageKey> = {
  brilliant: 'feedback.headlineBrilliant',
  great: 'feedback.headlineGreat',
  best: 'feedback.headlineBest',
  excellent: 'feedback.headlineExcellent',
  good: 'feedback.headlineGood',
  book: 'feedback.headlineBook',
  forced: 'feedback.headlineForced',
  inaccuracy: 'feedback.headlineInaccuracy',
  mistake: 'feedback.headlineMistake',
  blunder: 'feedback.headlineBlunder',
  miss: 'feedback.headlineMiss',
};

function generateFeedbackCore(input: FeedbackInput): Feedback {
  const locale: Locale = input.locale ?? 'en';
  const { san, classification } = input;
  const bestUci = input.bestMoveSan ? sanToUci(input.fenBefore, input.bestMoveSan) : undefined;
  const reason = bestUci ? deriveReason(input.fenBefore, input.moveUci, bestUci) : undefined;
  const reasonSentence = reason ? t(locale, REASON_SENTENCE[reason]) : undefined;

  const bestText =
    input.bestMoveSan && input.bestMoveSan !== san
      ? input.bestEvalText
        ? t(locale, 'feedback.bestWasEval', { best: input.bestMoveSan, eval: input.bestEvalText })
        : t(locale, 'feedback.bestWas', { best: input.bestMoveSan })
      : undefined;
  const swingText =
    input.evalSwingPawns >= 0.5
      ? t(locale, 'feedback.swing', { pawns: input.evalSwingPawns.toFixed(1) })
      : undefined;
  const pvText =
    input.pvSan.length >= 2
      ? t(locale, 'feedback.bestLine', { line: input.pvSan.slice(0, 6).join(' ') })
      : undefined;
  const evalText = input.bestEvalText
    ? t(locale, 'feedback.engineEval', { eval: input.bestEvalText })
    : undefined;

  const headlineKey = HEADLINE_KEY[classification];
  const headline = headlineKey
    ? t(locale, headlineKey, { san })
    : t(locale, 'feedback.headlineFallback', { san });

  switch (classification) {
    case 'brilliant':
      return {
        headline,
        detail: joinParts([reasonSentence ?? t(locale, 'feedback.sacrificeApproved'), pvText]),
      };
    case 'great':
      return {
        headline,
        detail: joinParts([reasonSentence ?? t(locale, 'feedback.onlyMoveHolds'), pvText]),
      };
    case 'best':
      return { headline, detail: joinParts([evalText, pvText]) };
    case 'excellent':
      return {
        headline,
        detail: joinParts([t(locale, 'feedback.nearlyBest'), pvText]),
      };
    case 'good':
      return {
        headline,
        detail: joinParts([bestText ?? t(locale, 'feedback.keepsOnTrack'), pvText]),
      };
    case 'book':
      return {
        headline,
        detail: input.bookName
          ? input.bookEco
            ? t(locale, 'feedback.bookNamedEco', { name: input.bookName, eco: input.bookEco })
            : t(locale, 'feedback.bookNamed', { name: input.bookName })
          : t(locale, 'feedback.bookKnown'),
      };
    case 'forced':
      return { headline, detail: t(locale, 'feedback.forcedOnly') };
    case 'inaccuracy':
    case 'mistake':
    case 'blunder':
      return { headline, detail: joinParts([bestText, swingText, pvText]) };
    case 'miss':
      return {
        headline,
        detail: joinParts([t(locale, 'feedback.missIntro'), bestText, reasonSentence, pvText]),
      };
    default:
      return { headline };
  }
}

/**
 * Coach feedback with the classification reason appended (Prompt 4):
 * every label carries its "Why this label?" explanation in the detail
 * text when the caller supplied the reason (the analyzer always does).
 */
export function generateFeedback(input: FeedbackInput): Feedback {
  const locale: Locale = input.locale ?? 'en';
  const core = generateFeedbackCore(input);
  const why = reasonExplanation(input.classificationReason, locale);
  if (!why) return core;
  return { headline: core.headline, detail: joinParts([core.detail, why]) };
}
