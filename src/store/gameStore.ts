import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { GameReview, MoveClass, ParsedGame, PlyAnalysis, VariationNode } from '@/lib/types';

export type ParsedGameWithPgn = ParsedGame & { pgn: string };

export interface ExploreState {
  basePly: number; // position index in the main line where the branch starts
  chain: string[]; // variation node ids from root to current node
}

export interface RetryState {
  basePly: number; // position index before the move to retry
  verdict: 'waiting' | 'best' | 'better' | 'again';
}

interface GameStore {
  parsed: ParsedGameWithPgn | null;
  review: GameReview | null;
  partialPlies: PlyAnalysis[];
  analyzing: boolean;
  progress: { done: number; total: number } | null;
  currentPly: number;
  orientation: 'w' | 'b';
  filterClass: MoveClass | null;
  explore: ExploreState | null;
  variations: VariationNode[];
  retry: RetryState | null;
  previewUci: string[] | null;

  loadParsed: (p: ParsedGameWithPgn) => void;
  setReview: (r: GameReview | null) => void;
  setPartialPlies: (plies: PlyAnalysis[], done: number, total: number) => void;
  setAnalyzing: (v: boolean) => void;
  goToPly: (ply: number) => void;
  step: (dir: 1 | -1) => void;
  flip: () => void;
  setFilterClass: (c: MoveClass | null) => void;
  playUserMove: (uci: string) => boolean;
  exitExplore: () => void;
  selectVariationNode: (id: string) => void;
  deleteVariation: (id: string) => void;
  promoteVariation: (id: string) => void;
  setRetry: (r: RetryState | null) => void;
  setPreviewUci: (uci: string[] | null) => void;
  reset: () => void;
}

let nodeSeq = 0;
const nextId = (): string => `var-${++nodeSeq}-${Date.now().toString(36)}`;

function findNode(
  nodes: VariationNode[],
  id: string,
): { node: VariationNode; path: string[] } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, path: [n.id] };
    const sub = findNode(n.children, id);
    if (sub) return { node: sub.node, path: [n.id, ...sub.path] };
  }
  return null;
}

function removeNode(nodes: VariationNode[], id: string): VariationNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

function addChild(
  nodes: VariationNode[],
  parentId: string | null,
  child: VariationNode,
  basePly: number,
): VariationNode[] {
  if (parentId === null) {
    void basePly;
    return [...nodes, child];
  }
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, child] }
      : { ...n, children: addChild(n.children, parentId, child, basePly) },
  );
}

