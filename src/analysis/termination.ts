// Game-termination resolver (Round 2 / Prompt 12 successor).
//
// Pure module: derives a single GameTermination from, in priority order,
//   1. the final position itself (checkmate, stalemate, insufficient
//      material — facts of the board that no tag may override),
//   2. repetition / move-counter state (fivefold repetition and the
//      seventy-five-move rule are automatic draws; threefold repetition
//      and the fifty-move rule are the claimable draws a recorded game
//      that stops there is treated as having claimed),
//   3. Termination tags + importer metadata (chess.com / Lichess
//      phrasings for resignation, timeout, agreement, abandonment,
//      forfeit),
//   4. the result string alone.
// Board-derived endings always win over tags. Contradictory or missing
// mechanism data degrades to a safe neutral fallback whose `detail` is
// 'result-only-kind-unknown': the winner/result are still reported, but
// `kind` then carries only the conventional fallback and UIs must not
// present the mechanism as fact (see terminationLabel in the banner).
//
// Drawn terminals and win probability / accuracy: a rule-drawn final
// position (stalemate, repetition, move-counter, insufficient material,
// agreement) is scored exactly 0.0 cp / 50% win probability for BOTH
// sides by the analyzer's terminal shortcut, so a player who allows a
// draw from a winning position loses the full expected-points difference
// through the ordinary EPL/accuracy path — the draw itself is not given
// a special exemption. Resignation / timeout / abandonment / forfeit are
// NOT board terminals: the final position keeps its engine evaluation,
// no extra ply is created, and the ending event itself never receives a
// classification or a "blunder".

import { Chess } from 'chess.js';
import type {
  GameResultToken,
  GameTermination,
  TerminationKind,
  TerminationMetadata,
} from '@/lib/types';

export interface TerminationInput {
  /** FEN of the final position. */
  finalFen: string;
  /** Every position of the game, start first (for repetition counting). */
  fens?: readonly string[];
  headers?: Record<string, string>;
  /** PGN result token ('1-0' | '0-1' | '1/2-1/2' | '*'). */
  result?: string;
  meta?: TerminationMetadata;
}

const DRAW_KINDS: ReadonlySet<TerminationKind> = new Set([
  'stalemate',
  'repetition-threefold',
  'repetition-fivefold',
  'fifty-move',
  'seventyfive-move',
  'insufficient-material',
  'agreement',
  'timeout-vs-insufficient-material',
]);

export function isDrawKind(kind: TerminationKind): boolean {
  return DRAW_KINDS.has(kind);
}

/** Rule-draws: endings forced by the position/counters, scored exactly 0. */
export function isRuleDrawKind(kind: TerminationKind): boolean {
  return (
    kind === 'stalemate' ||
    kind === 'repetition-threefold' ||
    kind === 'repetition-fivefold' ||
    kind === 'fifty-move' ||
    kind === 'seventyfive-move' ||
    kind === 'insufficient-material'
  );
}

function normalizeResult(result: string | undefined): GameResultToken {
  return result === '1-0' || result === '0-1' || result === '1/2-1/2' ? result : '*';
}

function winnerOfResult(result: GameResultToken): 'white' | 'black' | null {
  return result === '1-0' ? 'white' : result === '0-1' ? 'black' : null;
}

function resultOfWinner(
  winner: 'white' | 'black' | null,
  fallback: GameResultToken,
): GameResultToken {
  if (winner === 'white') return '1-0';
  if (winner === 'black') return '0-1';
  return fallback;
}

/** EPD identity of a FEN (placement, turn, castling, en-passant). */
export function epdOfFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/** How many times the final position occurred in the game (including itself). */
export function countFinalOccurrences(fens: readonly string[], finalFen: string): number {
  const target = epdOfFen(finalFen);
  let n = 0;
  for (const f of fens) if (epdOfFen(f) === target) n += 1;
  return n;
}

