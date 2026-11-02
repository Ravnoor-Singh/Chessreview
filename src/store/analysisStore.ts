import { create } from 'zustand';
import type { EngineLine } from '@/lib/types';

interface AnalysisStore {
  engineReady: boolean;
  engineName: string;
  engineMode: 'multi' | 'single' | 'lite';
  /** WASM download progress while the engine loads: 0–100, null = idle/done/indeterminate-with-no-progress-yet. */
  engineLoadProgress: number | null;
  engineBuildFile: string | null;
  engineWasmSize: number | null;
  engineVersion: string | null;
  liveLines: EngineLine[];
  liveDepth: number;
  liveNps: number;
  liveThinking: boolean;
  liveFen: string | null;
  showBestArrow: boolean;
  engineEnabled: boolean;

  setEngine: (name: string, mode: 'multi' | 'single' | 'lite') => void;
  setEngineLoadProgress: (v: number | null) => void;
  setEngineDetails: (d: {
    buildFile: string | null;
    wasmSize: number | null;
    version: string | null;
  }) => void;
  setLive: (fen: string, lines: EngineLine[], depth: number, nps: number) => void;
  setLiveThinking: (v: boolean) => void;
  setShowBestArrow: (v: boolean) => void;
  setEngineEnabled: (v: boolean) => void;
  clearLive: () => void;
}

export const useAnalysisStore = create<AnalysisStore>()((set) => ({
  engineReady: false,
  engineName: 'Stockfish',
  engineMode: 'single',
  engineLoadProgress: null,
  engineBuildFile: null,
  engineWasmSize: null,
  engineVersion: null,
  liveLines: [],
  liveDepth: 0,
  liveNps: 0,
  liveThinking: false,
  liveFen: null,
  showBestArrow: false,
  engineEnabled: true,

  setEngine: (name, mode) => set({ engineReady: true, engineName: name, engineMode: mode }),
  setEngineLoadProgress: (v) => set({ engineLoadProgress: v }),
  setEngineDetails: (d) =>
    set({ engineBuildFile: d.buildFile, engineWasmSize: d.wasmSize, engineVersion: d.version }),
  setLive: (fen, lines, depth, nps) =>
    set({ liveFen: fen, liveLines: lines, liveDepth: depth, liveNps: nps }),
  setLiveThinking: (v) => set({ liveThinking: v }),
  setShowBestArrow: (v) => set({ showBestArrow: v }),
  setEngineEnabled: (v) => set({ engineEnabled: v }),
  clearLive: () =>
    set({ liveLines: [], liveDepth: 0, liveNps: 0, liveFen: null, liveThinking: false }),
}));
