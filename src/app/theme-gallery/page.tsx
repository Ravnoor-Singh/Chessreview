import { notFound } from 'next/navigation';
import { isThemeGalleryEnabled } from '@/lib/themeGallery';
import ThemeGalleryClient from './ThemeGalleryClient';

/**
 * Theme gallery route gate (Post-Round-2 Prompt 3): the gallery is a
 * dev/test-only tool, so in production it answers with the framework
 * 404 (notFound()) unless the server runs with ENABLE_THEME_GALLERY=1
 * (the Playwright webServer in playwright.config.ts sets that flag, so
 * the contact-sheet spec keeps working against a production build).
 * The gallery UI itself is the client component in
 * ThemeGalleryClient.tsx; this server wrapper exists so the gate runs
 * on the server, per request.
 */
export const dynamic = 'force-dynamic';

export default function ThemeGalleryPage(): React.JSX.Element {
  if (!isThemeGalleryEnabled()) notFound();
  return <ThemeGalleryClient />;
}