function halfmoveClock(finalFen: string): number {
  const parts = finalFen.trim().split(/\s+/);
  const n = Number(parts[4]);
  return Number.isFinite(n) ? n : 0;
}

interface PhraseHit {
  kind: TerminationKind;
  detail: string;
}

/**
 * Map a free-text Termination phrase (chess.com PGN [Termination] tags
 * look like "White won by resignation", "Black won on time",
 * "Game drawn by agreement", "White won by forfeit") to a kind.
 * Winner is NOT taken from the phrase — it comes from the result.
 */
export function kindFromTerminationPhrase(text: string | undefined): PhraseHit | null {
  if (!text) return null;
  const s = text.toLowerCase();
  if (
    s.includes('time vs insufficient') ||
    s.includes('timeout vs insufficient') ||
    s.includes('timevsinsufficient')
  ) {
    return { kind: 'timeout-vs-insufficient-material', detail: 'termination-tag' };
  }
  if (s.includes('insufficient'))
    return { kind: 'insufficient-material', detail: 'termination-tag' };
  // Stalemate before checkmate: "stalemate" itself contains "mate".
  if (s.includes('stalemate')) return { kind: 'stalemate', detail: 'termination-tag' };
  if (s.includes('checkmate') || s.includes('mate')) {
    // "Normal" (Lichess) contains no mate wording; guard against it.
    if (s.trim() === 'normal') return null;
    return { kind: 'checkmate', detail: 'termination-tag' };
  }
  if (s.includes('repetition') || s.includes('threefold') || s.includes('fivefold')) {
    return {
      kind: s.includes('fivefold') ? 'repetition-fivefold' : 'repetition-threefold',
      detail: 'termination-tag',
    };
  }
  if (s.includes('75') || s.includes('seventy'))
    return { kind: 'seventyfive-move', detail: 'termination-tag' };
  if (s.includes('50') || s.includes('fifty'))
    return { kind: 'fifty-move', detail: 'termination-tag' };
  if (s.includes('resign')) return { kind: 'resignation', detail: 'termination-tag' };
  if (s.includes('abandon')) return { kind: 'abandonment', detail: 'termination-tag' };
  if (s.includes('agreement') || s.includes('agreed'))
    return { kind: 'agreement', detail: 'termination-tag' };
  // "Time forfeit" is chess.com's timeout phrasing — check it before the
  // bare word "forfeit".
  if (
    s.includes('on time') ||
    s.includes('timeout') ||
    s.includes('time forfeit') ||
    s.includes('flag')
  ) {
    return { kind: 'timeout', detail: 'termination-tag' };
  }
  if (s.includes('forfeit')) return { kind: 'forfeit', detail: 'termination-tag' };
  return null;
}

const CHESSCOM_KIND: Record<string, TerminationKind> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'timeout',
  timevsinsufficient: 'timeout-vs-insufficient-material',
  abandoned: 'abandonment',
  agreed: 'agreement',
  repetition: 'repetition-threefold',
  stalemate: 'stalemate',
  insufficient: 'insufficient-material',
  '50move': 'fifty-move',
};

const LICHESS_KIND: Record<string, TerminationKind> = {
  mate: 'checkmate',
  resign: 'resignation',
  stalemate: 'stalemate',
  timeout: 'timeout-vs-insufficient-material',
  outoftime: 'timeout',
  draw: 'agreement',
  aborted: 'abandonment',
  cheat: 'forfeit',
  variantend: 'agreement',
};

function fromMetadata(meta: TerminationMetadata | undefined): PhraseHit | null {
  if (!meta) return null;
  if (meta.terminationTag) {
    const hit = kindFromTerminationPhrase(meta.terminationTag);
    if (hit) return hit;
  }
  const cc = [meta.chesscomWhiteResult, meta.chesscomBlackResult];
  for (const v of cc) {
    if (v && CHESSCOM_KIND[v]) return { kind: CHESSCOM_KIND[v], detail: 'chesscom-result' };
  }
  if (meta.lichessStatus) {
    const kind = LICHESS_KIND[meta.lichessStatus.toLowerCase()];
    if (kind) return { kind, detail: 'lichess-status' };
  }
  return null;
}

