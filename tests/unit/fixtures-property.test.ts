import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'games');
import { Chess } from 'chess.js';
import { classifySnapshot } from '../../scripts/calibrate-entry';
import { allSnapshotIds, loadSnapshot } from './fixtures-helper';
import { classifyMoveDetailed, computeEpl, type ClassifyInput } from '@/analysis/classify';
import { winProbForScore } from '@/analysis/winProbability';
import type { MoveClass } from '@/lib/types';

const BAND_RANK: Record<string, number> = {
  best: 0,
  excellent: 1,
  good: 2,
  inaccuracy: 3,
  mistake: 4,
  blunder: 5,
};

describe('fixture snapshots: integrity', () => {
  const ids = allSnapshotIds();

  it('there are at least 12 fixture games with snapshots', () => {
    expect(ids.length).toBeGreaterThanOrEqual(12);
  });

  for (const id of ids) {
    it(`${id}: snapshot matches its PGN ply-for-ply at depth 18, MultiPV 3`, () => {
      const pgn = readFileSync(join(FIXTURE_DIR, `${id}.pgn`), 'utf8');
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      const snap = loadSnapshot(id);
      expect(snap.depth).toBe(18);
      expect(snap.multiPv).toBe(3);
      expect(snap.positions.length).toBe(history.length + 1);
      for (let i = 0; i < snap.positions.length; i++) {
        const pos = snap.positions[i];
        expect(pos.ply).toBe(i);
        // The snapshot FEN must be the position the PGN actually reaches.
        const expectedFen = i === 0 ? history[0].before : history[i - 1].after;
        expect(pos.fen).toBe(expectedFen);
        if (i > 0) {
          expect(pos.move?.san).toBe(history[i - 1].san);
          expect(pos.move?.uci).toBe(
            history[i - 1].from + history[i - 1].to + (history[i - 1].promotion ?? ''),
          );
        }
        if (!pos.terminal) {
          expect(pos.lines.length).toBeGreaterThanOrEqual(1);
          expect(pos.lines[0].depth).toBe(18);
        }
      }
    });
  }
});

describe('property: determinism over fixture snapshots', () => {
  it('classifying every snapshot twice yields identical results', () => {
    for (const id of allSnapshotIds()) {
      const snap = loadSnapshot(id);
      const a = classifySnapshot(snap, 'balanced');
      const b = classifySnapshot(snap, 'balanced');
      expect(b).toEqual(a);
      expect(a.length).toBe(snap.positions.length - 1);
    }
  });
});

describe('property: EPL monotonicity within a position (band classes)', () => {
  it('a move with larger EPL never receives a strictly better BAND class', () => {
    // For every snapshot position, classify every engine line's move
    // with that line's own EPL. Brilliant/Great are excluded from the
    // ranking on purpose: by design they reward qualities beyond EPL
    // (a sound sacrifice with EPL 0.02 is Brilliant while the EPL-0 best
    // move is merely Best) — the monotonicity theorem is about the EPL
    // bands themselves. Miss is disabled by omitting prevPly.
    let compared = 0;
    let bandClassified = 0;
    for (const id of allSnapshotIds()) {
      const snap = loadSnapshot(id);
      for (let idx = 1; idx < snap.positions.length; idx++) {
        const prev = snap.positions[idx - 1];
        const curr = snap.positions[idx];
        if (prev.terminal || prev.lines.length < 2 || prev.legalMoveCount <= 1) continue;
        const moverWinAfterFor = (uci: string): number => {
          if (curr.move?.uci === uci) {
            if (curr.terminal) {
              const c = new Chess(curr.fen);
              return c.isCheckmate() ? 100 : 50;
            }
            const top = curr.lines[0];
            return top ? 100 - winProbForScore(top.scoreCp, top.scoreMate) : 50;
          }
          const line = prev.lines.find((l) => l.pv[0] === uci);
          return line ? winProbForScore(line.scoreCp, line.scoreMate) : 50;
        };
        const judged = prev.lines.map((line) => {
          const uci = line.pv[0];
          const wpAfter = moverWinAfterFor(uci);
          const wpBefore = winProbForScore(prev.lines[0].scoreCp, prev.lines[0].scoreMate);
          const input: ClassifyInput = {
            fenBefore: prev.fen,
            moveUci: uci,
            legalMoveCount: prev.legalMoveCount,
            isBookMove: false,
            linesBefore: prev.lines,
            winProbBefore: wpBefore,
            winProbAfter: wpAfter,
            epl: computeEpl(prev.lines, uci, wpAfter),
            brilliantUsedInWindow: 0,
            movesSinceStart: idx,
            lastMove:
              idx >= 2 && prev.move
                ? {
                    from: prev.move.from,
                    to: prev.move.to,
                    captured: prev.move.captured ?? undefined,
                    san: prev.move.san,
                  }
                : undefined,
          };
          return { epl: input.epl, cls: classifyMoveDetailed(input).classification as MoveClass };
        });
        for (const a of judged) {
          if (!(a.cls in BAND_RANK)) continue;
          bandClassified += 1;
          for (const b of judged) {
            if (!(b.cls in BAND_RANK)) continue;
            if (a.epl > b.epl) {
              compared += 1;
              expect(
                BAND_RANK[a.cls],
                `${id} ply ${idx}: epl ${a.epl.toFixed(3)} (${a.cls}) vs epl ${b.epl.toFixed(3)} (${b.cls})`,
              ).toBeGreaterThanOrEqual(BAND_RANK[b.cls]);
            }
          }
        }
      }
    }
    // The property must actually have been exercised, not vacuously true.
    expect(bandClassified).toBeGreaterThan(200);
    expect(compared).toBeGreaterThan(200);
  });
});

