/**
 * Web Audio sound engine (Themes & Presets, Stage C).
 *
 * Every 'synth' sound theme is a table of voices per event; a voice is
 * either a tone (oscillator with a frequency glide and a gain envelope)
 * or a noise burst (looped noise buffer through a biquad filter).
 * All recipes were written for this project — no sampled or recorded
 * audio is involved. The engine is loaded lazily (dynamic import from
 * useSound) so it never weighs on first load.
 *
 * Testability: `synthVoicesFor` is pure, and `scheduleVoices` takes any
 * structurally-compatible AudioContext, so unit tests drive it with a
 * fake context and assert exactly what would be scheduled.
 */
import type { SoundEventName } from './sounds';

export interface ToneVoice {
  kind: 'tone';
  wave: OscillatorType;
  /** Start frequency (Hz). */
  f0: number;
  /** End frequency (Hz) — omit for a steady tone. */
  f1?: number;
  /** Start offset in seconds from the event. */
  at: number;
  /** Duration in seconds. */
  dur: number;
  /** Peak gain before the master volume is applied (0..1). */
  gain: number;
}

export interface NoiseVoice {
  kind: 'noise';
  at: number;
  dur: number;
  gain: number;
  filterType: BiquadFilterType;
  filterFreq: number;
}

export type SynthVoice = ToneVoice | NoiseVoice;

type Recipe = Record<SoundEventName, SynthVoice[]>;

const tone = (
  wave: OscillatorType,
  f0: number,
  f1: number | undefined,
  at: number,
  dur: number,
  gain: number,
): ToneVoice => ({ kind: 'tone', wave, f0, f1, at, dur, gain });

const noise = (
  at: number,
  dur: number,
  gain: number,
  filterType: BiquadFilterType,
  filterFreq: number,
): NoiseVoice => ({ kind: 'noise', at, dur, gain, filterType, filterFreq });

/** Felt-like thock: a low sine thump plus a soft filtered-noise tap. */
const thock = (at: number, base: number, gain: number): SynthVoice[] => [
  tone('sine', base, base * 0.47, at, 0.09, gain),
  noise(at, 0.045, gain * 0.32, 'lowpass', 750),
];

