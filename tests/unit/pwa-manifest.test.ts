import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The PWA manifest must be complete and every file it references must
// exist under public/ — a missing icon silently breaks installability.
const publicDir = join(__dirname, '..', '..', 'public');
const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8')) as {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  categories: string[];
  icons: { src: string; sizes: string; purpose?: string; type: string }[];
  shortcuts: { name: string; url: string }[];
};

describe('manifest.webmanifest', () => {
  it('has the required identity/display fields with the app colours', () => {
    expect(manifest.name).toContain('Chess Review');
    expect(manifest.short_name).toBe('Chess Review');
    expect(manifest.description.length).toBeGreaterThan(20);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#262522');
    expect(manifest.theme_color).toBe('#262522');
    expect(manifest.categories).toContain('games');
  });

  it('ships 192 + 512 PNG icons and a maskable 512, all present on disk', () => {
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    expect(png.some((i) => i.sizes === '192x192')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it('shortcuts point at real app targets (home + the #recent anchor), no fake routes', () => {
    const urls = manifest.shortcuts.map((s) => s.url);
    expect(urls).toContain('/');
    expect(urls).toContain('/#recent');
    // The #recent anchor must exist in the home page source.
    const home = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'page.tsx'), 'utf8');
    expect(home).toContain('id="recent"');
  });
});
