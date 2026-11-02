// Achieved-depth statistics for a finished review (Round 2, Prompt 3).
//
// Adaptive presets stop early on stable positions, so the depth a review
// was actually analyzed at is the mean of the per-ply achieved depths —
// not the preset's target. The review header shows this number next to
// the preset name so a shallow run can never masquerade as a deep one.
// Terminal positions (depth 0, exact scores, never searched) are excluded.

/** Mean achieved depth over searched plies (depth > 0); null when none were searched. */
export function averageAchievedDepth(plies: readonly { depth: number }[]): number | null {
  let sum = 0;
  let n = 0;
  for (const p of plies) {
    if (p.depth > 0) {
      sum += p.depth;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/** Median achieved depth over searched plies; null when none were searched. */
export function medianAchievedDepth(plies: readonly { depth: number }[]): number | null {
  const depths = plies
    .map((p) => p.depth)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (depths.length === 0) return null;
  const mid = Math.floor(depths.length / 2);
  return depths.length % 2 === 1 ? depths[mid] : (depths[mid - 1] + depths[mid]) / 2;
}
