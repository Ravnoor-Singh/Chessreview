/**
 * Shared types for the screenshot-to-FEN vision pipeline (Prompt 8).
 *
 * Everything in `src/vision/` is pure pixel math: functions take plain
 * `{ data, width, height }` buffers so the exact same code runs in the Web
 * Worker (browser), in Vitest (Node, fixtures decoded with sharp) and in
 * ad-hoc scripts. No DOM, no network, no file access in this folder —
 * "Images never leave your device" is a structural property, not a promise.
 */

/** RGBA pixel buffer, 4 bytes per pixel, row-major. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Single-channel grayscale pixel buffer, 1 byte per pixel, row-major. */
export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The 12 piece classes, lichess/cburnett naming (`wP` … `bK`). */
export type PieceKey =
  'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK' | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK';

export const PIECE_KEYS: readonly PieceKey[] = [
  'wP',
  'wN',
  'wB',
  'wR',
  'wQ',
  'wK',
  'bP',
  'bN',
  'bB',
  'bR',
  'bQ',
  'bK',
];

/**
 * One piece glyph as two float planes (grayscale intensity + alpha), any
 * resolution; template building resamples them to the canonical size.
 * Produced from the app's own piece-set SVGs — in the browser by drawing
 * the SVG to a canvas, in tests by rasterizing with sharp.
 */
export interface PieceRaster {
  gray: Float32Array;
  alpha: Float32Array;
  width: number;
  height: number;
}

/** The pieces of one piece set, keyed by {@link PieceKey}. */
export type PieceRasterMap = Partial<Record<PieceKey, PieceRaster>>;

/** An axis-aligned board location: top-left corner + full 8×8 size, in pixels. */
export interface BoardRect {
  x: number;
  y: number;
  size: number;
}

export interface DetectedBoard extends BoardRect {
  /** 0..1 — strength of the checkerboard evidence, not a probability. */
  confidence: number;
}

/** Classification of one square. `piece: null` means "empty". */
export interface SquareResult {
  piece: PieceKey | null;
  /** 0..1 — template-match quality mapped to a confidence; see recognize.ts. */
  confidence: number;
}

export interface RecognitionResult {
  board: DetectedBoard;
  /**
   * 64 squares, index 0 = a8 … 63 = h1 (rank 8 first, White at the bottom —
   * the default orientation; the UI flips this, never the recognizer).
   */
  squares: SquareResult[];
  /** Mean of the 64 per-square confidences, 0..1. */
  meanConfidence: number;
}
