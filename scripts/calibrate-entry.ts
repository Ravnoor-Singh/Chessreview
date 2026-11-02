// Calibration entry point (Prompt 4) — bundled on the fly by
// scripts/calibrate.mjs with esbuild so the calibration runs the REAL
// classifier (src/analysis/classify.ts), not a reimplementation.
//
// Given one fixture snapshot (tests/fixtures/games/<id>.json, produced
// by scripts/make-fixtures.mjs from the real Stockfish at depth 18,
// MultiPV 3), it reconstructs exactly the ClassifyInput the analyzer
// builds for a main-line ply — lines before, win probabilities from the
// snapshot lines, EPL via computeEpl, legal move count, lastMove (for
// exact recapture detection) and the per-side brilliant soft-cap window
// — and classifies every ply. Book detection is the one analyzer input
// a snapshot cannot supply (it needs the opening index), so book plies
// are classified on their EPL merits here; CALIBRATION.md says so.

import { Chess } from 'chess.js';
import { classifyMoveDetailed, computeEpl, type LastMoveInfo } from '@/analysis/classify';
import { winProbForScore } from '@/analysis/winProbability';
import type { ClassificationProfileName } from '@/lib/constants';
import type { EngineLine, MoveClass } from '@/lib/types';

export interface SnapshotMove {
  san: string;
  uci: string;
  from: string;
  to: string;
  captured: string | null;
  promotion: string | null;
}

export interface SnapshotPosition {
  ply: number;
  fen: string;
  move: SnapshotMove | null;
  legalMoveCount: number;
  terminal: boolean;
  lines: EngineLine[];
}

export interface Snapshot {
  gameId: string;
  depth: number;
  multiPv: number;
  positions: SnapshotPosition[];
}

export interface PlyResult {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  classification: MoveClass;
  reason: string;
  epl: number;
}

/** Mover-perspective win% of the side to move at a snapshot position. */
function moverWinProbAt(pos: SnapshotPosition): number {
  if (pos.terminal) {
    const chess = new Chess(pos.fen);
    if (chess.isCheckmate()) return 0; // side to move is mated
    return 50; // stalemate / draw
  }
  const top = pos.lines[0];
  if (!top) return 50;
  return winProbForScore(top.scoreCp, top.scoreMate);
}

export function classifySnapshot(
  snapshot: Snapshot,
  profile: ClassificationProfileName = 'balanced',
): PlyResult[] {
  const results: PlyResult[] = [];
  const brilliantPlies: Record<'w' | 'b', number[]> = { w: [], b: [] };
  const wpBeforeByPly = new Map<number, number>();

  for (let idx = 1; idx < snapshot.positions.length; idx++) {
    const prev = snapshot.positions[idx - 1];
    const curr = snapshot.positions[idx];
    const move = curr.move;
    if (!move) continue;
    const mover: 'w' | 'b' = prev.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const wpBefore = moverWinProbAt(prev);
    // After the move it is the opponent to move at `curr`; the mover's
    // win% is the complement — except a terminal mate, where the mover
    // who delivered mate has 100 and a drawn terminal is 50.
    let wpAfter: number;
    if (curr.terminal) {
      const chess = new Chess(curr.fen);
      wpAfter = chess.isCheckmate() ? 100 : 50;
    } else {
      wpAfter = 100 - moverWinProbAt(curr);
    }
    wpBeforeByPly.set(idx, wpBefore);
    const epl = computeEpl(prev.lines, move.uci, wpAfter);
    const lastMoveRaw = prev.move;
    const lastMove: LastMoveInfo | undefined =
      idx >= 2 && lastMoveRaw
        ? {
            from: lastMoveRaw.from,
            to: lastMoveRaw.to,
            captured: lastMoveRaw.captured ?? undefined,
            san: lastMoveRaw.san,
          }
        : undefined;
    const prevResult = results[results.length - 1];
    const detailed = classifyMoveDetailed({
      fenBefore: prev.fen,
      moveUci: move.uci,
      legalMoveCount: prev.legalMoveCount,
      isBookMove: false,
      linesBefore: prev.lines,
      winProbBefore: wpBefore,
      winProbAfter: wpAfter,
      epl,
      prevPly:
        idx >= 2 && prevResult
          ? {
              classification: prevResult.classification,
              winProbMoverBefore: 100 - (wpBeforeByPly.get(idx - 1) ?? 50),
            }
          : undefined,
      brilliantUsedInWindow: brilliantPlies[mover].filter((p) => idx - p <= 10).length,
      movesSinceStart: idx,
      lastMove,
      profile,
    });
    if (detailed.classification === 'brilliant') brilliantPlies[mover].push(idx);
    results.push({
      ply: idx,
      san: move.san,
      uci: move.uci,
      color: mover,
      classification: detailed.classification,
      reason: detailed.reason,
      epl,
    });
  }
  return results;
}