const RECIPES: Record<string, Recipe> = {
  soft: {
    move: thock(0, 190, 0.5),
    capture: [...thock(0, 150, 0.62), noise(0, 0.08, 0.22, 'lowpass', 900)],
    check: [
      tone('sine', 660, undefined, 0, 0.07, 0.3),
      tone('sine', 880, undefined, 0.08, 0.1, 0.3),
    ],
    castle: [...thock(0, 180, 0.5), ...thock(0.075, 170, 0.5)],
    promote: [
      tone('sine', 523, undefined, 0, 0.09, 0.32),
      tone('sine', 659, undefined, 0.07, 0.09, 0.32),
      tone('sine', 784, undefined, 0.14, 0.13, 0.34),
    ],
    end: [
      tone('sine', 392, undefined, 0, 0.1, 0.34),
      tone('sine', 330, undefined, 0.1, 0.1, 0.34),
      tone('sine', 262, undefined, 0.2, 0.16, 0.34),
    ],
    illegal: [tone('square', 138, 120, 0, 0.09, 0.16)],
    start: [tone('sine', 330, 442, 0, 0.09, 0.32)],
    lowtime: [
      tone('sine', 988, undefined, 0, 0.05, 0.22),
      tone('sine', 988, undefined, 0.09, 0.05, 0.22),
    ],
  },
  marble: {
    move: [noise(0, 0.03, 0.42, 'highpass', 2100), tone('triangle', 330, 175, 0, 0.055, 0.4)],
    capture: [noise(0, 0.04, 0.5, 'highpass', 1700), tone('triangle', 240, 110, 0, 0.08, 0.52)],
    check: [tone('sine', 1245, undefined, 0, 0.13, 0.3), noise(0, 0.025, 0.3, 'highpass', 2600)],
    castle: [
      noise(0, 0.03, 0.4, 'highpass', 2100),
      tone('triangle', 320, 170, 0, 0.05, 0.38),
      noise(0.07, 0.03, 0.4, 'highpass', 2100),
      tone('triangle', 300, 160, 0.07, 0.05, 0.38),
    ],
    promote: [
      tone('sine', 1046, undefined, 0, 0.09, 0.28),
      tone('sine', 1318, undefined, 0.06, 0.12, 0.28),
    ],
    end: [tone('triangle', 392, 196, 0, 0.16, 0.4), noise(0, 0.04, 0.3, 'highpass', 1800)],
    illegal: [tone('triangle', 165, 130, 0, 0.09, 0.32)],
    start: [noise(0, 0.03, 0.36, 'highpass', 2100), tone('sine', 880, undefined, 0.02, 0.09, 0.26)],
    lowtime: [
      tone('sine', 1568, undefined, 0, 0.05, 0.24),
      tone('sine', 1568, undefined, 0.085, 0.05, 0.24),
    ],
  },
  glass: {
    move: [tone('sine', 884, 852, 0, 0.19, 0.24)],
    capture: [
      tone('sine', 742, undefined, 0, 0.16, 0.26),
      tone('sine', 1180, undefined, 0.015, 0.2, 0.2),
    ],
    check: [tone('sine', 1318, 1290, 0, 0.24, 0.27)],
    castle: [tone('sine', 884, 852, 0, 0.16, 0.22), tone('sine', 996, 960, 0.09, 0.18, 0.22)],
    promote: [
      tone('sine', 880, undefined, 0, 0.16, 0.24),
      tone('sine', 1108, undefined, 0.07, 0.16, 0.24),
      tone('sine', 1318, undefined, 0.14, 0.22, 0.26),
    ],
    end: [
      tone('sine', 1046, undefined, 0, 0.16, 0.24),
      tone('sine', 784, undefined, 0.11, 0.16, 0.24),
      tone('sine', 659, undefined, 0.22, 0.22, 0.24),
    ],
    illegal: [tone('sine', 233, 208, 0, 0.13, 0.24)],
    start: [tone('sine', 988, 1024, 0, 0.15, 0.24)],
    lowtime: [
      tone('sine', 1568, undefined, 0, 0.09, 0.2),
      tone('sine', 1568, undefined, 0.12, 0.09, 0.2),
    ],
  },
  metal: {
    move: [tone('square', 246, 190, 0, 0.055, 0.14), noise(0, 0.035, 0.24, 'bandpass', 3100)],
    capture: [
      tone('square', 185, 130, 0, 0.08, 0.18),
      tone('triangle', 1244, undefined, 0, 0.1, 0.16),
      noise(0, 0.05, 0.3, 'bandpass', 2600),
    ],
    check: [
      tone('triangle', 1568, undefined, 0, 0.15, 0.24),
      tone('square', 784, undefined, 0, 0.05, 0.08),
    ],
    castle: [
      tone('square', 246, 190, 0, 0.05, 0.14),
      noise(0, 0.03, 0.22, 'bandpass', 3100),
      tone('square', 220, 175, 0.07, 0.05, 0.14),
      noise(0.07, 0.03, 0.22, 'bandpass', 2900),
    ],
    promote: [
      tone('triangle', 784, undefined, 0, 0.09, 0.2),
      tone('triangle', 1046, undefined, 0.06, 0.09, 0.2),
      tone('triangle', 1318, undefined, 0.12, 0.13, 0.22),
    ],
    end: [tone('square', 147, 110, 0, 0.18, 0.18), noise(0, 0.06, 0.2, 'bandpass', 1800)],
    illegal: [tone('square', 110, 104, 0, 0.13, 0.18)],
    start: [tone('triangle', 523, undefined, 0, 0.08, 0.2), noise(0, 0.03, 0.18, 'bandpass', 3100)],
    lowtime: [
      tone('triangle', 1760, undefined, 0, 0.05, 0.2),
      tone('triangle', 1760, undefined, 0.08, 0.05, 0.2),
    ],
  },
  arcade: {
    move: [tone('square', 440, 220, 0, 0.07, 0.16)],
    capture: [
      tone('square', 220, undefined, 0, 0.045, 0.17),
      tone('square', 330, undefined, 0.045, 0.045, 0.17),
      tone('square', 440, undefined, 0.09, 0.06, 0.17),
    ],
    check: [
      tone('square', 880, undefined, 0, 0.055, 0.17),
      tone('square', 880, undefined, 0.085, 0.07, 0.17),
    ],
    castle: [
      tone('square', 262, undefined, 0, 0.04, 0.16),
      tone('square', 330, undefined, 0.04, 0.04, 0.16),
      tone('square', 392, undefined, 0.08, 0.04, 0.16),
      tone('square', 523, undefined, 0.12, 0.06, 0.16),
    ],
    promote: [
      tone('square', 523, undefined, 0, 0.045, 0.17),
      tone('square', 659, undefined, 0.045, 0.045, 0.17),
      tone('square', 784, undefined, 0.09, 0.045, 0.17),
      tone('square', 1046, undefined, 0.135, 0.08, 0.18),
    ],
    end: [
      tone('square', 784, undefined, 0, 0.05, 0.16),
      tone('square', 659, undefined, 0.05, 0.05, 0.16),
      tone('square', 523, undefined, 0.1, 0.05, 0.16),
      tone('square', 392, undefined, 0.15, 0.09, 0.16),
    ],
    illegal: [tone('square', 98, 92, 0, 0.16, 0.18)],
    start: [
      tone('square', 392, undefined, 0, 0.04, 0.16),
      tone('square', 523, undefined, 0.04, 0.04, 0.16),
      tone('square', 659, undefined, 0.08, 0.06, 0.16),
    ],
    lowtime: [
      tone('square', 1175, undefined, 0, 0.04, 0.15),
      tone('square', 1175, undefined, 0.07, 0.04, 0.15),
      tone('square', 1175, undefined, 0.14, 0.04, 0.15),
    ],
  },
  playful: {
    move: [tone('sine', 305, 525, 0, 0.085, 0.34)],
    capture: [tone('sine', 510, 235, 0, 0.1, 0.36), tone('sine', 190, 90, 0.02, 0.07, 0.3)],
    check: [tone('sine', 205, 615, 0, 0.09, 0.3), tone('sine', 615, 305, 0.09, 0.1, 0.3)],
    castle: [tone('sine', 305, 525, 0, 0.08, 0.32), tone('sine', 340, 590, 0.085, 0.09, 0.32)],
    promote: [
      tone('sine', 523, undefined, 0, 0.07, 0.32),
      tone('sine', 659, undefined, 0.06, 0.07, 0.32),
      tone('sine', 784, undefined, 0.12, 0.07, 0.32),
      tone('sine', 1046, undefined, 0.18, 0.11, 0.34),
    ],
    end: [tone('sine', 810, 295, 0, 0.22, 0.3)],
    illegal: [tone('sine', 165, 138, 0, 0.07, 0.3), tone('sine', 150, 128, 0.08, 0.08, 0.3)],
    start: [tone('sine', 262, 523, 0, 0.11, 0.32)],
    lowtime: [tone('sine', 740, 990, 0, 0.06, 0.26), tone('sine', 740, 990, 0.1, 0.06, 0.26)],
  },
};

