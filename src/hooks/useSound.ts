'use client';

import { useCallback, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { getSoundThemeDef } from '@/themes/sounds';

export type SoundName =
  'move' | 'capture' | 'check' | 'castle' | 'promote' | 'end' | 'illegal' | 'start';

const cache = new Map<SoundName, HTMLAudioElement>();

function getAudio(name: SoundName, volume: number): HTMLAudioElement {
  let a = cache.get(name);
  if (!a) {
    a = new Audio(`/sounds/${name}.wav`);
    a.preload = 'auto';
    cache.set(name, a);
  }
  a.volume = volume;
  return a;
}

/** Preload all sounds (call once on first user gesture). */
export function preloadSounds(): void {
  (
    ['move', 'capture', 'check', 'castle', 'promote', 'end', 'illegal', 'start'] as SoundName[]
  ).forEach((n) => {
    try {
      getAudio(n, 0.5).load();
    } catch {
      // audio unsupported
    }
  });
}

function playWithTheme(name: SoundName, themeId: string, volume: number): void {
  const def = getSoundThemeDef(themeId);
  if (!def || def.engine === 'none' || volume <= 0) return;
  if (def.engine === 'synth') {
    // Lazily loaded so the Web Audio engine never weighs on first load.
    void import('@/themes/soundEngine')
      .then((m) => m.playSynthSound(def.synthRecipe ?? 'soft', name, volume))
      .catch(() => undefined);
    return;
  }
  try {
    const a = getAudio(name, volume);
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    // ignore autoplay restrictions
  }
}

export function useSound(): {
  play: (name: SoundName) => void;
  playPreview: (name: SoundName, themeId: string, volume: number) => void;
} {
  const sounds = useSettingsStore((s) => s.settings.sounds);
  const soundThemeId = useSettingsStore((s) => s.settings.soundThemeId);
  const soundVolume = useSettingsStore((s) => s.settings.soundVolume);
  const lastPlay = useRef(0);

  const play = useCallback(
    (name: SoundName) => {
      if (!sounds) return;
      const now = performance.now();
      if (now - lastPlay.current < 30) return; // de-bounce double renders
      lastPlay.current = now;
      playWithTheme(name, soundThemeId ?? 'standard', soundVolume ?? 0.5);
    },
    [sounds, soundThemeId, soundVolume],
  );

  /** Play with explicit theme/volume — used by the settings page to audition a draft before saving. */
  const playPreview = useCallback((name: SoundName, themeId: string, volume: number) => {
    playWithTheme(name, themeId, volume);
  }, []);

  return { play, playPreview };
}

/** Pick the right sound for a move given its SAN and flags. */
export function soundForMove(
  san: string,
  opts: { capture: boolean; castle: boolean; promotion: boolean; check: boolean; gameEnd: boolean },
): SoundName {
  if (opts.gameEnd) return 'end';
  if (opts.promotion) return 'promote';
  if (opts.castle) return 'castle';
  if (opts.check || san.includes('+') || san.includes('#')) return 'check';
  if (opts.capture || san.includes('x')) return 'capture';
  return 'move';
}
