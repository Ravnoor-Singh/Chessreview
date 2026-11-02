// PGN parsing (spec Section 4): multi-game splitting, clock extraction,
// main-line extraction and conversion to the ParsedGame model.
//
// chess.js loadPgn is fed a cleaned game: tags are kept (so SetUp/FEN games
// start from the right position), but variations, comments and NAGs are
// stripped first so the main line is unambiguous. [%clk ...] comments are
// harvested BEFORE stripping — each one annotates the move played just
// before it, and clocksMs[i] is that move's remaining clock.

import { Chess } from 'chess.js';
import { t, type Locale } from '@/i18n';
import type { ParsedGame, PgnParseErrorInfo, TerminationMetadata } from '@/lib/types';
import { resolveTermination } from '@/analysis/termination';

export interface ParsedGameWithPgn extends ParsedGame {
  /** The original text of this single game, exactly as split out. */
  pgn: string;
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const CLK_RE = /\[%clk\s+([0-9]+(?::[0-9]{1,2}){0,2}(?:\.[0-9]+)?)\s*\]/;

/** "0:05:00" / "5:00" / "45.2" → milliseconds. */
export function parseClockToMs(clock: string): number {
  const parts = clock.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  } else if (parts.length === 2) {
    seconds = Number(parts[0]) * 60 + Number(parts[1]);
  } else {
    seconds = Number(parts[0]);
  }
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
}

interface ScanState {
  inBrace: boolean;
  inSemi: boolean;
  depth: number;
}

function makeState(): ScanState {
  return { inBrace: false, inSemi: false, depth: 0 };
}

/**
 * Remove parenthesised variations (nested) from PGN text. Braces comments
 * are preserved; parentheses inside comments or after ';' do not count.
 */
export function stripVariations(text: string): string {
  const state = makeState();
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (state.inSemi) {
      if (ch === '\n') {
        state.inSemi = false;
        if (state.depth === 0) out += ch;
      }
      continue;
    }
    if (state.inBrace) {
      if (state.depth === 0) out += ch;
      if (ch === '}') state.inBrace = false;
      continue;
    }
    if (ch === '{') {
      state.inBrace = true;
      if (state.depth === 0) out += ch;
      continue;
    }
    if (ch === ';') {
      state.inSemi = true;
      continue;
    }
    if (ch === '(') {
      state.depth += 1;
      out += ' ';
      continue;
    }
    if (ch === ')') {
      state.depth = Math.max(0, state.depth - 1);
      out += ' ';
      continue;
    }
    if (state.depth === 0) out += ch;
  }
  return out;
}

/** Remove {…} comments and ;-to-end-of-line comments. */
export function stripComments(text: string): string {
  let out = '';
  let inBrace = false;
  let inSemi = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inSemi) {
      if (ch === '\n') {
        inSemi = false;
        out += ch;
      }
      continue;
    }
    if (inBrace) {
      if (ch === '}') inBrace = false;
      continue;
    }
    if (ch === '{') {
      inBrace = true;
      out += ' ';
      continue;
    }
    if (ch === ';') {
      inSemi = true;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split tag section (leading […] lines) from the movetext of one game. */
function splitTagsAndMovetext(game: string): { tags: string; movetext: string } {
  const lines = game.split('\n');
  const tagLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\[/.test(line)) {
      tagLines.push(line);
      i += 1;
    } else if (line.trim() === '') {
      i += 1;
      break;
    } else {
      break;
    }
  }
  return { tags: tagLines.join('\n'), movetext: lines.slice(i).join('\n') };
}

/**
 * Walk a variation-free movetext and return, per main-line ply, the clock
 * from the [%clk] comment that follows the move (null when there is none).
 */
