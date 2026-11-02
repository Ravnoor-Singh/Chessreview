// Opening book: TSV parsing, EPD indexing and lookup (spec Section 9).
//
// The book ships as five TSV files (a.tsv … e.tsv) with columns
// eco / name / pgn. Positions are keyed by EPD — the first four FEN fields
// (placement, side to move, castling, en passant) — so transpositions match.
// The pure functions are unit-testable in node; loadOpeningIndex is the thin
// browser loader that fetches the TSVs and caches the built index.

import { Chess } from 'chess.js';

export interface OpeningEntry {
  eco: string;
  name: string;
  pgn: string;
}

export interface IndexedOpeningEntry extends OpeningEntry {
  /** Number of plies in the opening line. */
  depth: number;
  /** EPD of the position after the opening's PGN. */
  epd: string;
}

export type OpeningIndex = Map<string, IndexedOpeningEntry>;

export interface OpeningMatch {
  eco: string;
  name: string;
  /** Index into the supplied fens array of the deepest matched position. */
  matchedPly: number;
  /** SAN moves from the start up to the matched position. */
  sequenceSan: string[];
}

/** EPD of a FEN: its first four whitespace-separated fields. */
export function epdOf(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/** Parse one TSV file's text into opening entries (header line skipped). */
export function parseOpeningsTsv(text: string): OpeningEntry[] {
  const entries: OpeningEntry[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [eco, name, ...pgnParts] = parts;
    if (eco.trim().toLowerCase() === 'eco' && name.trim().toLowerCase() === 'name') {
      continue; // header row
    }
    entries.push({ eco: eco.trim(), name: name.trim(), pgn: pgnParts.join('\t').trim() });
  }
  return entries;
}

/** Extract the SAN tokens from an opening PGN fragment like "1. e4 c5 2. Nf3". */
function sanTokensOf(pgn: string): string[] {
  const tokens: string[] = [];
  for (const raw of pgn.split(/\s+/)) {
    if (!raw) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) continue;
    // Strip move numbers, including glued forms like "1.e4" or "3...Nf6".
    const token = raw.replace(/^\d+\.(\.\.)?/, '').replace(/^\.\.\./, '');
    if (token) tokens.push(token);
  }
  return tokens;
}

/** One node of the opening-line prefix trie used by buildOpeningIndex. */
interface OpeningTrieNode {
  children: Map<string, OpeningTrieNode>;
  /** Indices (into the entries array) whose line ends exactly at this node. */
  terminalEntries: number[];
  /** The move leading to this node is illegal at its parent position. */
  failed: boolean;
}

/**
 * Build the EPD → opening index. Several entries can land on the same EPD
 * (transpositions / shared prefixes); keep the most specific one — the most
 * plies, breaking ties by the longest (most detailed) name.
 *
 * Performance: opening lines share long prefixes, so instead of replaying
 * every line from the start position on its own board (37,700 SAN move()
 * calls for the bundled 3,865 entries — 16–21 s on the reference VM, paid
 * by every first-time visitor when the index is built in the browser), the
 * lines are inserted into a prefix trie and walked once with a single
 * shared board: 8,801 unique edges, one move()/undo() pair each. A move()
 * that throws does so before mutating the board (chess.js resolves the SAN
 * against the generated move list first), so an illegal edge simply marks
 * its subtree failed — exactly the entries a per-entry replay would skip.
 * The selection pass below runs in the original entry order with the
 * original comparison, so the resulting index is identical (verified: same
 * size and same sorted-content hash before/after this rewrite).
 */
export function buildOpeningIndex(entries: OpeningEntry[]): OpeningIndex {
  const root: OpeningTrieNode = { children: new Map(), terminalEntries: [], failed: false };
  entries.forEach((entry, i) => {
    let node = root;
    for (const token of sanTokensOf(entry.pgn)) {
      let child = node.children.get(token);
      if (!child) {
        child = { children: new Map(), terminalEntries: [], failed: false };
        node.children.set(token, child);
      }
      node = child;
    }
    node.terminalEntries.push(i);
  });

  const played: ({ fen: string; plies: number } | null)[] = entries.map(() => null);
  const chess = new Chess();
  const visit = (node: OpeningTrieNode, depth: number): void => {
    if (node.failed) return; // unparseable line: skip its entries, as a replay would
    if (node.terminalEntries.length > 0) {
      const fen = chess.fen();
      for (const i of node.terminalEntries) played[i] = { fen, plies: depth };
    }
    for (const [token, child] of node.children) {
      try {
        chess.move(token);
      } catch {
        child.failed = true; // board unchanged (see note above): siblings unaffected
        continue;
      }
      visit(child, depth + 1);
      chess.undo();
    }
  };
  visit(root, 0);

  const index: OpeningIndex = new Map();
  entries.forEach((entry, i) => {
    const result = played[i];
    if (!result) return;
    const epd = epdOf(result.fen);
    const candidate: IndexedOpeningEntry = { ...entry, depth: result.plies, epd };
    const existing = index.get(epd);
    if (
      !existing ||
      candidate.depth > existing.depth ||
      (candidate.depth === existing.depth && candidate.name.length > existing.name.length)
    ) {
      index.set(epd, candidate);
    }
  });
  return index;
}

