/**
 * Browser-side glue for screenshot recognition (used by ImageInput):
 * decode the chosen file to pixels, rasterize the app's five piece sets
 * to template planes, and run the pure pipeline in a Web Worker.
 *
 * Privacy: the file is decoded locally via createImageBitmap/canvas, the
 * piece SVGs are same-origin app assets, and the worker is same-origin.
 * No network request carries the user's image anywhere — "Images never
 * leave your device" is literally true.
 */

import { t, detectBrowserLocale } from '@/i18n';
import { PIECE_KEYS, PIECE_SET_IDS, pieceSrc } from '@/lib/pieces';
import type { PipelineOutcome } from './pipeline';
import type { PieceRaster, PieceRasterMap, RgbaImage } from './types';
import type { VisionWorkerRequest, VisionWorkerResponse } from './vision.worker';

/** Cap on the decoded image's long side (recognition needs far less). */
const MAX_DIMENSION = 1600;
/** Resolution at which piece glyphs are rasterized for templates. */
const RASTER_SIZE = 96;

export async function decodeImageFile(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error(t(detectBrowserLocale(), 'vision.canvasUnavailable'));
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { data: new Uint8ClampedArray(imageData.data), width, height };
  } finally {
    bitmap.close();
  }
}

async function rasterizePiece(set: string, key: string): Promise<PieceRaster> {
  const res = await fetch(pieceSrc(set as (typeof PIECE_SET_IDS)[number], key));
  if (!res.ok)
    throw new Error(t(detectBrowserLocale(), 'vision.couldNotLoadArtwork', { set, key }));
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = RASTER_SIZE;
    canvas.height = RASTER_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error(t(detectBrowserLocale(), 'vision.canvasUnavailable'));
    ctx.drawImage(bitmap, 0, 0, RASTER_SIZE, RASTER_SIZE);
    const { data } = ctx.getImageData(0, 0, RASTER_SIZE, RASTER_SIZE);
    const n = RASTER_SIZE * RASTER_SIZE;
    const gray = new Float32Array(n);
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      alpha[i] = data[i * 4 + 3];
    }
    return { gray, alpha, width: RASTER_SIZE, height: RASTER_SIZE };
  } finally {
    bitmap.close();
  }
}

let rastersPromise: Promise<PieceRasterMap[]> | null = null;

/** Rasterize all five app piece sets once (cached for the session). */
export function loadPieceRasters(): Promise<PieceRasterMap[]> {
  if (!rastersPromise) {
    rastersPromise = (async () => {
      const sets: PieceRasterMap[] = [];
      for (const set of PIECE_SET_IDS) {
        const map: PieceRasterMap = {};
        for (const key of PIECE_KEYS) {
          map[key] = await rasterizePiece(set, key);
        }
        sets.push(map);
      }
      return sets;
    })();
    // A failed load (e.g. offline mid-session) must not poison the cache.
    rastersPromise.catch(() => {
      rastersPromise = null;
    });
  }
  return rastersPromise;
}

export interface VisionRunResult {
  outcome: PipelineOutcome;
  /** Wall time of the worker round trip, milliseconds. */
  totalMs: number;
}

let nextRequestId = 1;

/**
 * Run recognition for an image file in the vision worker.
 * `onProgress` receives stage updates ('loading-pieces' is emitted by
 * this module; 'detecting'/'recognizing' come from the worker).
 */
export async function recognizeScreenshot(
  file: File,
  onProgress?: (stage: 'loading-pieces' | 'detecting' | 'recognizing') => void,
): Promise<VisionRunResult> {
  const [image, sets] = await Promise.all([
    decodeImageFile(file),
    (async () => {
      onProgress?.('loading-pieces');
      return loadPieceRasters();
    })(),
  ]);

  const id = nextRequestId++;
  const started = performance.now();
  return new Promise<VisionRunResult>((resolve, reject) => {
    const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<VisionWorkerResponse>) => {
      const msg = event.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.stage);
      } else if (msg.type === 'result') {
        cleanup();
        resolve({ outcome: msg.outcome, totalMs: performance.now() - started });
      } else {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || t(detectBrowserLocale(), 'vision.workerFailed')));
    };
    const request: VisionWorkerRequest = { type: 'recognize', id, image, sets };
    // Transfer the image buffer (it is a fresh decode, safe to give away);
    // the piece rasters are shared session state, so they are cloned.
    worker.postMessage(request, [image.data.buffer]);
  });
}
