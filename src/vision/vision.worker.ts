/**
 * Web Worker wrapper for the vision pipeline (same construction pattern
 * as the engine worker: a typed request/response protocol over
 * postMessage). All processing happens here, on the user's device — the
 * image pixels arrive from the main thread and never touch the network.
 *
 * Protocol:
 *   in : { type: 'recognize', id, image, sets }
 *   out: { type: 'progress', id, stage }
 *        { type: 'result', id, outcome }   (PipelineOutcome)
 *        { type: 'error', id, message }
 */

import { recognizeImage, type PipelineOutcome } from './pipeline';
import type { PieceRasterMap, RgbaImage } from './types';

export interface VisionWorkerRequest {
  type: 'recognize';
  id: number;
  image: RgbaImage;
  sets: PieceRasterMap[];
}

export type VisionWorkerResponse =
  | { type: 'progress'; id: number; stage: 'detecting' | 'recognizing' }
  | { type: 'result'; id: number; outcome: PipelineOutcome }
  | { type: 'error'; id: number; message: string };

interface VisionWorkerScope {
  onmessage: ((event: MessageEvent<VisionWorkerRequest>) => void) | null;
  postMessage: (message: VisionWorkerResponse) => void;
}

const scope = self as unknown as VisionWorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== 'recognize') return;
  try {
    const outcome = recognizeImage(request.image, request.sets, (stage) => {
      scope.postMessage({ type: 'progress', id: request.id, stage });
    });
    scope.postMessage({ type: 'result', id: request.id, outcome });
  } catch (err) {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: err instanceof Error ? err.message : 'Recognition failed unexpectedly.',
    });
  }
};