function extractClocks(movetextNoVariations: string): (number | null)[] {
  const withMarkers = movetextNoVariations.replace(/\{([^}]*)\}/g, (_whole, inner: string) => {
    const clk = CLK_RE.exec(inner);
    return clk ? ` \u0001${clk[1]} ` : ' ';
  });
  const noComments = stripComments(withMarkers);
  const noNags = noComments.replace(/\$\d+/g, ' ');
  const tokens = noNags.split(/\s+/).filter((t) => t.length > 0);
  const clocks: (number | null)[] = [];
  for (const rawToken of tokens) {
    if (rawToken.startsWith('\u0001')) {
      const ms = parseClockToMs(rawToken.slice(1));
      if (clocks.length > 0) clocks[clocks.length - 1] = ms;
      continue;
    }
    const token = rawToken.replace(/^\d+\.(\.\.)?/, '').replace(/^\.\.\./, '');
    if (!token) continue;
    if (RESULT_TOKENS.has(token)) break;
    clocks.push(null); // one entry per main-line move token
  }
  return clocks;
}

/** Normalize the 0-0 / 0-0-0 castling spellings some exporters emit to O-O / O-O-O. */
export function normalizeCastlingTokens(text: string): string {
  return text.replace(/\b0-0-0(?=[+#\s]|$)/g, 'O-O-O').replace(/\b0-0(?=[+#\s]|$)/g, 'O-O');
}

/** Cleaned game text suitable for chess.js loadPgn (main line only). */
function cleanedForLoad(game: string): string {
  const { tags, movetext } = splitTagsAndMovetext(game);
  const noVariations = stripVariations(movetext);
  const noComments = stripComments(noVariations);
  const noNags = noComments.replace(/\$\d+/g, ' ');
  return normalizeCastlingTokens(`${tags}\n\n${noNags}`.trim());
}

/** Parse [Key "value"] tags out of a game's tag section. */
export function parseTagSection(gameText: string): Record<string, string> {
  const { tags } = splitTagsAndMovetext(gameText);
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tags)) !== null) headers[m[1]] = m[2].replace(/\\"/g, '"');
  return headers;
}

/**
 * Chess960 detection: a [Variant] tag naming Chess960 / Fischer Random,
 * a Shredder-FEN castling field (rook file letters), or a full starting
 * array whose back ranks are not the standard RNBQKBNR arrangement.
 * chess.js 1.4 cannot generate 960 castling (it assumes the standard
 * king ±2 squares and KQkq castling), so detected games are flagged and
 * the UI refuses to analyze them as standard chess.
 */
export function detectChess960(headers: Record<string, string>, startFen: string): boolean {
  const variant = (headers.Variant ?? '').toLowerCase();
  if (variant.includes('960') || variant.includes('fischer')) return true;
  const fields = startFen.trim().split(/\s+/);
  const castling = fields[2] ?? '';
  if (/[A-Ha-h]/.test(castling.replace(/[KQkq-]/g, '')) && /[A-H]/.test(castling)) return true;
  const ranks = (fields[0] ?? '').split('/');
  if (ranks.length === 8) {
    const fullStart =
      ranks[1] === 'pppppppp' &&
      ranks[6] === 'PPPPPPPP' &&
      ranks[0].length === 8 &&
      ranks[7].length === 8;
    if (fullStart && (ranks[0].toLowerCase() !== 'rnbqkbnr' || ranks[7] !== 'RNBQKBNR'))
      return true;
  }
  return false;
}

/** Main-line SAN tokens of a cleaned movetext, in order, result excluded. */
function mainLineTokens(gameText: string): string[] {
  const cleaned = cleanedForLoad(gameText);
  const { movetext } = splitTagsAndMovetext(cleaned);
  const tokens: string[] = [];
  for (const raw of movetext.split(/\s+/)) {
    if (!raw) continue;
    const token = raw.replace(/^\d+\.(\.\.)?/, '').replace(/^\.\.\./, '');
    if (!token) continue;
    if (RESULT_TOKENS.has(token)) break;
    tokens.push(token.replace(/[!?]+$/, ''));
  }
  return tokens;
}

/** Re-serialize a valid move prefix as a clean, analyzable PGN. */
function reserializePrefix(gameText: string, startFen: string, sans: string[]): string {
  const { tags } = splitTagsAndMovetext(gameText);
  const fields = startFen.trim().split(/\s+/);
  let moveNo = Number(fields[5]) || 1;
  let turn = fields[1] === 'b' ? 'b' : 'w';
  const parts: string[] = [];
  for (const san of sans) {
    if (turn === 'w') {
      parts.push(`${moveNo}. ${san}`);
      turn = 'b';
    } else {
      if (parts.length === 0) parts.push(`${moveNo}... ${san}`);
      else parts.push(san);
      turn = 'w';
      moveNo += 1;
    }
  }
  return `${tags}\n\n${parts.join(' ')} *`.trim();
}

/**
 * Split a PGN text into its individual games. A new game starts at an
 * [Event tag encountered outside any variation or comment when a game is
 * already in progress.
 */
export function splitPgnGames(text: string): string[] {
  const normalised = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const games: string[] = [];
  const state = makeState();
  let current = '';
  let currentHasEvent = false;

  const isEventBoundary = (pos: number): boolean => {
    if (!normalised.startsWith('[Event', pos)) return false;
    // Tag must start a line (allowing indentation) and be a real tag.
    const before = pos === 0 ? '\n' : normalised[pos - 1];
    if (before !== '\n' && before !== '\r') return false;
    const after = normalised[pos + '[Event'.length];
    return after === ' ' || after === '\t' || after === '"';
  };

  for (let i = 0; i < normalised.length; i += 1) {
    const ch = normalised[i];
    if (!state.inBrace && !state.inSemi && state.depth === 0 && isEventBoundary(i)) {
      if (currentHasEvent && current.trim().length > 0) {
        games.push(current.trim());
        current = '';
      }
      currentHasEvent = true;
    }
    current += ch;
    if (state.inSemi) {
      if (ch === '\n') state.inSemi = false;
      continue;
    }
    if (state.inBrace) {
      if (ch === '}') state.inBrace = false;
      continue;
    }
    if (ch === '{') state.inBrace = true;
    else if (ch === ';') state.inSemi = true;
    else if (ch === '(') state.depth += 1;
    else if (ch === ')') state.depth = Math.max(0, state.depth - 1);
  }
  if (current.trim().length > 0) games.push(current.trim());
  return games;
}

function parseSingleGame(gameText: string, locale: Locale = 'en'): ParsedGameWithPgn {
  const { movetext } = splitTagsAndMovetext(gameText);
  const clocks = extractClocks(stripVariations(movetext));

  const chess = new Chess();
  let loadError: unknown = null;
  try {
    chess.loadPgn(cleanedForLoad(gameText), { strict: false });
  } catch (err) {
    loadError = err;
  }

  if (loadError === null) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(chess.getHeaders())) {
      // chess.js fills the seven-tag roster with '?' / '????.??.??'
      // placeholders for tags the PGN did not actually carry; drop those.
      if (typeof value !== 'string' || value.length === 0) continue;
      if (value === '?' || value === '????.??.??') continue;
      headers[key] = value;
    }

    const history = chess.history({ verbose: true });
    const moves = history.map((move) => move.san);
    const startFen =
      history.length > 0
        ? history[0].before
        : (headers.FEN ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const fens = [startFen, ...history.map((move) => move.after)];

    const clocksMs: (number | null)[] = moves.map((_, i) => clocks[i] ?? null);

    const resultToken = cleanedForLoad(gameText)
      .split(/\s+/)
      .filter((tok) => RESULT_TOKENS.has(tok))
      .pop();
    const result = headers.Result ?? resultToken ?? '*';

    const terminationMeta: TerminationMetadata | undefined = headers.Termination
      ? { terminationTag: headers.Termination }
      : undefined;
    const termination = resolveTermination({
      finalFen: fens[fens.length - 1],
      fens,
      headers,
      result,
      meta: terminationMeta,
    });
    const isChess960 = detectChess960(headers, startFen);

    return {
      headers,
      moves,
      fens,
      startFen,
      clocksMs,
      result,
      pgn: gameText,
      termination,
      terminationMeta,
      isChess960: isChess960 || undefined,
    };
  }

  // Recovery path: replay the main line token by token and keep the
  // longest valid prefix. Only a failure on the very first token (or an
  // unusable start position) is fatal — that preserves the historical
  // "garbage PGN throws" behavior while truncated/corrupt games later
  // in the movetext surface a parseError the UI can offer to analyze.
  const headers = parseTagSection(gameText);
  const startFen = headers.FEN ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const tokens = mainLineTokens(gameText);
  let replay: Chess;
  try {
    replay = new Chess(startFen);
  } catch {
    throw new Error(
      t(locale, 'errors.pgnFailed', {
        detail: loadError instanceof Error ? loadError.message : String(loadError),
      }),
    );
  }
  const moves: string[] = [];
  const fens: string[] = [startFen];
  let failedSan: string | null = null;
  let legalMoves: string[] = [];
  for (const token of tokens) {
    try {
      const mv = replay.move(token);
      moves.push(mv.san);
      fens.push(replay.fen());
    } catch {
      failedSan = token;
      try {
        legalMoves = replay.moves();
      } catch {
        legalMoves = [];
      }
      break;
    }
  }
  if (failedSan === null && moves.length > 0) {
    // loadPgn rejected something outside the movetext (typically an
    // unusual header chess.js's strict tag parser refuses, e.g. an
    // escaped quote in a name) but every move replays legally: accept
    // the game from the manual replay + regex-parsed tags.
    const resultToken = tokens.length > 0 ? (headers.Result ?? '*') : '*';
    const result = headers.Result ?? resultToken;
    const clocksMsFull: (number | null)[] = moves.map((_, i) => clocks[i] ?? null);
    const termMeta: TerminationMetadata | undefined = headers.Termination
      ? { terminationTag: headers.Termination }
      : undefined;
    return {
      headers,
      moves,
      fens,
      startFen,
      clocksMs: clocksMsFull,
      result,
      pgn: gameText,
      termination: resolveTermination({
        finalFen: fens[fens.length - 1],
        fens,
        headers,
        result,
        meta: termMeta,
      }),
      terminationMeta: termMeta,
      isChess960: detectChess960(headers, startFen) || undefined,
    };
  }
  if (failedSan === null) {
    // Nothing replayable at all: surface the original failure.
    throw new Error(
      t(locale, 'errors.pgnFailed', {
        detail: loadError instanceof Error ? loadError.message : String(loadError),
      }),
    );
  }
  if (moves.length === 0) {
    throw new Error(
      t(locale, 'errors.pgnFailed', {
        detail: loadError instanceof Error ? loadError.message : String(loadError),
      }),
    );
  }
  const ply = moves.length + 1;
  const parseError: PgnParseErrorInfo = {
    ply,
    san: failedSan,
    message: t(locale, 'errors.pgnTruncated', { ply, san: failedSan }),
    validMoves: moves.length,
    legalMoves,
  };
  const clocksMs: (number | null)[] = moves.map((_, i) => clocks[i] ?? null);
  const isChess960 = detectChess960(headers, startFen);
  const terminationMeta: TerminationMetadata | undefined = headers.Termination
    ? { terminationTag: headers.Termination }
    : undefined;
  const termination = resolveTermination({
    finalFen: fens[fens.length - 1],
    fens,
    headers,
    result: '*',
    meta: terminationMeta,
  });
  return {
    headers,
    moves,
    fens,
    startFen,
    clocksMs,
    result: '*',
    pgn: reserializePrefix(gameText, startFen, moves),
    termination,
    terminationMeta,
    isChess960: isChess960 || undefined,
    parseError,
  };
}

/**
 * Parse PGN text (one or more games) into ParsedGame objects that also
 * carry their original per-game PGN text. Throws an Error with a readable
 * message when a game cannot be parsed.
 */
export function parsePgn(text: string, locale: Locale = 'en'): ParsedGameWithPgn[] {
  const normalised = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalised.trim()) throw new Error(t(locale, 'errors.pgnEmpty'));
  const games = splitPgnGames(normalised);
  if (games.length === 0) throw new Error(t(locale, 'errors.pgnNoGames'));
  return games.map((game) => parseSingleGame(game.trim(), locale));
}