export function currentFen(s: {
  parsed: ParsedGameWithPgn | null;
  review: GameReview | null;
  currentPly: number;
  explore: ExploreState | null;
  variations: VariationNode[];
  previewUci: string[] | null;
}): string {
  const start = s.review?.plies[0]?.fen ?? s.parsed?.startFen ?? new Chess().fen();
  let fen = start;
  if (s.explore && s.explore.chain.length > 0) {
    const found = findNode(s.variations, s.explore.chain[s.explore.chain.length - 1]);
    fen = found?.node.fen ?? fen;
  } else if (s.explore) {
    fen = s.parsed?.fens[s.explore.basePly] ?? fen;
  } else if (s.review) {
    fen = s.review.plies[s.currentPly]?.fen ?? fen;
  } else if (s.parsed) {
    fen = s.parsed.fens[s.currentPly] ?? fen;
  }
  if (s.previewUci && s.previewUci.length > 0) {
    const chess = new Chess(fen);
    for (const uci of s.previewUci) {
      try {
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        break;
      }
    }
    return chess.fen();
  }
  return fen;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  parsed: null,
  review: null,
  partialPlies: [],
  analyzing: false,
  progress: null,
  currentPly: 0,
  orientation: 'w',
  filterClass: null,
  explore: null,
  variations: [],
  retry: null,
  previewUci: null,

  loadParsed: (p) =>
    set({
      parsed: p,
      review: null,
      partialPlies: [],
      currentPly: 0,
      explore: null,
      variations: [],
      retry: null,
      previewUci: null,
      filterClass: null,
      progress: null,
    }),

  setReview: (r) => set({ review: r, partialPlies: r ? r.plies : [] }),
  setPartialPlies: (plies, done, total) => set({ partialPlies: plies, progress: { done, total } }),
  setAnalyzing: (v) => set({ analyzing: v, progress: v ? get().progress : null }),

  goToPly: (ply) => {
    const max = (get().review?.plies.length ?? get().parsed?.fens.length ?? 1) - 1;
    set({ currentPly: Math.max(0, Math.min(ply, max)), explore: null, previewUci: null });
  },
  step: (dir) => get().goToPly(get().currentPly + dir),
  flip: () => set((s) => ({ orientation: s.orientation === 'w' ? 'b' : 'w' })),
  setFilterClass: (c) => set({ filterClass: c }),

  playUserMove: (uci) => {
    const s = get();
    const fen = currentFen({ ...s, previewUci: null });
    const chess = new Chess(fen);
    let mv;
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    const newFen = chess.fen();

    // Following the main line exactly? Just advance.
    if (!s.explore && s.parsed) {
      const nextPly = s.currentPly + 1;
      const gameUci = s.review?.plies[nextPly]?.uci;
      if (gameUci === uci) {
        set({ currentPly: nextPly, previewUci: null });
        return true;
      }
    }

    // Otherwise branch into (or extend) a variation.
    const basePly = s.explore ? s.explore.basePly : s.currentPly;
    const parentId =
      s.explore && s.explore.chain.length > 0 ? s.explore.chain[s.explore.chain.length - 1] : null;

    if (parentId) {
      const found = findNode(s.variations, parentId);
      const existing = found?.node.children.find((c) => c.uci === uci);
      if (existing) {
        set({ explore: { basePly, chain: [...s.explore!.chain, existing.id] }, previewUci: null });
        return true;
      }
    } else {
      const existingRoot = s.variations.find((v) => v.parentPly === basePly && v.uci === uci);
      if (existingRoot) {
        set({ explore: { basePly, chain: [existingRoot.id] }, previewUci: null });
        return true;
      }
    }

    const node: VariationNode = {
      id: nextId(),
      san: mv.san,
      uci,
      fen: newFen,
      parentPly: basePly,
      children: [],
    };
    const variations = addChild(s.variations, parentId, node, basePly);
    set({
      variations,
      explore: { basePly, chain: [...(s.explore?.chain ?? []), node.id] },
      previewUci: null,
    });
    return true;
  },

  exitExplore: () => set({ explore: null, previewUci: null }),

  selectVariationNode: (id) => {
    const s = get();
    const found = findNode(s.variations, id);
    if (!found) return;
    // Root's parentPly is the base; reconstruct base from root node.
    let root: VariationNode | undefined;
    let cur: VariationNode[] = s.variations;
    for (const pid of found.path) {
      root = cur.find((n) => n.id === pid);
      if (!root) break;
      cur = root.children;
    }
    const basePly = s.variations.find((v) => v.id === found.path[0])?.parentPly ?? s.currentPly;
    void root;
    set({ explore: { basePly, chain: found.path }, previewUci: null });
  },

  deleteVariation: (id) => {
    const s = get();
    set({
      variations: removeNode(s.variations, id),
      explore: s.explore?.chain.includes(id)
        ? { basePly: s.explore.basePly, chain: [] }
        : s.explore,
    });
  },

  promoteVariation: (id) => {
    const s = get();
    if (!s.parsed) return;
    const found = findNode(s.variations, id);
    if (!found) return;
    const basePly = s.variations.find((v) => v.id === found.path[0])?.parentPly ?? 0;
    const chainNodes: VariationNode[] = [];
    let level = s.variations;
    for (const pid of found.path) {
      const n = level.find((x) => x.id === pid);
      if (!n) return;
      chainNodes.push(n);
      level = n.children;
    }
    const moves = [...s.parsed.moves.slice(0, basePly), ...chainNodes.map((n) => n.san)];
    const fens = [...s.parsed.fens.slice(0, basePly + 1), ...chainNodes.map((n) => n.fen)];
    const clocksMs = [...s.parsed.clocksMs.slice(0, basePly), ...chainNodes.map(() => null)];
    set({
      parsed: { ...s.parsed, moves, fens, clocksMs },
      review: null,
      partialPlies: [],
      variations: [],
      explore: null,
      currentPly: basePly + chainNodes.length,
    });
  },

  setRetry: (r) => set({ retry: r }),
  setPreviewUci: (uci) => set({ previewUci: uci }),
  reset: () =>
    set({
      parsed: null,
      review: null,
      partialPlies: [],
      analyzing: false,
      progress: null,
      currentPly: 0,
      explore: null,
      variations: [],
      retry: null,
      previewUci: null,
      filterClass: null,
    }),
}));
