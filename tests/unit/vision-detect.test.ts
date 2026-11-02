import { describe, expect, it } from 'vitest';
import { detectBoard } from '@/vision/detectBoard';
import { recognizeImage } from '@/vision/pipeline';
import type { GrayImage, RgbaImage } from '@/vision/types';

/** Paint a bare checkerboard (no pieces) into a gray canvas. */
function syntheticBoard(opts: {
  canvasW: number;
  canvasH: number;
  x: number;
  y: number;
  size: number;
  light?: number;
  dark?: number;
  background?: number;
  gutter?: number;
}): GrayImage {
  const { canvasW, canvasH, x, y, size } = opts;
  const light = opts.light ?? 235;
  const dark = opts.dark ?? 130;
  const data = new Uint8ClampedArray(canvasW * canvasH).fill(opts.background ?? 45);
  const cell = size / 8;
  const gx = opts.gutter ? x - opts.gutter : x;
  const gy = opts.gutter ? y - opts.gutter : y;
  if (opts.gutter) {
    for (let yy = gy; yy < y + size + opts.gutter; yy++) {
      for (let xx = gx; xx < x + size + opts.gutter; xx++) data[yy * canvasW + xx] = 90;
    }
  }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const v = (row + col) % 2 === 0 ? light : dark;
      for (let yy = Math.floor(y + row * cell); yy < Math.floor(y + (row + 1) * cell); yy++) {
        for (let xx = Math.floor(x + col * cell); xx < Math.floor(x + (col + 1) * cell); xx++) {
          data[yy * canvasW + xx] = v;
        }
      }
    }
  }
  return { data, width: canvasW, height: canvasH };
}

function expectRectClose(
  found: ReturnType<typeof detectBoard>,
  want: { x: number; y: number; size: number },
  tol: number,
) {
  expect(found).not.toBeNull();
  if (!found) return;
  expect(Math.abs(found.x - want.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(found.y - want.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(found.size - want.size)).toBeLessThanOrEqual(tol);
}

describe('vision/detectBoard (synthetic)', () => {
  it('finds a board that fills most of the frame', () => {
    const img = syntheticBoard({ canvasW: 560, canvasH: 560, x: 24, y: 24, size: 512 });
    expectRectClose(detectBoard(img), { x: 24, y: 24, size: 512 }, 4);
  });

  it('finds a board surrounded by wide UI margins', () => {
    const img = syntheticBoard({ canvasW: 1080, canvasH: 1200, x: 140, y: 300, size: 800 });
    expectRectClose(detectBoard(img), { x: 140, y: 300, size: 800 }, 6);
  });

  it('finds a board inside a coordinate gutter without absorbing the gutter', () => {
    const img = syntheticBoard({
      canvasW: 700,
      canvasH: 700,
      x: 110,
      y: 90,
      size: 512,
      gutter: 36,
    });
    expectRectClose(detectBoard(img), { x: 110, y: 90, size: 512 }, 5);
  });

  it('handles a low-contrast color pair', () => {
    const img = syntheticBoard({
      canvasW: 560,
      canvasH: 560,
      x: 24,
      y: 24,
      size: 512,
      light: 200,
      dark: 150,
    });
    expectRectClose(detectBoard(img), { x: 24, y: 24, size: 512 }, 4);
  });

  it('handles non-integer square sizes', () => {
    const img = syntheticBoard({ canvasW: 900, canvasH: 900, x: 37, y: 53, size: 801 });
    expectRectClose(detectBoard(img), { x: 37, y: 53, size: 801 }, 6);
  });

  it('returns null for a blank image (honest failure)', () => {
    const img: GrayImage = {
      data: new Uint8ClampedArray(800 * 600).fill(120),
      width: 800,
      height: 600,
    };
    expect(detectBoard(img)).toBeNull();
  });

  it('returns null for a smooth gradient (no board)', () => {
    const data = new Uint8ClampedArray(800 * 600);
    for (let y = 0; y < 600; y++)
      for (let x = 0; x < 800; x++) data[y * 800 + x] = Math.floor((x / 800) * 255);
    expect(detectBoard({ data, width: 800, height: 600 })).toBeNull();
  });

  it('returns null for a tiny image', () => {
    const img: GrayImage = { data: new Uint8ClampedArray(32 * 32), width: 32, height: 32 };
    expect(detectBoard(img)).toBeNull();
  });
});

describe('vision/pipeline honest failure', () => {
  it('reports not-found (never a fake position) for a blank screenshot', () => {
    const image: RgbaImage = {
      data: new Uint8ClampedArray(800 * 600 * 4).fill(200),
      width: 800,
      height: 600,
    };
    const out = recognizeImage(image, []);
    expect(out.status).toBe('not-found');
  });
});
