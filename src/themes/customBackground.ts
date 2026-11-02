/**
 * Custom page backgrounds (Themes & Presets, Stage B).
 *
 * Users can build their own background three ways: a solid color, a
 * two-color gradient, or an uploaded image. The color/gradient choices
 * and the readability-scrim amount live in the settings object; the
 * image blob itself is too large for localStorage, so it is stored in
 * a dedicated IndexedDB database on the device (`chess-review-themes`,
 * separate from the review database). The image is NEVER uploaded —
 * processing is entirely local (validation + optional downscale).
 */

export interface CustomBackgroundSettings {
  /** Solid color for the 'custom-color' background (#rrggbb). */
  color: string;
  /** Gradient endpoints for 'custom-gradient' (#rrggbb). */
  gradientFrom: string;
  gradientTo: string;
  /** Gradient angle in degrees, 0–360. */
  gradientAngle: number;
  /**
   * Readability overlay strength, 0–0.8. BackgroundLayer paints this
   * much black (dark UI) or white (light UI) over the custom
   * background so text stays readable whatever the user picks.
   */
  scrim: number;
}

export const DEFAULT_CUSTOM_BACKGROUND: CustomBackgroundSettings = {
  color: '#3a3f4a',
  gradientFrom: '#3a3f4a',
  gradientTo: '#17181c',
  gradientAngle: 135,
  scrim: 0.35,
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function hexOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX6.test(value) ? value : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/** Validate/normalize an unknown persisted custom-background value. */
export function sanitizeCustomBackground(value: unknown): CustomBackgroundSettings {
  const raw = (value ?? {}) as Partial<CustomBackgroundSettings>;
  return {
    color: hexOr(raw.color, DEFAULT_CUSTOM_BACKGROUND.color),
    gradientFrom: hexOr(raw.gradientFrom, DEFAULT_CUSTOM_BACKGROUND.gradientFrom),
    gradientTo: hexOr(raw.gradientTo, DEFAULT_CUSTOM_BACKGROUND.gradientTo),
    gradientAngle: clamp(raw.gradientAngle, 0, 360, DEFAULT_CUSTOM_BACKGROUND.gradientAngle),
    scrim: clamp(raw.scrim, 0, 0.8, DEFAULT_CUSTOM_BACKGROUND.scrim),
  };
}

/** The CSS background-image value for the 'custom-gradient' background. */
export function customGradientCss(cb: CustomBackgroundSettings): string {
  return `linear-gradient(${cb.gradientAngle}deg, ${cb.gradientFrom}, ${cb.gradientTo})`;
}

/* ------------------------------------------------------------------ */
/*  Uploaded image: validation, downscale, local storage               */
/* ------------------------------------------------------------------ */

export const CUSTOM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CUSTOM_IMAGE_MAX_DIMENSION = 2560;
export const CUSTOM_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export type CustomImageRejection = 'type' | 'size';

/** Why an upload is unacceptable, or null when it is fine. */
export function validateCustomImageFile(file: {
  type: string;
  size: number;
}): CustomImageRejection | null {
  if (!CUSTOM_IMAGE_TYPES.includes(file.type)) return 'type';
  if (file.size > CUSTOM_IMAGE_MAX_BYTES) return 'size';
  return null;
}

/**
 * Downscale an image blob so its longest side is at most
 * CUSTOM_IMAGE_MAX_DIMENSION, re-encoding as the same type where the
 * platform supports it. Returns the original blob when it already
 * fits or when decoding is unavailable (the storage cap still keeps
 * the device copy bounded by the 5 MB input limit). Browser-only.
 */
export async function downscaleCustomImage(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return blob;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  try {
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest <= CUSTOM_IMAGE_MAX_DIMENSION) return blob;
    const scale = CUSTOM_IMAGE_MAX_DIMENSION / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = CUSTOM_IMAGE_TYPES.includes(blob.type) ? blob.type : 'image/png';
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b ?? blob), type, 0.92);
    });
  } finally {
    bitmap.close();
  }
}

/* IndexedDB storage — its own database so the review store and its
 * schema are untouched. Raw IDB API (no dependency). */

const IDB_NAME = 'chess-review-themes';
const IDB_STORE = 'kv';
const IMAGE_KEY = 'custom-background-image';

function openThemesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbRequest<T>(run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openThemesDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = run(tx.objectStore(IDB_STORE));
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => {
          db.close();
          reject(req.error ?? new Error('IndexedDB request failed'));
        };
      }),
  );
}

export async function saveCustomBackgroundImage(blob: Blob): Promise<void> {
  await idbRequest<IDBValidKey>((store) => store.put(blob, IMAGE_KEY));
}

export async function loadCustomBackgroundImage(): Promise<Blob | null> {
  const value = await idbRequest<unknown>((store) => store.get(IMAGE_KEY));
  return value instanceof Blob ? value : null;
}

export async function clearCustomBackgroundImage(): Promise<void> {
  await idbRequest<undefined>((store) => store.delete(IMAGE_KEY));
}