export const SYNTH_RECIPE_IDS = Object.keys(RECIPES);

/** Voices for a recipe + event; unknown recipes fall back to 'soft'. */
export function synthVoicesFor(recipeId: string, event: SoundEventName): SynthVoice[] {
  const recipe = RECIPES[recipeId] ?? RECIPES.soft;
  return recipe[event] ?? recipe.move;
}

/** Minimal structural view of AudioContext used by the scheduler. */
export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

const noiseBuffers = new WeakMap<object, AudioBuffer>();

function noiseBuffer(ctx: AudioContextLike): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Schedule every voice on the context at its current time. */
export function scheduleVoices(ctx: AudioContextLike, voices: SynthVoice[], volume: number): void {
  const master = Math.min(1, Math.max(0, volume));
  if (master <= 0) return;
  const t0 = ctx.currentTime;
  for (const voice of voices) {
    const start = t0 + voice.at;
    const gainNode = ctx.createGain();
    const peak = Math.max(0.0008, voice.gain * master);
    gainNode.gain.setValueAtTime(0.0008, start);
    gainNode.gain.linearRampToValueAtTime(peak, start + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0008, start + voice.dur);
    gainNode.connect(ctx.destination);
    if (voice.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(Math.max(20, voice.f0), start);
      if (voice.f1 !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.f1), start + voice.dur);
      }
      osc.connect(gainNode);
      osc.start(start);
      osc.stop(start + voice.dur + 0.05);
    } else {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filterType;
      filter.frequency.setValueAtTime(voice.filterFreq, start);
      source.connect(filter);
      filter.connect(gainNode);
      source.start(start);
      source.stop(start + voice.dur + 0.05);
    }
  }
}

let sharedContext: AudioContext | null = null;

/**
 * Play one synthesized event. Safe to call anywhere: failures (no Web
 * Audio, autoplay policy) are swallowed exactly like the WAV path.
 */
export function playSynthSound(recipeId: string, event: SoundEventName, volume: number): void {
  try {
    if (typeof window === 'undefined' || volume <= 0) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    sharedContext ??= new Ctor();
    if (sharedContext.state === 'suspended') void sharedContext.resume();
    scheduleVoices(sharedContext, synthVoicesFor(recipeId, event), volume);
  } catch {
    // audio unsupported / blocked — sounds are decorative
  }
}
