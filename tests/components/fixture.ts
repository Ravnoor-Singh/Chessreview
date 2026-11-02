import { Chess } from 'chess.js';
import type { GameReview, MoveClass, PlyAnalysis } from '@/lib/types';

export interface PlySpec {
  classification?: MoveClass;
  epl?: number;
  clockMs?: number;
  timeSpentMs?: number;
}

/** Build plies by playing SANs on a real board (real FENs and colours). */
export function buildPlies(sans: string[], specs: PlySpec[] = []): PlyAnalysis[] {
  const chess = new Chess();
  const plies: PlyAnalysis[] = [
    { ply: 0, fen: chess.fen(), evalWhiteCp: 0, lines: [], depth: 0, winProbWhite: 50 },
  ];
  sans.forEach((san, i) => {
    const mv = chess.move(san);
    const spec = specs[i] ?? {};
    plies.push({
      ply: i + 1,
      fen: chess.fen(),
      san,
      uci: mv.from + mv.to + (mv.promotion ?? ''),
      color: mv.color,
      evalWhiteCp: 0,
      lines: [],
      depth: 0,
      winProbWhite: 50,
      classification: spec.classification,
      epl: spec.epl,
      clockMs: spec.clockMs,
      timeSpentMs: spec.timeSpentMs,
    });
  });
  return plies;
}

export function buildReview(sans: string[], specs: PlySpec[] = []): GameReview {
  const counts = () => ({
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    forced: 0,
  });
  return {
    id: 'component-fixture',
    pgn: '',
    headers: { White: 'Alice', Black: 'Bob', TimeControl: '600+5' },
    plies: buildPlies(sans, specs),
    accuracy: { white: 90, black: 85 },
    counts: { white: counts(), black: counts() },
    acpl: { white: 24, black: 41 },
    engine: { name: 'Stockfish', depth: 18, mode: 'multi' },
    createdAt: 0,
  };
}
