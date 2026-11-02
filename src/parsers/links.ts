// URL / free-text input detection for Chess.com and Lichess (spec 4.4/4.5).

export type ChessComGameType = 'live' | 'daily';

export type ChessComUrl =
  | { kind: 'game'; id: string; gameType: ChessComGameType }
  | { kind: 'user'; username: string }
  | null;

export type DetectedInput =
  | { type: 'pgn' }
  | { type: 'fen'; fen: string }
  | { type: 'chesscom-game'; id: string; gameType: ChessComGameType }
  | { type: 'chesscom-user'; username: string }
  | { type: 'lichess'; gameId: string }
  | { type: 'username'; username: string }
  | { type: 'unknown' };

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;
const BARE_USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;
const GAME_ID_RE = /^\d+$/;
const LICHESS_ID_RE = /^[A-Za-z0-9]{8}([A-Za-z0-9]{4})?$/;

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function isChessComHost(hostname: string): boolean {
  return hostname === 'chess.com' || hostname.endsWith('.chess.com');
}

function isLichessHost(hostname: string): boolean {
  return hostname === 'lichess.org' || hostname.endsWith('.lichess.org');
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter((segment) => segment.length > 0);
}

/**
 * Parse a Chess.com URL. Supported shapes:
 *   /game/live/{id}, /game/daily/{id}
 *   /analysis/game/live/{id}, /analysis/game/daily/{id} (any such infix)
 *   /live/game/{id}
 *   /member/{username}
 *   /games/archive/{username}
 */
export function parseChessComUrl(input: string): ChessComUrl {
  const url = toUrl(input);
  if (!url || !isChessComHost(url.hostname)) return null;
  const segments = pathSegments(url).map((s) => decodeURIComponent(s));

  // Game URLs: find a "game" segment followed by live/daily and an id, or
  // the /live/game/{id} ordering.
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i] === 'game') {
      const kind = segments[i + 1];
      const id = segments[i + 2];
      if ((kind === 'live' || kind === 'daily') && id && GAME_ID_RE.test(id)) {
        return { kind: 'game', id, gameType: kind };
      }
    }
    if (segments[i] === 'live' && segments[i + 1] === 'game') {
      const id = segments[i + 2];
      if (id && GAME_ID_RE.test(id)) return { kind: 'game', id, gameType: 'live' };
    }
    if (segments[i] === 'daily' && segments[i + 1] === 'game') {
      const id = segments[i + 2];
      if (id && GAME_ID_RE.test(id)) return { kind: 'game', id, gameType: 'daily' };
    }
  }

  // User URLs.
  const memberIdx = segments.indexOf('member');
  if (memberIdx >= 0) {
    const username = segments[memberIdx + 1];
    if (username && USERNAME_RE.test(username)) return { kind: 'user', username };
    return null;
  }
  if (segments[0] === 'games' && segments[1] === 'archive') {
    const username = segments[2];
    if (username && USERNAME_RE.test(username)) return { kind: 'user', username };
    return null;
  }
  return null;
}

/** True for lichess.org/study/... URLs (studies are not single games). */
export function isLichessStudyUrl(input: string): boolean {
  const url = toUrl(input);
  if (!url || !isLichessHost(url.hostname)) return false;
  return pathSegments(url)[0] === 'study';
}

/**
 * Parse a Lichess game URL: lichess.org/{8- or 12-char id} with an optional
 * /white or /black suffix and an optional #ply anchor (ignored). Study URLs
 * and other lichess paths return null.
 */
export function parseLichessUrl(input: string): { gameId: string } | null {
  const url = toUrl(input);
  if (!url || !isLichessHost(url.hostname)) return null;
  const segments = pathSegments(url);
  if (segments.length === 0) return null;
  if (segments[0] === 'study') return null;
  const [gameId, suffix] = segments;
  if (!LICHESS_ID_RE.test(gameId)) return null;
  if (segments.length > 2) return null;
  if (suffix !== undefined && suffix !== 'white' && suffix !== 'black') return null;
  return { gameId };
}

const PIECE_PLACEMENT_RE = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/;

function looksLikeFen(text: string): boolean {
  const fields = text.trim().split(/\s+/);
  if (fields.length !== 6) return false;
  const [placement, turn, castling, enPassant, halfmove, fullmove] = fields;
  if (!PIECE_PLACEMENT_RE.test(placement)) return false;
  for (const rank of placement.split('/')) {
    let squares = 0;
    for (const ch of rank) squares += /\d/.test(ch) ? Number(ch) : 1;
    if (squares !== 8) return false;
  }
  if (turn !== 'w' && turn !== 'b') return false;
  if (!/^(-|[KQkq]+)$/.test(castling)) return false;
  if (!/^(-|[a-h][36])$/.test(enPassant)) return false;
  if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)) return false;
  return true;
}

/**
 * Classify free-form user input: a URL, a FEN, a PGN, or a bare Chess.com
 * username. Checks run most-specific first; anything else is 'unknown'.
 */
export function detectInput(text: string): DetectedInput {
  const trimmed = text.trim();
  if (!trimmed) return { type: 'unknown' };

  // URLs (or bare domains) first: a recognised chess URL wins outright,
  // and an unrecognised URL never falls through to the username branch.
  if (/chess\.com|lichess\.org|^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
    const chesscom = parseChessComUrl(trimmed);
    if (chesscom?.kind === 'game') {
      return { type: 'chesscom-game', id: chesscom.id, gameType: chesscom.gameType };
    }
    if (chesscom?.kind === 'user') {
      return { type: 'chesscom-user', username: chesscom.username };
    }
    const lichess = parseLichessUrl(trimmed);
    if (lichess) return { type: 'lichess', gameId: lichess.gameId };
    return { type: 'unknown' };
  }

  if (looksLikeFen(trimmed)) return { type: 'fen', fen: trimmed };

  if (trimmed.includes('[Event') || /^\s*1\.\s/.test(trimmed)) return { type: 'pgn' };

  if (BARE_USERNAME_RE.test(trimmed)) return { type: 'username', username: trimmed };

  return { type: 'unknown' };
}
