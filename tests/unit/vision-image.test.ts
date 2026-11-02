import { describe, expect, it } from 'vitest';
import { blurPatch, cropResizeGrayF, median, resizePlaneF, rgbaToGray } from '@/vision/image';
import type { RgbaImage } from '@/vision/types';

describe('vision/image helpers', () => {
  it('rgbaToGray applies luma weights and ignores alpha', () => {
    const image: RgbaImage = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        255,
        0,
        0,
        255, // red   -> 0.299*255 ≈ 76
        0,
        255,
        0,
        0, //   green -> 0.587*255 ≈ 150 (alpha ignored)
        0,
        0,
        255,
        128, // blue  -> 0.114*255 ≈ 29
      ]),
    };
    const gray = rgbaToGray(image);
    expect(gray.width).toBe(3);
    expect(Array.from(gray.data)).toEqual([76, 150, 29]);
  });

  it('resizePlaneF is the identity at equal size and averages when shrinking', () => {
    const src = new Float32Array([0, 10, 20, 30]);
    expect(Array.from(resizePlaneF(src, 2, 2, 2, 2))).toEqual([0, 10, 20, 30]);
    const shrunk = resizePlaneF(new Float32Array([0, 100, 100, 0]), 2, 2, 1, 1);
    expect(shrunk[0]).toBeCloseTo(50, 0);
  });

  it('cropResizeGrayF samples the requested sub-rectangle', () => {
    const data = new Uint8ClampedArray(16 * 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) data[y * 16 + x] = x * 16;
    const patch = cropResizeGrayF({ data, width: 16, height: 16 }, 8, 0, 8, 16, 4, 4);
    // Right half only: every value >= 128.
    for (const v of patch) expect(v).toBeGreaterThanOrEqual(120);
  });

  it('blurPatch softens a spike and preserves a flat field', () => {
    const flat = new Float32Array(25).fill(100);
    expect(Array.from(blurPatch(flat, 5))).toEqual(new Array(25).fill(100));
    const spike = new Float32Array(25).fill(0);
    spike[12] = 160;
    const blurred = blurPatch(spike, 5);
    expect(blurred[12]).toBeLessThan(160);
    expect(blurred[12]).toBeGreaterThan(0);
    // Total energy is (approximately) preserved away from the edges.
    const sum = blurred.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(140);
    expect(sum).toBeLessThanOrEqual(160);
  });

  it('median handles odd and even lengths', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
