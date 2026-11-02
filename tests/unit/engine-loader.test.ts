import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineIntegrityError } from '@/engine/engineManifest';
import {
  EngineBuildNotShippedError,
  fetchWasmBytes,
  prepareEngineBuild,
} from '@/engine/engineLoader';

// The loader's network layer is exercised with a stubbed global fetch (Node
// has real Response/ReadableStream, so the streaming path runs for real).
// The Cache API is absent in Node, which also covers the loader's graceful
// no-cache fallback.

function streamResponse(chunks: string[], total: number, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Length': String(total), 'Content-Type': 'application/wasm' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWasmBytes', () => {
  it('streams the body, reports progress and returns the assembled bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(['ab', 'cd', 'ef'], 6)),
    );
    const progress: Array<number | null> = [];
    const { bytes, fromCache } = await fetchWasmBytes('/engine/x.wasm', {
      onProgress: (p) => progress.push(p),
    });
    expect(fromCache).toBe(false);
    expect(new TextDecoder().decode(bytes)).toBe('abcdef');
    expect(progress[progress.length - 1]).toBe(100);
    expect(progress).toContain(33); // after 'ab' (2/6)
    expect(progress).toContain(67); // after 'cd' (4/6, rounded)
    expect(progress).toContain(99); // capped at 99 while streaming; 100 on completion
  });

  it('throws a clear error on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    await expect(fetchWasmBytes('/engine/missing.wasm')).rejects.toThrow(/HTTP 404/);
  });
});

describe('prepareEngineBuild', () => {
  const wasmText = 'fake-wasm-bytes-for-single';
  const wasmSha = createHash('sha256').update(wasmText).digest('hex');

  function stubFetch(manifestSha: string) {
    const manifest = {
      version: '19.0.1',
      generatedAt: '2026-10-31T00:00:00.000Z',
      files: [
        // The generated manifest always lists complete .js + .wasm pairs
        // (scripts/copy-engine.mjs profiles copy pairs atomically).
        { name: 'stockfish-19-single.js', size: 28130, sha256: 'a'.repeat(64) },
        {
          name: 'stockfish-19-single.wasm',
          size: wasmText.length,
          sha256: manifestSha,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith('engine-manifest.json')) {
          return new Response(JSON.stringify(manifest), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return streamResponse([wasmText], wasmText.length);
      }),
    );
  }

  it('verifies the WASM against the manifest and returns build info', async () => {
    stubFetch(wasmSha);
    const prepared = await prepareEngineBuild('/engine', 'single');
    expect(prepared.version).toBe('19.0.1');
    expect(prepared.wasmFile).toBe('stockfish-19-single.wasm');
    expect(prepared.wasmSize).toBe(wasmText.length);
  });

  it('throws EngineIntegrityError (no silent start) on a hash mismatch', async () => {
    stubFetch('0'.repeat(64));
    await expect(prepareEngineBuild('/engine', 'single')).rejects.toBeInstanceOf(
      EngineIntegrityError,
    );
    await expect(prepareEngineBuild('/engine', 'single')).rejects.toThrow(/integrity check failed/);
  });

  it('throws EngineBuildNotShippedError BEFORE any file request when the manifest omits the build (Prompt 7)', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith('engine-manifest.json')) {
          // A lite-only deployment's manifest: no multi pair at all.
          return new Response(
            JSON.stringify({
              version: '19.0.1',
              generatedAt: '2026-11-01T00:00:00.000Z',
              files: [
                { name: 'stockfish-19-lite-single.js', size: 28230, sha256: 'b'.repeat(64) },
                { name: 'stockfish-19-lite-single.wasm', size: 1845971, sha256: 'c'.repeat(64) },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return streamResponse([wasmText], wasmText.length);
      }),
    );
    await expect(prepareEngineBuild('/engine', 'multi')).rejects.toBeInstanceOf(
      EngineBuildNotShippedError,
    );
    // The manifest was fetched; the unshipped build's files never were.
    expect(requested.some((u) => u.endsWith('engine-manifest.json'))).toBe(true);
    expect(requested.some((u) => u.includes('stockfish-19.wasm'))).toBe(false);
    expect(requested.some((u) => u.includes('stockfish-19.js'))).toBe(false);
  });

  it('still prepares the build when the manifest is unavailable (verification skipped)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith('engine-manifest.json')) return new Response('no', { status: 404 });
        return streamResponse([wasmText], wasmText.length);
      }),
    );
    const prepared = await prepareEngineBuild('/engine', 'single');
    expect(prepared.version).toBeNull();
    expect(prepared.wasmSize).toBe(wasmText.length);
  });
});
