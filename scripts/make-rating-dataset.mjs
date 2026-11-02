// Rating dataset builder (Prompt 5, requirement 3) — ONLINE tool.
//
//   node scripts/make-rating-dataset.mjs [--write]
//
// Fetches public analysed games from the Lichess API for a spread of
// public accounts (titled + amateur), extracts one sample per player
// per game — (player rating, Lichess accuracy, Lichess ACPL) — and
// reports how well single-game (accuracy, ACPL) can predict the
// player's actual rating: binned-median fits and residual spread.
// With --write, the samples are saved to
// tests/fixtures/rating-dataset/dataset.json (the committed evidence
// behind the app's qualitative performance band — see
// src/analysis/rating.ts and README "How accuracy is computed").
//
// Measured on the committed dataset (250 games, 493 samples, ratings
// 949–3362): best model (OLS on accuracy + ACPL + accuracy²) residual
// SD ≈ 432 Elo, 80% band ≈ ±490 — far wider than the ≈ ±300 at which
// a numeric "performance rating" could be called meaningful. That is
// why the app shows a qualitative band, not a number.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const USERS = ['thibault', 'Zhigalko_Sergei', 'DrNykterstein', 'opperwezen', 'lovlas', 'EricRosen'];
const write = process.argv.includes('--write');

const samples = [];
const seen = new Set();
for (const user of USERS) {
  const url = `https://lichess.org/api/games/user/${user}` + `?max=100&analysed=true&accuracy=true`;
  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson', 'User-Agent': 'chess-review-rating-dataset/1.0' },
  });
  if (!res.ok) {
    console.error(`fetch failed for ${user}: HTTP ${res.status}`);
    process.exit(1);
  }
  const text = await res.text();
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    const g = JSON.parse(line);
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    if (g.variant !== 'standard' || !g.rated) continue;
    const plies = (g.moves ?? '').split(' ').filter(Boolean).length;
    if (plies < 20) continue;
    for (const color of ['white', 'black']) {
      const p = g.players[color];
      const a = p.analysis ?? {};
      if (a.accuracy === undefined || a.acpl === undefined) continue;
      if (p.rating === undefined || p.provisional) continue;
      samples.push({
        rating: p.rating,
        accuracy: a.accuracy,
        acpl: a.acpl,
        speed: g.speed,
        gameId: g.id,
        color,
      });
    }
  }
  // Be polite to the API.
  await new Promise((r) => setTimeout(r, 1000));
}

const ratings = samples.map((s) => s.rating).sort((a, b) => a - b);
console.log(
  `samples: ${samples.length} from ${new Set(samples.map((s) => s.gameId)).size} games; ` +
    `ratings ${ratings[0]}–${ratings[ratings.length - 1]}, median ${ratings[Math.floor(ratings.length / 2)]}`,
);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function fitReport(name, predict) {
  const resid = samples.map((s) => s.rating - predict(s)).sort((a, b) => a - b);
  const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
  const sd = Math.sqrt(resid.reduce((a, r) => a + (r - mean) ** 2, 0) / resid.length);
  const lo = percentile(resid, 10);
  const hi = percentile(resid, 90);
  console.log(
    `${name}: residual SD ${sd.toFixed(0)}, 80% band [${lo >= 0 ? '+' : ''}${lo.toFixed(0)}, ` +
      `${hi >= 0 ? '+' : ''}${hi.toFixed(0)}] (half-width ≈ ${((hi - lo) / 2).toFixed(0)})`,
  );
}

// Binned medians by accuracy (5-point bins).
const byBin = new Map();
for (const s of samples) {
  const bin = Math.min(95, Math.floor(s.accuracy / 5) * 5);
  if (!byBin.has(bin)) byBin.set(bin, []);
  byBin.get(bin).push(s.rating);
}
const binMedian = new Map();
for (const [bin, rs] of byBin) {
  const sorted = [...rs].sort((a, b) => a - b);
  binMedian.set(bin, sorted[Math.floor(sorted.length / 2)]);
}
fitReport('rating ~ accuracy (5-pt binned medians)', (s) =>
  binMedian.get(Math.min(95, Math.floor(s.accuracy / 5) * 5)),
);

// Binned medians by ACPL.
const acplEdges = [10, 20, 30, 40, 50, 65, 80, 100, 130];
const acplBin = (acpl) => acplEdges.filter((e) => acpl >= e).length;
const byAcplBin = new Map();
for (const s of samples) {
  const b = acplBin(s.acpl);
  if (!byAcplBin.has(b)) byAcplBin.set(b, []);
  byAcplBin.get(b).push(s.rating);
}
const acplMedian = new Map();
for (const [b, rs] of byAcplBin) {
  const sorted = [...rs].sort((a, b) => a - b);
  acplMedian.set(b, sorted[Math.floor(sorted.length / 2)]);
}
fitReport('rating ~ ACPL (binned medians)', (s) => acplMedian.get(acplBin(s.acpl)));

if (write) {
  const out = {
    description:
      'Rating-vs-(accuracy, ACPL) dataset from Lichess analysed games (Prompt 5, requirement 3). ' +
      'Evidence for the qualitative-rating decision: see README "How accuracy is computed". ' +
      'Regenerate with scripts/make-rating-dataset.mjs.',
    source:
      'GET https://lichess.org/api/games/user/{username}?analysed=true&accuracy=true for users ' +
      `${USERS.join(', ')} (public analysed games). Filters: variant=standard, rated, >=20 plies, ` +
      'non-provisional rating, analysis accuracy+acpl present.',
    samples,
  };
  const path = join(root, 'tests', 'fixtures', 'rating-dataset', 'dataset.json');
  writeFileSync(path, JSON.stringify(out, null, 0) + '\n');
  console.log(`wrote ${path}`);
}
