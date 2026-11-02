/**
 * Screenshot-recognition accuracy suite (Prompt 8) — the proof behind the
 * numbers quoted in the README's "Image import" section.
 *
 * Fixtures are rendered by scripts/make-vision-fixtures.mjs from known
 * FENs with the app's own piece sets; ground truth (FEN + exact board
 * rectangle) is in tests/fixtures/vision/manifest.json. Further variants
 * (upscale+border, JPEG q85, gutter band, Gaussian noise) are derived
 * in-test from the clean bases. Everything runs through the exact shipped
 * pipeline (`recognizeImage` with templates from all five piece sets,
 * same as the browser worker).
 *
 * Targets (asserted):
 *   clean rendered fixtures  ≥ 98% square accuracy (spec target)
 *   realistic phone fixtures ≥ 95% square accuracy (the Beta-drop bar)
 *   derived variants         ≥ 97% square accuracy
 *   rotated / heavy-JPEG     REPORTED ONLY — no target is promised
 * Mean per-image time on this machine is printed and asserted < 1.5 s.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { recognizeImage } from '@/vision/pipeline';
import type { PieceRasterMap, RgbaImage } from '@/vision/types';
import {
  FIXTURES_DIR,
  decodeImageBuffer,
  decodeImageFile,
  expectedSquares,
  loadManifest,
  pieceRasters,
  type FixtureEntry,
} from './vision-fixtures-helper';

let sets: PieceRasterMap[];
let manifest: FixtureEntry[];

beforeAll(async () => {
  sets = await Promise.all(
    ['cburnett', 'neo', 'staunton-wood', 'minimal', 'high-contrast'].map(pieceRasters),
  );
  manifest = await loadManifest();
}, 120000);

interface Score {
  images: number;
  detected: number;
  correct: number;
  total: number;
  perfect: number;
  msSum: number;
  meanConfidenceSum: number;
  worstRectErr: number;
}

function newScore(): Score {
  return {
    images: 0,
    detected: 0,
    correct: 0,
    total: 0,
    perfect: 0,
    msSum: 0,
    meanConfidenceSum: 0,
    worstRectErr: 0,
  };
}

function scoreImage(
  score: Score,
  image: RgbaImage,
  entry: FixtureEntry,
  rectScale = 1,
  rectOff = 0,
): void {
  score.images++;
  const t0 = performance.now();
  const out = recognizeImage(image, sets);
  score.msSum += performance.now() - t0;
  if (out.status !== 'ok') return;
  score.detected++;
  score.meanConfidenceSum += out.result.meanConfidence;
  const gt = entry.boardRect;
  if (gt) {
    const err = Math.max(
      Math.abs(out.result.board.x - (gt.x * rectScale + rectOff)),
      Math.abs(out.result.board.y - (gt.y * rectScale + rectOff)),
      Math.abs(out.result.board.size - gt.size * rectScale),
    );
    score.worstRectErr = Math.max(score.worstRectErr, err);
  }
  const expected = expectedSquares(entry.fen);
  let correctHere = 0;
  out.result.squares.forEach((s, i) => {
    score.total++;
    if (s.piece === expected[i]) {
      score.correct++;
      correctHere++;
    }
  });
  if (correctHere === 64) score.perfect++;
}

function report(label: string, s: Score): string {
  const acc = s.total > 0 ? ((100 * s.correct) / s.total).toFixed(2) : '—';
  const conf = s.detected > 0 ? (s.meanConfidenceSum / s.detected).toFixed(3) : '—';
  return (
    `${label}: images=${s.images} detected=${s.detected} squareAcc=${acc}% ` +
    `(${s.correct}/${s.total}) perfectBoards=${s.perfect} meanConf=${conf} ` +
    `avgMs=${(s.msSum / Math.max(1, s.images)).toFixed(0)} worstRectErr=${s.worstRectErr.toFixed(1)}px`
  );
}

describe('vision fixtures — clean rendered set', () => {
  it('detects every board and reaches >= 98% square accuracy', async () => {
    const entries = manifest.filter((e) => e.kind === 'clean');
    expect(entries.length).toBe(80);
    const score = newScore();
    const perSet = new Map<string, Score>();
    for (const entry of entries) {
      const image = await decodeImageFile(entry.file);
      scoreImage(score, image, entry);
      const s = perSet.get(entry.set) ?? newScore();
      scoreImage(s, image, entry);
      perSet.set(entry.set, s);
    }
    console.log(report('CLEAN', score));
    for (const [set, s] of perSet) console.log(report(`  clean/${set}`, s));

    expect(score.detected).toBe(80);
    expect(score.correct / score.total).toBeGreaterThanOrEqual(0.98);
    for (const [, s] of perSet) {
      expect(s.correct / s.total).toBeGreaterThanOrEqual(0.97);
    }
    // Rectangle accuracy: worst error across all 80 boards.
    expect(score.worstRectErr).toBeLessThanOrEqual(7);
    // Speed: spec asks < 1.5 s for a 1080p screenshot on a normal laptop.
    expect(score.msSum / score.images).toBeLessThan(1500);
  }, 300000);
});

describe('vision fixtures — derived variants of the clean bases', () => {
  it('upscale+border, JPEG q85, gutter band and noise stay >= 97%', async () => {
    const base = manifest.filter(
      (e) =>
        e.kind === 'clean' && (e.set === 'cburnett' || e.set === 'minimal') && e.theme === 'green',
    );
    expect(base.length).toBe(16);
    const results = new Map<string, Score>();

    const mulberry32 = (seed: number) => () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (const entry of base) {
      const file = path.join(FIXTURES_DIR, entry.file);

      const up = await sharp(file)
        .resize(1120, 1120)
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#202020' })
        .png()
        .toBuffer();
      const upScore = results.get('upscale+border') ?? newScore();
      scoreImage(upScore, await decodeImageBuffer(up), entry, 2, 40);
      results.set('upscale+border', upScore);

      const jpg = await sharp(file).jpeg({ quality: 85 }).toBuffer();
      const jpgScore = results.get('jpeg-q85') ?? newScore();
      scoreImage(jpgScore, await decodeImageBuffer(jpg), entry);
      results.set('jpeg-q85', jpgScore);

      const gut = await sharp(file)
        .extend({ top: 48, left: 48, background: '#3a3633' })
        .png()
        .toBuffer();
      const gutScore = results.get('gutter-band') ?? newScore();
      scoreImage(gutScore, await decodeImageBuffer(gut), entry, 1, 48);
      results.set('gutter-band', gutScore);

      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rand = mulberry32(42);
      const noisy = Buffer.from(data);
      for (let i = 0; i < noisy.length; i += 4) {
        const n = (rand() + rand() + rand() - 1.5) * 11.5; // ~Gaussian, sigma ≈ 10
        noisy[i] = Math.max(0, Math.min(255, noisy[i] + n));
        noisy[i + 1] = Math.max(0, Math.min(255, noisy[i + 1] + n));
        noisy[i + 2] = Math.max(0, Math.min(255, noisy[i + 2] + n));
      }
      const noiseBuf = await sharp(noisy, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toBuffer();
      const noiseScore = results.get('noise-sigma10') ?? newScore();
      scoreImage(noiseScore, await decodeImageBuffer(noiseBuf), entry);
      results.set('noise-sigma10', noiseScore);
    }

    for (const [label, s] of results) {
      console.log(report(`VARIANT ${label}`, s));
      expect(s.detected).toBe(16);
      expect(s.correct / s.total).toBeGreaterThanOrEqual(0.97);
    }
  }, 300000);
});

describe('vision fixtures — realistic phone screenshots', () => {
  it('reaches >= 95% square accuracy (the Beta-drop bar)', async () => {
    const entries = manifest.filter((e) => e.kind === 'realistic');
    expect(entries.length).toBe(16);
    const score = newScore();
    for (const entry of entries) {
      scoreImage(score, await decodeImageFile(entry.file), entry);
    }
    console.log(report('REALISTIC', score));
    expect(score.detected).toBe(16);
    expect(score.correct / score.total).toBeGreaterThanOrEqual(0.95);
    expect(score.msSum / score.images).toBeLessThan(1500);
  }, 300000);
});

describe('vision fixtures — rotated / heavily compressed', () => {
  it('reaches >= 90% square accuracy via the deskew path (Round 2 target)', async () => {
    const entries = manifest.filter((e) => e.kind === 'rotated');
    expect(entries.length).toBe(6);
    const score = newScore();
    for (const entry of entries) {
      scoreImage(score, await decodeImageFile(entry.file), entry);
    }
    console.log(report('ROTATED/COMPRESSED', score));
    // Round 1 measured 55.47% here and rotation was out of scope. Round 2
    // Prompt 8 added the deskew retry; the target for rotation <= 5° and
    // JPEG q50 is >= 90%. Measured at the prompt's close: 97.92%.
    expect(score.detected).toBe(6);
    expect(score.correct / score.total).toBeGreaterThanOrEqual(0.9);
    // Confidence still runs lower than on the clean set, so the review
    // UI's low-confidence warning keeps firing for tilted inputs.
    const clean = newScore();
    for (const entry of manifest.filter((e) => e.kind === 'clean').slice(0, 16)) {
      scoreImage(clean, await decodeImageFile(entry.file), entry);
    }
    const rotatedConf = score.meanConfidenceSum / Math.max(1, score.detected);
    const cleanConf = clean.meanConfidenceSum / Math.max(1, clean.detected);
    console.log(`meanConf rotated=${rotatedConf.toFixed(3)} clean=${cleanConf.toFixed(3)}`);
    expect(rotatedConf).toBeLessThan(cleanConf);
  }, 300000);
});

describe('vision fixtures — real screenshots (lichess)', () => {
  it('reaches >= 98% square accuracy on genuine lichess screenshots', async () => {
    const entries = manifest.filter((e) => e.kind === 'screenshot');
    expect(entries.length).toBe(26);
    const score = newScore();
    for (const entry of entries) {
      scoreImage(score, await decodeImageFile(entry.file), entry);
    }
    console.log(report('SCREENSHOT (lichess)', score));
    // The Beta-label bar for real screenshots is 95%; measured 100.00%
    // (1664/1664) at Round 2 Prompt 8's close. The 98% floor here is a
    // regression tripwire, not the label rule itself.
    expect(score.detected).toBe(26);
    expect(score.correct / score.total).toBeGreaterThanOrEqual(0.98);
  }, 300000);
});

describe('vision fixtures — photographs of physical boards', () => {
  it('detects the boards and reports accuracy (below the Beta bar by measurement)', async () => {
    const entries = manifest.filter((e) => e.kind === 'photo');
    expect(entries.length).toBe(3);
    const score = newScore();
    for (const entry of entries) {
      scoreImage(score, await decodeImageFile(entry.file), entry);
    }
    console.log(report('PHOTO', score));
    // Measured 28.65% at Round 2 Prompt 8's close — far below the 85%
    // the Beta rule requires for photographs, which is exactly why the
    // Beta label was restored. Detection is the weak stage (perspective
    // photos defeat the periodicity detector); these floors only trip on
    // total breakage, they do not claim the category is good.
    expect(score.detected).toBeGreaterThanOrEqual(2);
    expect(score.correct / score.total).toBeGreaterThanOrEqual(0.2);
  }, 300000);
});
