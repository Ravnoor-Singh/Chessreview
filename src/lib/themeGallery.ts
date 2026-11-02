/**
 * Theme-gallery route gate (Post-Round-2 Prompt 3).
 *
 * `/theme-gallery` is a dev/test-only tool: it renders every registered
 * theme asset for design review and is the subject of the Playwright
 * contact-sheet spec (tests/e2e/themes-gallery.spec.ts). It is not a
 * user feature — nothing in the app links to it, it is in no sitemap
 * (the app has none) and it is not in the service-worker precache list
 * (see precacheUrls in src/lib/swCore.mjs).
 *
 * The gallery is enabled when the app is NOT running a production
 * build (local dev, tests), or when the operator explicitly opts in
 * with ENABLE_THEME_GALLERY=1 in the server environment. Any other
 * production deployment gets a 404 from the route (see
 * src/app/theme-gallery/page.tsx, which calls notFound()).
 */

export interface ThemeGalleryEnv {
  NODE_ENV?: string;
  ENABLE_THEME_GALLERY?: string;
}

export function isThemeGalleryEnabled(env: ThemeGalleryEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.ENABLE_THEME_GALLERY === '1';
}
