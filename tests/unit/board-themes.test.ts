import { describe, expect, it } from 'vitest';
import { BOARD_THEME_IDS, BOARD_THEMES, boardThemeTokens, contrastRatio } from '@/lib/boardThemes';

describe('board themes', () => {
  it('keeps the six legacy themes first (Stage B grew the registry to 30+), each with a full token set', () => {
    // Stage A asserted the exact six; Stage B extended the registry.
    // The legacy boards remain first, in order, and every registered
    // board still carries a complete token set.
    expect(BOARD_THEME_IDS.slice(0, 6)).toEqual([
      'green',
      'brown',
      'blue',
      'grey',
      'purple',
      'wood',
    ]);
    expect(BOARD_THEME_IDS.length).toBeGreaterThanOrEqual(30);
    for (const id of BOARD_THEME_IDS) {
      const t = BOARD_THEMES[id];
      for (const key of [
        'light',
        'dark',
        'lastMove',
        'selected',
        'check',
        'legalDot',
        'arrowDefault',
        'arrowShift',
        'arrowAlt',
        'arrowCtrl',
        'coordOnLight',
        'coordOnDark',
      ] as const) {
        expect(typeof t[key], `${id}.${key}`).toBe('string');
        expect(t[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the historical square colors for the original four themes', () => {
    expect(BOARD_THEMES.green).toMatchObject({ light: '#eeeed2', dark: '#769656' });
    expect(BOARD_THEMES.brown).toMatchObject({ light: '#f0d9b5', dark: '#b58863' });
    expect(BOARD_THEMES.blue).toMatchObject({ light: '#dee3e6', dark: '#8ca2ad' });
    expect(BOARD_THEMES.grey).toMatchObject({ light: '#e8e8e8', dark: '#8a8a8a' });
  });

  it("resolves the 'gray' spelling to the grey tokens and unknown ids to green", () => {
    expect(boardThemeTokens('gray')).toBe(BOARD_THEMES.grey);
    expect(boardThemeTokens('grey')).toBe(BOARD_THEMES.grey);
    expect(boardThemeTokens('purple')).toBe(BOARD_THEMES.purple);
    expect(boardThemeTokens('nope')).toBe(BOARD_THEMES.green);
    expect(boardThemeTokens(undefined)).toBe(BOARD_THEMES.green);
  });

  it('wood theme is CSS-only texture (no image files)', () => {
    expect(BOARD_THEMES.wood.textureLight).toContain('repeating-linear-gradient');
    expect(BOARD_THEMES.wood.textureDark).toContain('repeating-linear-gradient');
    expect(BOARD_THEMES.wood.textureLight).not.toContain('url(');
  });

  it('coordinate colors meet WCAG 4.5:1 against their square in every theme', () => {
    // Translucent squares are rgba(): their rendered color is the
    // composite over the page background they sit on (the standard
    // page background #262522 is the darkest backdrop, hence the
    // worst case), so composite before measuring.
    const rendered = (color: string): string => {
      const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
      if (!m) return color;
      const a = Number(m[4]);
      const bg = [0x26, 0x25, 0x22];
      const ch = [1, 2, 3].map((i) => Math.round(a * Number(m[i]) + (1 - a) * bg[i - 1]));
      return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    for (const id of BOARD_THEME_IDS) {
      const t = BOARD_THEMES[id];
      expect(
        contrastRatio(t.coordOnLight, rendered(t.light)),
        `${id} coordOnLight`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(t.coordOnDark, rendered(t.dark)),
        `${id} coordOnDark`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
