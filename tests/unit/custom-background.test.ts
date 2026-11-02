// Custom backgrounds (Themes & Presets, Stage B): sanitize/gradient/
// validation helpers plus the dedicated-IndexedDB image store, exercised
// against fake-indexeddb (installed before the module under test loads,
// mirroring tests/unit/engine-cache-idb.test.ts).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOM_IMAGE_MAX_BYTES,
  clearCustomBackgroundImage,
  customGradientCss,
  DEFAULT_CUSTOM_BACKGROUND,
  loadCustomBackgroundImage,
  sanitizeCustomBackground,
  saveCustomBackgroundImage,
  validateCustomImageFile,
} from '@/themes/customBackground';

describe('sanitizeCustomBackground', () => {
  it('returns the defaults for undefined / garbage input', () => {
    expect(sanitizeCustomBackground(undefined)).toEqual(DEFAULT_CUSTOM_BACKGROUND);
    expect(sanitizeCustomBackground(null)).toEqual(DEFAULT_CUSTOM_BACKGROUND);
    expect(sanitizeCustomBackground('junk')).toEqual(DEFAULT_CUSTOM_BACKGROUND);
    expect(sanitizeCustomBackground(42)).toEqual(DEFAULT_CUSTOM_BACKGROUND);
    expect(sanitizeCustomBackground(true)).toEqual(DEFAULT_CUSTOM_BACKGROUND);
    expect(sanitizeCustomBackground([])).toEqual(DEFAULT_CUSTOM_BACKGROUND);
  });

  it('keeps valid #rrggbb hex values (case preserved)', () => {
    const out = sanitizeCustomBackground({
      color: '#112233',
      gradientFrom: '#AABBCC',
      gradientTo: '#00ff99',
    });
    expect(out.color).toBe('#112233');
    expect(out.gradientFrom).toBe('#AABBCC');
    expect(out.gradientTo).toBe('#00ff99');
  });

  it.each(['red', '#12345', '#gggggg', 42])(
    'falls back per-field for an invalid hex value: %s',
    (bad) => {
      for (const field of ['color', 'gradientFrom', 'gradientTo'] as const) {
        const out = sanitizeCustomBackground({ [field]: bad });
        expect(out[field]).toBe(DEFAULT_CUSTOM_BACKGROUND[field]);
      }
      // An invalid value in one field does not poison the others.
      const mixed = sanitizeCustomBackground({
        color: bad,
        gradientFrom: '#112233',
        gradientTo: '#445566',
      });
      expect(mixed.color).toBe(DEFAULT_CUSTOM_BACKGROUND.color);
      expect(mixed.gradientFrom).toBe('#112233');
      expect(mixed.gradientTo).toBe('#445566');
    },
  );

  it('clamps gradientAngle to 0..360 and falls back on NaN', () => {
    expect(sanitizeCustomBackground({ gradientAngle: -10 }).gradientAngle).toBe(0);
    expect(sanitizeCustomBackground({ gradientAngle: 400 }).gradientAngle).toBe(360);
    expect(sanitizeCustomBackground({ gradientAngle: 0 }).gradientAngle).toBe(0);
    expect(sanitizeCustomBackground({ gradientAngle: 360 }).gradientAngle).toBe(360);
    expect(sanitizeCustomBackground({ gradientAngle: 200 }).gradientAngle).toBe(200);
    expect(sanitizeCustomBackground({ gradientAngle: NaN }).gradientAngle).toBe(
      DEFAULT_CUSTOM_BACKGROUND.gradientAngle,
    );
    expect(sanitizeCustomBackground({ gradientAngle: Infinity }).gradientAngle).toBe(
      DEFAULT_CUSTOM_BACKGROUND.gradientAngle,
    );
  });

  it('clamps scrim to 0..0.8 and falls back on NaN', () => {
    expect(sanitizeCustomBackground({ scrim: -1 }).scrim).toBe(0);
    expect(sanitizeCustomBackground({ scrim: 2 }).scrim).toBe(0.8);
    expect(sanitizeCustomBackground({ scrim: 0 }).scrim).toBe(0);
    expect(sanitizeCustomBackground({ scrim: 0.8 }).scrim).toBe(0.8);
    expect(sanitizeCustomBackground({ scrim: 0.5 }).scrim).toBe(0.5);
    expect(sanitizeCustomBackground({ scrim: NaN }).scrim).toBe(DEFAULT_CUSTOM_BACKGROUND.scrim);
  });

  it('fills the rest from defaults for a partial object', () => {
    expect(sanitizeCustomBackground({ color: '#112233' })).toEqual({
      ...DEFAULT_CUSTOM_BACKGROUND,
      color: '#112233',
    });
    expect(sanitizeCustomBackground({ scrim: 0.1, gradientAngle: 45 })).toEqual({
      ...DEFAULT_CUSTOM_BACKGROUND,
      scrim: 0.1,
      gradientAngle: 45,
    });
  });

  it('does not share identity with DEFAULT_CUSTOM_BACKGROUND', () => {
    const out = sanitizeCustomBackground(undefined);
    expect(out).not.toBe(DEFAULT_CUSTOM_BACKGROUND);
    out.color = '#000000';
    expect(DEFAULT_CUSTOM_BACKGROUND.color).not.toBe('#000000');
  });
});

