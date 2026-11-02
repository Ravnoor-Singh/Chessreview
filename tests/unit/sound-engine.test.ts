import { describe, expect, it, vi } from 'vitest';
import {
  SYNTH_RECIPE_IDS,
  scheduleVoices,
  synthVoicesFor,
  type AudioContextLike,
} from '@/themes/soundEngine';
import { SOUND_THEME_DEFS, type SoundEventName } from '@/themes/sounds';
import { migrateSettings } from '@/store/settingsStore';

const EVENTS: SoundEventName[] = [
  'move',
  'capture',
  'check',
  'castle',
  'promote',
  'end',
  'illegal',
  'start',
  'lowtime',
];

describe('synth sound recipes (Stage C)', () => {
  it('every synth theme in the registry has a recipe, and vice versa', () => {
    const synthIds = SOUND_THEME_DEFS.filter((d) => d.engine === 'synth').map((d) => d.synthRecipe);
    expect(synthIds).toEqual(expect.arrayContaining(SYNTH_RECIPE_IDS));
    expect(SYNTH_RECIPE_IDS.length).toBe(6);
  });

  it('every recipe covers all nine events with sane voices', () => {
    for (const recipeId of SYNTH_RECIPE_IDS) {
      for (const event of EVENTS) {
        const voices = synthVoicesFor(recipeId, event);
        expect(voices.length, `${recipeId}/${event}`).toBeGreaterThan(0);
        for (const voice of voices) {
          expect(voice.at).toBeGreaterThanOrEqual(0);
          expect(voice.dur).toBeGreaterThan(0);
          expect(voice.dur).toBeLessThanOrEqual(0.3);
          expect(voice.gain).toBeGreaterThan(0);
          expect(voice.gain).toBeLessThanOrEqual(1);
          if (voice.kind === 'tone') {
            expect(voice.f0).toBeGreaterThanOrEqual(50);
            expect(voice.f0).toBeLessThanOrEqual(2000);
          }
        }
      }
    }
  });

  it('an unknown recipe falls back to soft; recipes are audibly distinct', () => {
    expect(synthVoicesFor('no-such-recipe', 'move')).toEqual(synthVoicesFor('soft', 'move'));
    const moveSignatures = SYNTH_RECIPE_IDS.map((id) => JSON.stringify(synthVoicesFor(id, 'move')));
    expect(new Set(moveSignatures).size).toBe(SYNTH_RECIPE_IDS.length);
  });
});

/** A structural fake AudioContext recording everything scheduled. */
function fakeContext() {
  const oscillators: { type: string; freq: number; started: boolean }[] = [];
  const gains: { peak: number }[] = [];
  const sources: { started: boolean }[] = [];
  const ctx = {
    currentTime: 2,
    sampleRate: 8000,
    destination: {},
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: {
          value: 0,
          setValueAtTime: vi.fn((v: number) => {
            osc.frequency.value = v;
          }),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(() => {
          record.started = true;
        }),
        stop: vi.fn(),
      };
      const record = { type: osc.type, freq: 0, started: false };
      oscillators.push(record);
      return osc as unknown as OscillatorNode;
    },
    createGain() {
      const record = { peak: 0 };
      gains.push(record);
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn((_v: number) => {
            record.peak = _v;
          }),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      } as unknown as GainNode;
    },
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      } as unknown as BiquadFilterNode;
    },
    createBufferSource() {
      const record = { started: false };
      sources.push(record);
      return {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(() => {
          record.started = true;
        }),
        stop: vi.fn(),
      } as unknown as AudioBufferSourceNode;
    },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return {
        getChannelData: () => new Float32Array(length),
        length,
        sampleRate,
      } as unknown as AudioBuffer;
    },
  };
  return { ctx: ctx as unknown as AudioContextLike, oscillators, gains, sources };
}

describe('scheduleVoices with a fake AudioContext', () => {
  it('schedules one oscillator per tone voice and one source per noise voice', () => {
    const { ctx, oscillators, sources } = fakeContext();
    const voices = synthVoicesFor('soft', 'capture'); // 2 tones? thock = tone+noise, plus extra noise
    scheduleVoices(ctx, voices, 0.5);
    const toneCount = voices.filter((v) => v.kind === 'tone').length;
    const noiseCount = voices.filter((v) => v.kind === 'noise').length;
    expect(oscillators.length).toBe(toneCount);
    expect(sources.length).toBe(noiseCount);
    expect(toneCount + noiseCount).toBe(voices.length);
  });

  it('scales gain peaks by the master volume', () => {
    const a = fakeContext();
    scheduleVoices(a.ctx, synthVoicesFor('glass', 'move'), 1);
    const b = fakeContext();
    scheduleVoices(b.ctx, synthVoicesFor('glass', 'move'), 0.25);
    expect(a.gains[0].peak).toBeGreaterThan(0);
    expect(b.gains[0].peak).toBeCloseTo(a.gains[0].peak * 0.25, 5);
  });

  it('schedules nothing at volume 0', () => {
    const { ctx, oscillators, sources } = fakeContext();
    scheduleVoices(ctx, synthVoicesFor('arcade', 'promote'), 0);
    expect(oscillators.length + sources.length).toBe(0);
  });
});

describe('Stage C settings migration', () => {
  it('defaults soundVolume to 0.5 and blindfoldMode to false', () => {
    const s = migrateSettings({});
    expect(s.soundVolume).toBe(0.5);
    expect(s.blindfoldMode).toBe(false);
  });

  it('clamps soundVolume into [0, 1] and rejects non-numbers', () => {
    expect(migrateSettings({ soundVolume: 1.7 }).soundVolume).toBe(1);
    expect(migrateSettings({ soundVolume: -0.2 }).soundVolume).toBe(0);
    expect(migrateSettings({ soundVolume: Number.NaN }).soundVolume).toBe(0.5);
    expect(migrateSettings({ soundVolume: 0.8 }).soundVolume).toBe(0.8);
  });

  it('blindfoldMode only accepts boolean true', () => {
    expect(migrateSettings({ blindfoldMode: true }).blindfoldMode).toBe(true);
    expect(migrateSettings({ blindfoldMode: 'yes' as unknown as boolean }).blindfoldMode).toBe(
      false,
    );
  });
});
