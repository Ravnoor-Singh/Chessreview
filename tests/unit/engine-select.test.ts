import { describe, expect, it } from 'vitest';
import { choiceForMode, selectEngineBuild } from '@/engine/stockfish.worker';

const MULTI_ENV = {
  crossOriginIsolated: true,
  hasSharedArrayBuffer: true,
  hardwareConcurrency: 8,
  deviceMemory: 8,
};

describe('selectEngineBuild', () => {
  it('picks the multi-threaded build when cross-origin isolated with SAB', () => {
    const choice = selectEngineBuild(MULTI_ENV);
    expect(choice.mode).toBe('multi');
    expect(choice.url).toContain('stockfish-19.js');
    expect(choice.url).not.toContain('single');
    expect(choice.url).toBe('/engine/stockfish-19.js');
    // threads = hardwareConcurrency - 1, clamped to [1, 8]
    expect(choice.threads).toBe(7);
    expect(choice.hashMb).toBe(128);
  });

  it('falls back to the single-threaded build without SharedArrayBuffer', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, hasSharedArrayBuffer: false });
    expect(choice.mode).toBe('single');
    expect(choice.url).toBe('/engine/stockfish-19-single.js');
    expect(choice.threads).toBe(1);
  });

  it('falls back to single when not cross-origin isolated, even with SAB', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, crossOriginIsolated: false });
    expect(choice.mode).toBe('single');
    expect(choice.threads).toBe(1);
  });

  it('picks the lite build on low-memory devices (deviceMemory 2)', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, deviceMemory: 2 });
    expect(choice.mode).toBe('lite');
    expect(choice.url).toBe('/engine/stockfish-19-lite-single.js');
    expect(choice.threads).toBe(1);
    expect(choice.hashMb).toBe(32);
  });

  it('lite wins even without cross-origin isolation', () => {
    const choice = selectEngineBuild({
      crossOriginIsolated: false,
      hasSharedArrayBuffer: false,
      hardwareConcurrency: 4,
      deviceMemory: 1,
    });
    expect(choice.mode).toBe('lite');
  });

  it('clamps threads: hardwareConcurrency 16 → 8', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, hardwareConcurrency: 16 });
    expect(choice.mode).toBe('multi');
    expect(choice.threads).toBe(8);
  });

  it('clamps threads: hardwareConcurrency 1 → 1', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, hardwareConcurrency: 1 });
    expect(choice.threads).toBe(1);
  });

  it('uses a 32MB hash at deviceMemory 4 but stays on a full build', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, deviceMemory: 4 });
    expect(choice.mode).toBe('multi');
    expect(choice.hashMb).toBe(32);
  });

  it('defaults deviceMemory to a full hash when it is not reported', () => {
    const choice = selectEngineBuild({
      crossOriginIsolated: true,
      hasSharedArrayBuffer: true,
      hardwareConcurrency: 4,
    });
    expect(choice.mode).toBe('multi');
    expect(choice.hashMb).toBe(128);
    expect(choice.threads).toBe(3);
  });

  // --- Prompt 2: memory threshold, mobile hint, preferences, base URL -------

  it('does not pick multi below 4 GB of reported memory (deviceMemory 3)', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, deviceMemory: 3 });
    expect(choice.mode).toBe('single');
    expect(choice.threads).toBe(1);
  });

  it('does not pick multi on mobile even when isolated with SAB and 8 GB', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, isMobile: true });
    expect(choice.mode).toBe('single');
  });

  it('derives the mobile hint from the user agent when isMobile is omitted', () => {
    const phone = selectEngineBuild({
      ...MULTI_ENV,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    expect(phone.mode).toBe('single');
    const desktop = selectEngineBuild({
      ...MULTI_ENV,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    });
    expect(desktop.mode).toBe('multi');
  });

  it('honors a lite preference on a multi-capable desktop', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, preference: 'lite' });
    expect(choice.mode).toBe('lite');
    expect(choice.url).toBe('/engine/stockfish-19-lite-single.js');
    expect(choice.note).toBeUndefined();
  });

  it('honors a single preference on a multi-capable desktop', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, preference: 'single' });
    expect(choice.mode).toBe('single');
    expect(choice.note).toBeUndefined();
  });

  it('honors a multi preference when its requirements are met', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, preference: 'multi' });
    expect(choice.mode).toBe('multi');
    expect(choice.note).toBeUndefined();
  });

  it('cannot force multi without cross-origin isolation — falls back with a note', () => {
    const choice = selectEngineBuild({
      ...MULTI_ENV,
      crossOriginIsolated: false,
      preference: 'multi',
    });
    expect(choice.mode).toBe('single');
    expect(choice.note).toBeTruthy();
  });

  it('cannot force multi on mobile — falls back with a note', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, isMobile: true, preference: 'multi' });
    expect(choice.mode).toBe('single');
    expect(choice.note).toBeTruthy();
  });

  it('low memory beats a multi preference and explains itself', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, deviceMemory: 2, preference: 'multi' });
    expect(choice.mode).toBe('lite');
    expect(choice.note).toBeTruthy();
  });

  it('low memory beats a single preference (safety rule)', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, deviceMemory: 1, preference: 'single' });
    expect(choice.mode).toBe('lite');
    expect(choice.note).toBeTruthy();
  });

  it('resolves URLs against a custom (CDN) base URL', () => {
    const choice = selectEngineBuild({ ...MULTI_ENV, baseUrl: 'https://cdn.example.com/engine/' });
    expect(choice.url).toBe('https://cdn.example.com/engine/stockfish-19.js');
    expect(choice.jsFile).toBe('stockfish-19.js');
    expect(choice.wasmUrl).toBe('https://cdn.example.com/engine/stockfish-19.wasm');
    expect(choice.wasmFile).toBe('stockfish-19.wasm');
  });

  it('choiceForMode builds consistent fallback choices', () => {
    const single = choiceForMode('single', { hardwareConcurrency: 8, deviceMemory: 8 });
    expect(single.url).toBe('/engine/stockfish-19-single.js');
    expect(single.threads).toBe(1);
    expect(single.hashMb).toBe(128);
    const lite = choiceForMode('lite', { hardwareConcurrency: 8, deviceMemory: 8 });
    expect(lite.url).toBe('/engine/stockfish-19-lite-single.js');
    expect(lite.hashMb).toBe(32);
  });
});
