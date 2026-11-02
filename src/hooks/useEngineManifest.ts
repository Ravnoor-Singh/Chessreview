'use client';

// Fetches the deployment's engine manifest once (module-cached) so UI
// surfaces can reflect what the deployment actually ships under its
// ENGINE_BUNDLE profile (Round 2, Prompt 7): the settings drawer filters
// its engine-build options to shipped builds, and a lite-only deployment
// is labeled as such. Returns null while loading or when the manifest is
// unavailable — callers treat null as "unknown, show everything" so a
// missing manifest never hides options.

import { useEffect, useState } from 'react';
import { availableModes, getEngineBaseUrl, type EngineManifest } from '@/engine/engineManifest';
import { loadEngineManifest } from '@/engine/engineLoader';
import type { EngineMode } from '@/lib/types';

export interface EngineAvailability {
  manifest: EngineManifest;
  modes: EngineMode[];
}

let cached: EngineAvailability | null | undefined;
let inflight: Promise<EngineAvailability | null> | null = null;

function fetchAvailability(): Promise<EngineAvailability | null> {
  if (!inflight) {
    inflight = loadEngineManifest(getEngineBaseUrl())
      .then((manifest) => (manifest ? { manifest, modes: availableModes(manifest) } : null))
      .catch(() => null)
      .then((result) => {
        cached = result;
        return result;
      });
  }
  return inflight;
}

export function useEngineAvailability(): EngineAvailability | null {
  const [state, setState] = useState<EngineAvailability | null>(cached ?? null);
  useEffect(() => {
    if (cached !== undefined) {
      setState(cached);
      return;
    }
    let alive = true;
    void fetchAvailability().then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
