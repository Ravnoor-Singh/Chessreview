'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Applies the selected page background (Themes & Presets).
 *
 * The background definitions are lazy-loaded (dynamic import) so the
 * registry stays out of the first-load bundle; until the chunk arrives
 * the built-in page background shows, which is also the permanent look
 * for the 'standard' background. Application is via CSS custom
 * properties consumed by the body::before/::after layer in globals.css,
 * plus making --bg-page transparent so page roots (bg-page) let the
 * layer show through. Panels keep their solid colors, and every
 * definition's fixed scrim keeps text readable (themes:check verifies
 * ≥ 4.5:1 against the effective background).
 *
 * Stage B additions: user-built backgrounds (custom color / gradient /
 * image from IndexedDB — rendered from the settings + local blob, with
 * the user's scrim strength painted toward the active UI theme), and
 * motion discipline for animated definitions: no animation under
 * prefers-reduced-motion or the low-power setting, and the animation
 * pauses while the tab is hidden (body[data-bg-paused]).
 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function BackgroundLayer(): null {
  const backgroundId = useSettingsStore((s) => s.settings.backgroundId);
  const customBackground = useSettingsStore((s) => s.settings.customBackground);
  const lowPowerBackgrounds = useSettingsStore((s) => s.settings.lowPowerBackgrounds);
  const uiTheme = useSettingsStore((s) => s.settings.theme);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    const root = document.documentElement;
    const body = document.body;
    const clear = (): void => {
      root.style.removeProperty('--bg-page');
      body.style.removeProperty('--page-bg-color');
      body.style.removeProperty('--page-bg-image');
      body.style.removeProperty('--page-bg-size');
      body.style.removeProperty('--page-scrim');
      body.removeAttribute('data-bg-anim');
      body.removeAttribute('data-bg-paused');
    };
    const applyScrim = (color: string, opacity: number): void => {
      const [r, g, b] = hexToRgb(color);
      body.style.setProperty('--page-scrim', `rgba(${r}, ${g}, ${b}, ${opacity})`);
    };
    // The user's scrim slider pushes toward the active UI theme's
    // readability: black overlay in dark UI, white in light UI.
    const applyCustomScrim = (): void => {
      applyScrim(uiTheme === 'dark' ? '#000000' : '#ffffff', customBackground.scrim);
    };
    const onVisibility = (): void => {
      if (document.hidden) body.setAttribute('data-bg-paused', '1');
      else body.removeAttribute('data-bg-paused');
    };

    void (async () => {
      const { getBackgroundDef } = await import('@/themes/backgrounds');
      if (!alive) return;
      const def = getBackgroundDef(backgroundId);
      if (!def || def.id === 'standard') {
        clear();
        return;
      }
      root.style.setProperty('--bg-page', 'transparent');

      if (def.category === 'custom') {
        const { customGradientCss, loadCustomBackgroundImage } =
          await import('@/themes/customBackground');
        if (!alive) return;
        body.removeAttribute('data-bg-anim');
        if (def.id === 'custom-color') {
          body.style.setProperty('--page-bg-color', customBackground.color);
          body.style.removeProperty('--page-bg-image');
          body.style.setProperty('--page-bg-size', 'cover');
        } else if (def.id === 'custom-gradient') {
          body.style.setProperty('--page-bg-color', customBackground.gradientTo);
          body.style.setProperty('--page-bg-image', customGradientCss(customBackground));
          body.style.setProperty('--page-bg-size', 'cover');
        } else {
          // custom-image: blob from this device's IndexedDB only.
          body.style.setProperty('--page-bg-color', def.backgroundColor);
          const blob = await loadCustomBackgroundImage().catch(() => null);
          if (!alive) return;
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            body.style.setProperty('--page-bg-image', `url("${objectUrl}")`);
          } else {
            body.style.removeProperty('--page-bg-image');
          }
          body.style.setProperty('--page-bg-size', 'cover');
        }
        applyCustomScrim();
        return;
      }

      body.style.setProperty('--page-bg-color', def.backgroundColor);
      if (def.backgroundImage) {
        body.style.setProperty('--page-bg-image', def.backgroundImage);
      } else {
        body.style.removeProperty('--page-bg-image');
      }
      body.style.setProperty('--page-bg-size', def.backgroundSize ?? 'cover');
      applyScrim(def.scrim.color, def.scrim.opacity);
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (def.flags.animated && !lowPowerBackgrounds && !reducedMotion) {
        body.setAttribute('data-bg-anim', def.id);
        if (document.hidden) body.setAttribute('data-bg-paused', '1');
        document.addEventListener('visibilitychange', onVisibility);
      } else {
        body.removeAttribute('data-bg-anim');
        body.removeAttribute('data-bg-paused');
      }
    })();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [backgroundId, customBackground, lowPowerBackgrounds, uiTheme]);

  return null;
}