describe('customGradientCss', () => {
  it('renders the exact linear-gradient string', () => {
    expect(
      customGradientCss({
        color: '#000000',
        gradientFrom: '#112233',
        gradientTo: '#aabbcc',
        gradientAngle: 90,
        scrim: 0.2,
      }),
    ).toBe('linear-gradient(90deg, #112233, #aabbcc)');
    expect(customGradientCss(DEFAULT_CUSTOM_BACKGROUND)).toBe(
      'linear-gradient(135deg, #3a3f4a, #17181c)',
    );
  });
});

describe('validateCustomImageFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'accepts %s at exactly the 5 MiB cap',
    (type) => {
      expect(validateCustomImageFile({ type, size: CUSTOM_IMAGE_MAX_BYTES })).toBeNull();
      expect(validateCustomImageFile({ type, size: 0 })).toBeNull();
    },
  );

  it('rejects one byte over the cap as size', () => {
    expect(validateCustomImageFile({ type: 'image/png', size: CUSTOM_IMAGE_MAX_BYTES + 1 })).toBe(
      'size',
    );
  });

  it.each(['image/gif', 'text/plain', ''])('rejects an unsupported type as type: %s', (type) => {
    expect(validateCustomImageFile({ type, size: 10 })).toBe('type');
  });

  it('checks type before size (gif + oversize → type)', () => {
    expect(validateCustomImageFile({ type: 'image/gif', size: CUSTOM_IMAGE_MAX_BYTES + 1 })).toBe(
      'type',
    );
  });
});

describe('custom background image storage (fake IndexedDB)', () => {
  beforeEach(async () => {
    await clearCustomBackgroundImage();
  });

  it('loads null when nothing is stored', async () => {
    expect(await loadCustomBackgroundImage()).toBeNull();
  });

  it('round-trips a blob with the same size, type and bytes', async () => {
    const blob = new Blob(['first-image-bytes-0123456789'], { type: 'image/png' });
    await saveCustomBackgroundImage(blob);
    const loaded = await loadCustomBackgroundImage();
    expect(loaded).toBeInstanceOf(Blob);
    expect(loaded?.size).toBe(blob.size);
    expect(loaded?.type).toBe('image/png');
    expect(await loaded?.text()).toBe('first-image-bytes-0123456789');
  });

  it('a second save overwrites the first', async () => {
    await saveCustomBackgroundImage(new Blob(['first-image-bytes'], { type: 'image/png' }));
    await saveCustomBackgroundImage(new Blob(['second-image-bytes!'], { type: 'image/webp' }));
    const loaded = await loadCustomBackgroundImage();
    expect(loaded?.type).toBe('image/webp');
    expect(await loaded?.text()).toBe('second-image-bytes!');
  });

  it('clear removes the stored image', async () => {
    await saveCustomBackgroundImage(new Blob(['to-be-cleared'], { type: 'image/jpeg' }));
    expect(await loadCustomBackgroundImage()).not.toBeNull();
    await clearCustomBackgroundImage();
    expect(await loadCustomBackgroundImage()).toBeNull();
  });

  it("stores the image in the dedicated 'chess-review-themes' database, store 'kv'", async () => {
    await saveCustomBackgroundImage(new Blob(['db-check'], { type: 'image/png' }));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('chess-review-themes');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('open failed'));
    });
    try {
      expect(Array.from(db.objectStoreNames)).toContain('kv');
    } finally {
      db.close();
    }
  });
});

describe('no-network guarantee', () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalXhr === undefined) {
      delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    } else {
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
    }
    vi.restoreAllMocks();
  });

  it('validate + save + load + clear make zero fetch/XHR calls', async () => {
    let fetchCalls = 0;
    let xhrCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error('network is forbidden in this test');
    }) as typeof fetch;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = class CountingXHR {
      constructor() {
        xhrCalls += 1;
      }
      open() {
        xhrCalls += 1;
      }
      send() {
        xhrCalls += 1;
      }
    };

    expect(validateCustomImageFile({ type: 'image/png', size: 123 })).toBeNull();
    await saveCustomBackgroundImage(new Blob(['offline-bytes'], { type: 'image/png' }));
    const loaded = await loadCustomBackgroundImage();
    expect(await loaded?.text()).toBe('offline-bytes');
    await clearCustomBackgroundImage();
    expect(await loadCustomBackgroundImage()).toBeNull();

    expect(fetchCalls).toBe(0);
    expect(xhrCalls).toBe(0);
  });
});
