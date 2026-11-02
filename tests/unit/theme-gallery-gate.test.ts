import { describe, expect, it } from 'vitest';
import { isThemeGalleryEnabled } from '@/lib/themeGallery';

/**
 * Post-Round-2 Prompt 3: /theme-gallery is dev/test-only. These tests
 * pin the exact gate the server page component applies before
 * rendering (production without the flag → the page calls notFound();
 * the live 404/200 behaviour against a production server is verified
 * by curl in the Prompt 3 report, and the enabled path is exercised
 * end to end by tests/e2e/themes-gallery.spec.ts).
 */
describe('isThemeGalleryEnabled', () => {
  it('is disabled in production without the flag', () => {
    expect(isThemeGalleryEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isThemeGalleryEnabled({ NODE_ENV: 'production', ENABLE_THEME_GALLERY: '' })).toBe(false);
    expect(isThemeGalleryEnabled({ NODE_ENV: 'production', ENABLE_THEME_GALLERY: '0' })).toBe(
      false,
    );
  });

  it('is enabled in production only by the exact flag value "1"', () => {
    expect(isThemeGalleryEnabled({ NODE_ENV: 'production', ENABLE_THEME_GALLERY: '1' })).toBe(true);
    expect(isThemeGalleryEnabled({ NODE_ENV: 'production', ENABLE_THEME_GALLERY: 'true' })).toBe(
      false,
    );
  });

  it('is enabled outside production regardless of the flag', () => {
    expect(isThemeGalleryEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isThemeGalleryEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isThemeGalleryEnabled({ NODE_ENV: 'development', ENABLE_THEME_GALLERY: '0' })).toBe(
      true,
    );
    expect(isThemeGalleryEnabled({})).toBe(true);
  });
});