/** Resolve the single termination for a finished (or unfinished) game. Never throws. */
export function resolveTermination(input: TerminationInput): GameTermination {
  const result = normalizeResult(input.result ?? input.headers?.Result);
  const winnerFromResult = winnerOfResult(result);
  try {
    const chess = new Chess(input.finalFen);
    // 1. The position itself.
    if (chess.isCheckmate()) {
      const winner: 'white' | 'black' = chess.turn() === 'w' ? 'black' : 'white';
      return {
        kind: 'checkmate',
        winner,
        result: resultOfWinner(winner, result),
        detail: 'position',
      };
    }
    if (chess.isStalemate()) {
      return { kind: 'stalemate', winner: null, result: '1/2-1/2', detail: 'position' };
    }
    if (chess.isInsufficientMaterial()) {
      return { kind: 'insufficient-material', winner: null, result: '1/2-1/2', detail: 'position' };
    }
    // 2. Repetition / move-counter state.
    const half = halfmoveClock(input.finalFen);
    const occurrences = input.fens ? countFinalOccurrences(input.fens, input.finalFen) : 1;
    if (occurrences >= 5) {
      return { kind: 'repetition-fivefold', winner: null, result: '1/2-1/2', detail: 'fivefold' };
    }
    if (half >= 150) {
      return { kind: 'seventyfive-move', winner: null, result: '1/2-1/2', detail: 'move-counter' };
    }
    if (occurrences >= 3) {
      return { kind: 'repetition-threefold', winner: null, result: '1/2-1/2', detail: 'threefold' };
    }
    if (half >= 100) {
      return { kind: 'fifty-move', winner: null, result: '1/2-1/2', detail: 'move-counter' };
    }
    // 3. Termination tags + importer metadata.
    const tagText = input.meta?.terminationTag ?? input.headers?.Termination;
    const hit = kindFromTerminationPhrase(tagText) ?? fromMetadata(input.meta);
    if (hit) {
      if (isDrawKind(hit.kind)) {
        return { kind: hit.kind, winner: null, result: '1/2-1/2', detail: hit.detail };
      }
      const winner = winnerFromResult ?? input.meta?.lichessWinner ?? null;
      // Abandonment needs no winner: an aborted game (e.g. Lichess
      // 'aborted', chess.com "Game abandoned" with a '*' result) is an
      // abandonment even though nobody won it. The banner has an
      // explicit no-winner abandonment rendering for exactly this case.
      if (hit.kind === 'abandonment' && !winner) {
        return { kind: 'abandonment', winner: null, result, detail: hit.detail };
      }
      if (winner)
        return {
          kind: hit.kind,
          winner,
          result: resultOfWinner(winner, result),
          detail: hit.detail,
        };
      // A decisive mechanism with no known winner is contradictory:
      // fall through to the neutral fallback rather than invent one.
    }
    // 4. Result string alone.
    if (result === '*')
      return { kind: 'unfinished', winner: null, result: '*', detail: 'result-only' };
    if (result === '1/2-1/2') {
      return { kind: 'agreement', winner: null, result, detail: 'result-only-kind-unknown' };
    }
    return {
      kind: 'resignation',
      winner: winnerFromResult,
      result,
      detail: 'result-only-kind-unknown',
    };
  } catch {
    // Unparseable final position: trust only the result token.
    if (result === '*')
      return { kind: 'unfinished', winner: null, result: '*', detail: 'result-only-kind-unknown' };
    if (result === '1/2-1/2')
      return { kind: 'agreement', winner: null, result, detail: 'result-only-kind-unknown' };
    return {
      kind: 'resignation',
      winner: winnerFromResult,
      result,
      detail: 'result-only-kind-unknown',
    };
  }
}