describe('property: color symmetry', () => {
  // Mirror a FEN: swap colors, flip ranks, swap the side to move and the
  // castling rights' case, mirror the en-passant square.
  function mirrorFen(fen: string): string {
    const [placement, turn, castling, ep, half, full] = fen.split(' ');
    const rows = placement.split('/');
    const mirrored = rows
      .slice()
      .reverse()
      .map((row) =>
        row
          .split('')
          .map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()))
          .join(''),
      )
      .join('/');
    const mirroredCastling =
      castling === '-'
        ? '-'
        : castling
            .split('')
            .map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()))
            .sort()
            .join('');
    const mirroredEp = ep === '-' ? '-' : `${ep[0]}${9 - Number(ep[1])}`;
    return `${mirrored} ${turn === 'w' ? 'b' : 'w'} ${mirroredCastling} ${mirroredEp} ${half} ${full}`;
  }
  function mirrorSquare(sq: string): string {
    return `${sq[0]}${9 - Number(sq[1])}`;
  }
  function mirrorUci(uci: string): string {
    return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);
  }

  it('mirrored positions and moves classify identically', () => {
    // Greek Gift, mirrored to Black: the black bishop on d6 takes the
    // h2 pawn with the same geometry.
    const fen = 'rnbq1rk1/ppp2ppp/3p1n2/2b1p3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';
    const mirrored = mirrorFen(fen);
    expect(mirrored.split(' ')[1]).toBe('b');
    const lines = [
      { multipv: 1, depth: 18, scoreCp: 150, pv: ['d3h7', 'g8h7', 'f3g5'] },
      { multipv: 2, depth: 18, scoreCp: 40, pv: ['f3e5'] },
      { multipv: 3, depth: 18, scoreCp: 0, pv: ['c1g5'] },
    ];
    const base: ClassifyInput = {
      fenBefore: fen,
      moveUci: 'd3h7',
      legalMoveCount: 35,
      isBookMove: false,
      linesBefore: lines,
      winProbBefore: 63,
      winProbAfter: 80,
      epl: 0.005,
      brilliantUsedInWindow: 0,
      movesSinceStart: 20,
    };
    const mirroredInput: ClassifyInput = {
      ...base,
      fenBefore: mirrored,
      moveUci: mirrorUci('d3h7'),
      linesBefore: lines.map((l) => ({ ...l, pv: l.pv.map(mirrorUci) })),
    };
    const a = classifyMoveDetailed(base);
    const b = classifyMoveDetailed(mirroredInput);
    expect(a.classification).toBe('brilliant');
    expect(b.classification).toBe(a.classification);
    expect(b.reason).toBe(a.reason);
  });

  it('mirrored EPL-band positions classify identically across the bands', () => {
    const fen = 'r2q1rk1/ppp1ppbp/2n2np1/8/3P4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 1';
    const mirrored = mirrorFen(fen);
    for (const epl of [0.001, 0.015, 0.04, 0.08, 0.15, 0.3]) {
      const common = {
        legalMoveCount: 30,
        isBookMove: false,
        linesBefore: [
          { multipv: 1, depth: 18, scoreCp: 20, pv: ['d2d4'] },
          { multipv: 2, depth: 18, scoreCp: 10, pv: ['e2e4'] },
        ],
        winProbBefore: 52,
        winProbAfter: 52,
        brilliantUsedInWindow: 0,
        movesSinceStart: 12,
      };
      const a = classifyMoveDetailed({ ...common, fenBefore: fen, moveUci: 'e2e4', epl });
      const b = classifyMoveDetailed({
        ...common,
        fenBefore: mirrored,
        moveUci: mirrorUci('e2e4'),
        linesBefore: common.linesBefore.map((l) => ({ ...l, pv: l.pv.map(mirrorUci) })),
        epl,
      });
      expect(b.classification).toBe(a.classification);
    }
  });
});
