// Win/Draw/Loss display maths (Prompt 6).
//
// Stockfish reports WDL per mille (0..1000 each) from the perspective of
// the SIDE TO MOVE (UCI_ShowWDL). The UI always shows WDL from WHITE's
// perspective, so when Black is to move the win and loss shares swap.
// Percentages are integers that must sum to exactly 100: each share is
// scaled from per mille and rounded with the largest-remainder method
// (floor everything, then hand the leftover points to the largest
// fractional remainders, ties broken W → D → L).

export interface WdlPercentages {
  /** White wins, percent 0..100. */
  w: number;
  /** Draw, percent 0..100. */
  d: number;
  /** White loses (Black wins), percent 0..100. */
  l: number;
}

/** Largest-remainder rounding of three non-negative shares to integers summing to `total`. */
function largestRemainder(
  shares: [number, number, number],
  total: number,
): [number, number, number] {
  const floors: [number, number, number] = [
    Math.floor(shares[0]),
    Math.floor(shares[1]),
    Math.floor(shares[2]),
  ];
  let leftover = total - (floors[0] + floors[1] + floors[2]);
  const order = [0, 1, 2].sort((a, b) => {
    const fracDiff = shares[b] - Math.floor(shares[b]) - (shares[a] - Math.floor(shares[a]));
    return fracDiff !== 0 ? fracDiff : a - b;
  });
  for (const idx of order) {
    if (leftover <= 0) break;
    floors[idx] += 1;
    leftover -= 1;
  }
  // Degenerate inputs (e.g. shares summing above total) — trim from the
  // smallest remainders so the invariant "sums to total" still holds.
  for (const idx of [...order].reverse()) {
    if (leftover >= 0) break;
    const cut = Math.min(floors[idx], -leftover);
    floors[idx] -= cut;
    leftover += cut;
  }
  return floors;
}

/**
 * Convert a side-to-move per-mille WDL triple to White-perspective
 * integer percentages summing to exactly 100. When Black is to move,
 * W and L swap (Black's "wins" are White's losses). Returns null when
 * the input is missing or all-zero (no WDL to show).
 */
export function wdlToWhitePercentages(
  wdl: readonly [number, number, number] | undefined | null,
  sideToMove: 'w' | 'b',
): WdlPercentages | null {
  if (!wdl) return null;
  const [wRaw, dRaw, lRaw] = wdl;
  if (![wRaw, dRaw, lRaw].every((v) => Number.isFinite(v))) return null;
  const sum = wRaw + dRaw + lRaw;
  if (sum <= 0) return null;
  // Normalise to a 1000 total first so slightly off per-mille sums from
  // the engine still produce exact percentages.
  const scale = 1000 / sum;
  const stm: [number, number, number] = [wRaw * scale, dRaw * scale, lRaw * scale];
  const white: [number, number, number] = sideToMove === 'b' ? [stm[2], stm[1], stm[0]] : stm;
  const [w, d, l] = largestRemainder(
    [(white[0] / 1000) * 100, (white[1] / 1000) * 100, (white[2] / 1000) * 100],
    100,
  );
  return { w, d, l };
}

/** "W 38% · D 52% · L 10%" — the compact label used by the bar and tooltips. */
export function formatWdl(p: WdlPercentages): string {
  return `W ${p.w}% · D ${p.d}% · L ${p.l}%`;
}
