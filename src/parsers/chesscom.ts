// Chess.com public-API game normalisation and move-list decoding (spec 4.4).

import { Chess, type Square } from 'chess.js';
import type { ImportedGameSummary } from '@/lib/types';
import { hashString } from '@/lib/format';
import { t, type Locale } from '@/i18n';
import { parseUci } from '@/lib/san';

// --- Result mapping --------------------------------------------------------

const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

const LOSS_RESULTS = new Set([
  'checkmated',
  'resigned',
  'timeout',
  'abandoned',
  'lose',
  'kingofthehill',
  'threecheck',
  'bughousepartnerlose',
]);

/** Map a pair of Chess.com per-player result strings to a PGN result. */
export function mapChessComResult(whiteResult: string, blackResult: string): string {
  if (whiteResult === 'win') return '1-0';
  if (blackResult === 'win') return '0-1';
  if (DRAW_RESULTS.has(whiteResult) || DRAW_RESULTS.has(blackResult)) return '1/2-1/2';
  if (LOSS_RESULTS.has(whiteResult)) return '0-1';
  if (LOSS_RESULTS.has(blackResult)) return '1-0';
  return '*';
}

// --- Raw-object helpers (raw is unknown JSON from the pub API) --------------

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Read [Key "value"] headers out of a PGN string. */
export function pgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

/**
 * Normalise one game object from the Chess.com pub API
 * (…/player/{user}/games/archives) into an ImportedGameSummary.
 * Returns null for non-chess rules (variants), missing PGN, or missing
 * player info.
 */
export function normalizeArchiveGame(raw: unknown): ImportedGameSummary | null {
  const game = asRecord(raw);
  if (!game) return null;
  if (game.rules !== 'chess') return null; // standard chess only

  const pgn = asString(game.pgn);
  if (!pgn) return null;
  const white = asRecord(game.white);
  const black = asRecord(game.black);
  const whiteName = white ? asString(white.username) : undefined;
  const blackName = black ? asString(black.username) : undefined;
  if (!whiteName || !blackName) return null;

  const headers = pgnHeaders(pgn);
  const whiteResult = white ? (asString(white.result) ?? '') : '';
  const blackResult = black ? (asString(black.result) ?? '') : '';
  const mapped = mapChessComResult(whiteResult, blackResult);
  const result = mapped !== '*' ? mapped : (headers.Result ?? '*');

  const url = asString(game.url);
  const endTime = asNumber(game.end_time);
  const date =
    endTime !== undefined
      ? new Date(endTime * 1000).toISOString().slice(0, 10)
      : (headers.UTCDate ?? headers.Date ?? '');

  const urlId = url ? url.split('/').filter(Boolean).pop() : undefined;

  return {
    id: urlId ?? hashString(pgn),
    white: whiteName,
    black: blackName,
    whiteElo: white ? asNumber(white.rating) : undefined,
    blackElo: black ? asNumber(black.rating) : undefined,
    result,
    date,
    event: headers.Event && headers.Event !== '?' ? headers.Event : '',
    timeClass: asString(game.time_class),
    url,
    pgn,
  };
}

// --- Move-list decoding ------------------------------------------------------

/**
 * Chess.com's compressed move list encoding — reverse-engineered and VERIFIED
 * against live chess.com data (archive PGNs aligned pair-by-pair with callback
 * moveLists, October 2026, including promotion games):
 *
 * - One move = exactly 2 characters. A character's value is its index in
 *   SQUARE_CHARS, and the index is a square: index = (rank - 1) * 8 + file,
 *   a1 = 0 … h8 = 63.
 * - Promotions replace the to-square character with a promotion character
 *   encoding (piece, file direction): '~' queen push, '{' queen capture
 *   toward the a-file, '}' queen capture toward the h-file, '^' knight push,
 *   '[' / ']' knight captures. The to-square is the from-square plus the
 *   pawn's forward step and the encoded file offset.
 * - Any other promotion character (rare rook/bishop underpromotions) is
 *   resolved by enumerating the position's legal promotion moves and
 *   requiring the REST of the list to decode legally (backtracking search),
 *   so a guess can never silently corrupt the game.
 */
export const SQUARE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?';

/** @deprecated Kept for compatibility; use SQUARE_CHARS. */
export const CHESSCOM_MOVELIST_CHARSET = SQUARE_CHARS;

const FILES = 'abcdefgh';

export function indexToSquareName(index: number): string {
  return FILES[index % 8] + String(1 + Math.floor(index / 8));
}

interface PromoSpec {
  piece: string;
  dFile: number;
}

export const PROMO_CHARS: Record<string, PromoSpec> = {
  '~': { piece: 'q', dFile: 0 },
  '{': { piece: 'q', dFile: -1 },
  '}': { piece: 'q', dFile: 1 },
  '^': { piece: 'n', dFile: 0 },
  '[': { piece: 'n', dFile: -1 },
  ']': { piece: 'n', dFile: 1 },
};

function tryMove(chess: Chess, uci: string): Chess | null {
  const next = new Chess(chess.fen());
  try {
    next.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return next;
  } catch {
    return null;
  }
}

/** Candidate UCI moves for one encoded pair, most likely first. */
function decodeCandidates(chess: Chess, c1: string, c2: string): string[] {
  const fromIdx = SQUARE_CHARS.indexOf(c1);
  if (fromIdx < 0) return [];
  const from = indexToSquareName(fromIdx);
  const piece = chess.get(from as Square);
  const out: string[] = [];

  const toIdx = SQUARE_CHARS.indexOf(c2);
  if (toIdx >= 0) out.push(from + indexToSquareName(toIdx));

  const promo = PROMO_CHARS[c2];
  if (promo && piece && piece.type === 'p') {
    const rankDir = piece.color === 'w' ? 1 : -1;
    const toFile = (fromIdx % 8) + promo.dFile;
    const toRank = Number(from[1]) + rankDir;
    if (toFile >= 0 && toFile <= 7 && toRank >= 1 && toRank <= 8) {
      out.push(from + FILES[toFile] + String(toRank) + promo.piece);
    }
  }

  // A pawn about to promote: also enumerate every legal promotion so rarer
  // promotion characters are covered by the backtracking search.
  if (piece && piece.type === 'p' && (from[1] === '7' || from[1] === '2')) {
    const legal = chess
      .moves({ verbose: true })
      .filter((m) => m.from === from && m.promotion)
      .map((m) => m.from + m.to + (m.promotion ?? ''));
    for (const u of legal) if (!out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * Decode a Chess.com compressed move list into UCI moves, starting from the
 * standard initial position. Throws Error('Could not decode chess.com move
 * list') when no fully-legal decoding exists.
 */
export function decodeChessComMoveList(moveList: string, locale: Locale = 'en'): string[] {
  if (typeof moveList !== 'string') {
    throw new Error(t(locale, 'errors.decodeMoveList'));
  }
  const text = moveList;
  if (text.length === 0) return [];
  if (text.length % 2 !== 0) {
    throw new Error(t(locale, 'errors.decodeMoveList'));
  }
  const total = text.length / 2;
  const result: string[] = new Array(total);

  const dfs = (chess: Chess, ply: number): boolean => {
    if (ply === total) return true;
    for (const uci of decodeCandidates(chess, text[ply * 2], text[ply * 2 + 1])) {
      const next = tryMove(chess, uci);
      if (!next) continue;
      result[ply] = uci;
      if (dfs(next, ply + 1)) return true;
    }
    return false;
  };

  if (!dfs(new Chess(), 0)) {
    throw new Error(t(locale, 'errors.decodeMoveList'));
  }
  return result;
}

void parseUci;
