/**
 * The full screenshot pipeline: detect the board, then recognize squares.
 * Shared by the Web Worker (browser) and the fixture tests (Node) so the
 * measured test accuracy is the accuracy of the exact shipped code path.
 *
 * Retry ladder: the plain axis-aligned path answers confident inputs
 * directly (the common case — a clean screenshot never pays for the
 * retries). When its mean confidence is low, progressively stronger
 * geometry/contrast recoveries are attempted, and a retry is adopted only
 * when it beats the incumbent by a clear margin, so a retry can never
 * make a good result worse:
 *   1. quad    — perspective refinement of the detected rectangle into a
 *                quadrilateral, sampled through its homography (photos).
 *   2. deskew  — estimate the board's tilt, rotate it level, and re-run
 *                detection + recognition (rotated screenshots/photos).
 *   3. normalize — CLAHE-like local contrast normalization, recognized
 *                with the plain rectangle (murky, unevenly lit photos).
 * Whichever path wins, the reported board rectangle is the original
 * axis-aligned detection (an approximation the confirm UI uses only as a
 * visual guide; the squares are the product).
 */

import { detectBoard, refineBoardQuad } from './detectBoard';
import { estimateSkewDegrees, rotateGray } from './geometry';
import { localContrastNormalize, rgbaToGray } from './image';
import { recognizeSquaresGray, recognizeSquaresQuad } from './recognize';
import type {
  GrayImage,
  PieceRasterMap,
  RecognitionResult,
  RgbaImage,
  SquareResult,
} from './types';

export type PipelineOutcome =
  | {
      status: 'ok';
      result: RecognitionResult;
      detectMs: number;
      recognizeMs: number;
      /** Which path produced the result (observability for tests/support). */
      path: 'rect' | 'quad' | 'deskew' | 'normalize';
    }
  /** No board with convincing checkerboard evidence was found. */
  | { status: 'not-found'; detectMs: number };

/** Mean confidence at/above which the plain path is trusted as-is. */
const CONFIDENT_ENOUGH = 0.8;
/** A retry must beat the incumbent by at least this much to be adopted. */
const ADOPT_MARGIN = 0.03;

function meanConfidenceOf(squares: SquareResult[]): number {
  return squares.reduce((acc, s) => acc + s.confidence, 0) / squares.length;
}

export function recognizeImage(
  image: RgbaImage,
  sets: PieceRasterMap[],
  onStage?: (stage: 'detecting' | 'recognizing') => void,
): PipelineOutcome {
  onStage?.('detecting');
  const t0 = performance.now();
  const gray: GrayImage = rgbaToGray(image);
  let board = detectBoard(gray);
  let workingGray = gray;
  let deskewed = false;

  // A strongly tilted board can defeat axis-aligned detection entirely;
  // one deskewed detection attempt before declaring "not found". (The
  // estimator returns the correction angle to apply, not the tilt.)
  if (!board) {
    const skew = estimateSkewDegrees(gray);
    if (Math.abs(skew) >= 0.75) {
      const rotated = rotateGray(gray, (skew * Math.PI) / 180);
      const retry = detectBoard(rotated);
      if (retry) {
        board = retry;
        workingGray = rotated;
        deskewed = true;
      }
    }
  }
  const detectMs = performance.now() - t0;
  if (!board) return { status: 'not-found', detectMs };

  onStage?.('recognizing');
  const t1 = performance.now();
  let path: 'rect' | 'quad' | 'deskew' | 'normalize' = deskewed ? 'deskew' : 'rect';
  let squares = recognizeSquaresGray(workingGray, board, sets);
  let best = meanConfidenceOf(squares);

  if (best < CONFIDENT_ENOUGH) {
    // 1) Perspective quad on the current working plane.
    const fit = refineBoardQuad(workingGray, board);
    if (fit.score > fit.rectScore + 2) {
      const quadSquares = recognizeSquaresQuad(workingGray, fit.quad, sets);
      const quadConf = meanConfidenceOf(quadSquares);
      if (quadConf > best + ADOPT_MARGIN) {
        squares = quadSquares;
        best = quadConf;
        path = 'quad';
      }
    }
  }

  if (best < CONFIDENT_ENOUGH && !deskewed) {
    // 2) Deskew: rotate level, re-detect, re-recognize.
    const skew = estimateSkewDegrees(gray);
    if (Math.abs(skew) >= 0.75) {
      const rotated = rotateGray(gray, (skew * Math.PI) / 180);
      const rotatedBoard = detectBoard(rotated);
      if (rotatedBoard) {
        const rotatedSquares = recognizeSquaresGray(rotated, rotatedBoard, sets);
        const rotatedConf = meanConfidenceOf(rotatedSquares);
        if (rotatedConf > best + ADOPT_MARGIN) {
          squares = rotatedSquares;
          best = rotatedConf;
          path = 'deskew';
        }
      }
    }
  }

  if (best < CONFIDENT_ENOUGH) {
    // 3) Local contrast normalization with the plain rectangle.
    const normalized = localContrastNormalize(gray);
    const normalizedSquares = recognizeSquaresGray(normalized, board, sets);
    const normalizedConf = meanConfidenceOf(normalizedSquares);
    if (normalizedConf > best + ADOPT_MARGIN) {
      squares = normalizedSquares;
      best = normalizedConf;
      path = 'normalize';
    }
  }

  const recognizeMs = performance.now() - t1;
  return {
    status: 'ok',
    result: { board, squares, meanConfidence: best },
    detectMs,
    recognizeMs,
    path,
  };
}