/** SAN of the move that takes fens[i - 1] to fens[i], if it is legal there. */
function sanBetween(fenBefore: string, fenAfter: string): string | undefined {
  try {
    const chess = new Chess(fenBefore);
    for (const move of chess.moves({ verbose: true })) {
      if (move.after === fenAfter) return move.san;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Find the opening for a game given its position list (fens[0] = start).
 * Walks from the first position and keeps the LAST (deepest) EPD match —
 * the most specific name the game reached. Returns null when no position
 * is in the book.
 */
export function findOpening(fens: string[], index: OpeningIndex): OpeningMatch | null {
  let match: OpeningMatch | null = null;
  for (let ply = 0; ply < fens.length; ply += 1) {
    const entry = index.get(epdOf(fens[ply]));
    if (entry) {
      match = { eco: entry.eco, name: entry.name, matchedPly: ply, sequenceSan: [] };
    }
  }
  if (!match) return null;
  const sequenceSan: string[] = [];
  for (let i = 1; i <= match.matchedPly; i += 1) {
    const san = sanBetween(fens[i - 1], fens[i]);
    if (san === undefined) break;
    sequenceSan.push(san);
  }
  return { ...match, sequenceSan };
}

export interface BookContinuation {
  /** SAN of the book move that continues the line from the exit position. */
  san: string;
  eco: string;
  /** Name of the variation the continuation belongs to. */
  name: string;
}

/** SAN comparison key: check/mate suffixes stripped so dataset and game SANs match. */
function sanCore(san: string): string {
  return san.replace(/[+#]+$/, '');
}

/**
 * Book continuations for the position where a game LEFT the book
 * (Prompt 6). `sequenceSan` is the game's book sequence (the SAN moves
 * that were still in book — GameReview.opening.sequenceSan). Every
 * dataset entry whose line extends that exact sequence contributes its
 * next move; continuations are grouped by that next move, ranked by how
 * many dataset lines play it (ties: SAN order), and capped at 3. The
 * eco/name for a group come from the entry that names the continuation
 * most precisely — one whose line ends exactly on the continuation move
 * when such an entry exists, else the longest-named entry playing it.
 * Returns [] when the dataset has no continuation for the position.
 */
export function bookContinuations(
  sequenceSan: readonly string[],
  index: OpeningIndex,
): BookContinuation[] {
  const seq = sequenceSan.map(sanCore);
  const groups = new Map<
    string,
    { san: string; count: number; exact: IndexedOpeningEntry | null; fallback: IndexedOpeningEntry }
  >();
  for (const entry of index.values()) {
    const tokens = sanTokensOf(entry.pgn);
    if (tokens.length <= seq.length) continue;
    let isExtension = true;
    for (let i = 0; i < seq.length; i += 1) {
      if (sanCore(tokens[i]) !== seq[i]) {
        isExtension = false;
        break;
      }
    }
    if (!isExtension) continue;
    const next = tokens[seq.length];
    const key = sanCore(next);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        san: next,
        count: 1,
        exact: tokens.length === seq.length + 1 ? entry : null,
        fallback: entry,
      });
    } else {
      group.count += 1;
      if (tokens.length === seq.length + 1 && !group.exact) group.exact = entry;
      if (entry.name.length > group.fallback.name.length) group.fallback = entry;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.san.localeCompare(b.san))
    .slice(0, 3)
    .map((g) => {
      const rep = g.exact ?? g.fallback;
      return { san: g.san, eco: rep.eco, name: rep.name };
    });
}

/**
 * Same lookup, starting from a game's position list instead of its SAN
 * sequence: the SAN sequence is reconstructed move by move from the
 * FENs (fens[0] = start position).
 */
export function bookContinuationsFromFens(fens: string[], index: OpeningIndex): BookContinuation[] {
  const sequenceSan: string[] = [];
  for (let i = 1; i < fens.length; i += 1) {
    const san = sanBetween(fens[i - 1], fens[i]);
    if (san === undefined) break;
    sequenceSan.push(san);
  }
  return bookContinuations(sequenceSan, index);
}

// --- Browser loader -------------------------------------------------------

let cachedIndex: OpeningIndex | null = null;
let loadingPromise: Promise<OpeningIndex> | null = null;

// 'c2' is the second half of volume C, split into its own file so each
// shipped TSV stays small; the loader treats it as just another book file.
const TSV_FILES = ['a', 'b', 'c', 'c2', 'd', 'e'] as const;

/**
 * Fetch /openings/a.tsv … e.tsv, build the index and cache it in a module
 * variable. Thin by design — all logic lives in the pure functions above.
 * Resolves to an empty index when fetch is unavailable (e.g. in node).
 */
export function loadOpeningIndex(): Promise<OpeningIndex> {
  if (cachedIndex) return Promise.resolve(cachedIndex);
  if (loadingPromise) return loadingPromise;
  if (typeof fetch === 'undefined') {
    cachedIndex = new Map();
    return Promise.resolve(cachedIndex);
  }
  loadingPromise = (async () => {
    const entries: OpeningEntry[] = [];
    await Promise.all(
      TSV_FILES.map(async (letter) => {
        try {
          const response = await fetch(`/openings/${letter}.tsv`);
          if (!response.ok) return;
          entries.push(...parseOpeningsTsv(await response.text()));
        } catch {
          // A missing file just means a smaller book, not an error.
        }
      }),
    );
    cachedIndex = buildOpeningIndex(entries);
    loadingPromise = null;
    return cachedIndex;
  })();
  return loadingPromise;
}
