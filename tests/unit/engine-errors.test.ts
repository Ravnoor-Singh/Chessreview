import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineLoadError, formatEngineError, formatEngineLoadMessage } from '@/engine/engineErrors';
import { EngineIntegrityError } from '@/engine/engineManifest';
import { prepareEngineBuild } from '@/engine/engineLoader';

// Engine-failure localization (Prompt 10 review fix): failures are
// thrown as structured errors and composed in the ACTIVE locale at
// render time (formatEngineError). These tests pin: placeholders
// filled in >= 2 non-English locales, raw diagnostic detail preserved,
// and the English output unchanged in content from the pre-fix
// hardcoded strings.

const FAILURES = [
  { mode: 'multi' as const, file: 'stockfish-19.js', detail: 'HTTP 404' },
  { mode: 'single' as const, file: 'stockfish-19-single.js', detail: 'timeout' },
  { mode: 'lite' as const, file: 'stockfish-19-lite-single.js', detail: 'boom' },
];
const BUILDS = ['multi', 'single', 'lite'] as const;

describe('EngineLoadError / formatEngineError', () => {
  it('English output matches the pre-fix message content', () => {
    const err = new EngineLoadError(BUILDS, FAILURES);
    const expected =
      'Could not load the Stockfish engine — tried Full (multi-threaded) → Single-threaded → Lite. ' +
      'Full (multi-threaded) (stockfish-19.js): HTTP 404 ' +
      'Single-threaded (stockfish-19-single.js): timeout ' +
      'Lite (stockfish-19-lite-single.js): boom ' +
      'Check your connection and reload; if the engine is hosted on a CDN, verify its CORS headers (see README).';
    expect(err.message).toBe(expected);
    expect(formatEngineError('en', err)).toBe(expected);
    expect(formatEngineLoadMessage('en', BUILDS, FAILURES)).toBe(expected);
  });

  it('renders in Hindi with localized builds and raw detail preserved', () => {
    const msg = formatEngineError('hi', new EngineLoadError(BUILDS, FAILURES));
    expect(msg).toContain('Stockfish इंजन लोड नहीं हो सका');
    // Build labels come from the Hindi catalogue.
    expect(msg).toContain('पूर्ण (मल्टी-थ्रेड) → सिंगल-थ्रेड → लाइट');
    expect(msg).toContain('पूर्ण (मल्टी-थ्रेड) (stockfish-19.js): HTTP 404');
    // Raw diagnostics stay available verbatim.
    expect(msg).toContain('stockfish-19-lite-single.js');
    expect(msg).toContain('boom');
    expect(msg).toContain('CORS');
    expect(msg).not.toContain('Could not load the Stockfish engine');
  });

  it('renders in Punjabi with localized builds and raw detail preserved', () => {
    const msg = formatEngineError('pa', new EngineLoadError(BUILDS, FAILURES));
    expect(msg).toContain('Stockfish ਇੰਜਣ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ');
    expect(msg).toContain('ਪੂਰਾ (ਮਲਟੀ-ਥ੍ਰੈਡ) → ਸਿੰਗਲ-ਥ੍ਰੈਡ → ਲਾਈਟ');
    expect(msg).toContain('timeout');
    expect(msg).not.toContain('Could not load the Stockfish engine');
  });

  it('renders in Spanish', () => {
    const msg = formatEngineError('es', new EngineLoadError(BUILDS, FAILURES));
    expect(msg).toContain('No se pudo cargar el motor Stockfish');
    expect(msg).toContain('Completa (multihilo) → De un solo hilo → Lite');
    expect(msg).toContain('HTTP 404');
  });
});

describe('EngineIntegrityError / formatEngineError', () => {
  const detail = {
    file: 'stockfish-19-single.wasm',
    expected: 'a'.repeat(64),
    actual: 'b'.repeat(64),
  };
  const enMessage =
    `Engine integrity check failed for ${detail.file}: expected SHA-256 ${detail.expected}, got ${detail.actual}. ` +
    'The download looks corrupted — check your connection and reload the page.';

  it('English output is the pre-fix integrity message, verbatim', () => {
    const err = new EngineIntegrityError(enMessage, detail);
    expect(formatEngineError('en', err)).toBe(enMessage);
  });

  it('renders in Hindi and Punjabi with hashes filled in', () => {
    const err = new EngineIntegrityError(enMessage, detail);
    const hi = formatEngineError('hi', err);
    expect(hi).toContain('इंटीग्रिटी जाँच विफल');
    expect(hi).toContain(detail.file);
    expect(hi).toContain(detail.expected);
    expect(hi).toContain(detail.actual);
    expect(hi).not.toContain('Engine integrity check failed');
    const pa = formatEngineError('pa', err);
    expect(pa).toContain('ਇੰਟੀਗ੍ਰਿਟੀ ਜਾਂਚ ਅਸਫਲ');
    expect(pa).toContain(detail.expected);
  });

  it('prepareEngineBuild throws the structured integrity error', async () => {
    const wasmText = 'fake-wasm-bytes-for-single';
    const manifest = {
      version: '19.0.1',
      generatedAt: '2026-10-31T00:00:00.000Z',
      files: [
        // Complete pair, as the generated manifest always lists (Prompt 7).
        { name: 'stockfish-19-single.js', size: 28130, sha256: 'a'.repeat(64) },
        {
          name: 'stockfish-19-single.wasm',
          size: wasmText.length,
          sha256: '0'.repeat(64),
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
        return new Response(wasmText, {
          status: 200,
          headers: { 'Content-Length': String(wasmText.length) },
        });
      }),
    );
    let caught: unknown;
    try {
      await prepareEngineBuild('/engine', 'single');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EngineIntegrityError);
    const err = caught as EngineIntegrityError;
    expect(err.code).toBe('engine-integrity-failed');
    expect(err.file).toBe('stockfish-19-single.wasm');
    expect(err.expected).toBe('0'.repeat(64));
    expect(err.actual).toBe(createHash('sha256').update(wasmText).digest('hex'));
    // …and the thrown error localizes at the render point.
    expect(formatEngineError('hi', err)).toContain('इंटीग्रिटी जाँच विफल');
    expect(formatEngineError('en', err)).toContain('Engine integrity check failed');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe('formatEngineError fallbacks', () => {
  it('non-Error thrown values use the localized generic sentence', () => {
    // The former hardcoded useEngine fallback was 'Engine failed to load'.
    expect(formatEngineError('en', 'nope')).toBe('Engine failed to load');
    expect(formatEngineError('en', undefined)).toBe('Engine failed to load');
    expect(formatEngineError('hi', null)).toBe('इंजन लोड नहीं हो सका');
    expect(formatEngineError('pa', 42)).toBe('ਇੰਜਣ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ');
    expect(formatEngineError('es', null)).toBe('El motor no se pudo cargar');
  });

  it('unknown Errors keep their raw message as diagnostic detail', () => {
    expect(formatEngineError('hi', new Error('raw diagnostic'))).toBe('raw diagnostic');
    expect(formatEngineError('en', new Error('raw diagnostic'))).toBe('raw diagnostic');
  });
});
