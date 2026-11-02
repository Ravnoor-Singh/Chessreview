// Structured engine-failure errors + localized formatting.
//
// Design (Prompt 10 review fix): the engine loading code
// (engineLoader.ts, stockfish.worker.ts) runs without knowing the
// user's chosen UI locale — it may start before settings are read,
// and the same thrown error can surface on screens rendered later.
// So failures are thrown as STRUCTURED errors (a stable `code` plus
// the raw diagnostic fields), never as pre-localized sentences. The
// English `message` on each error is composed from the English
// catalogue at throw time purely as a fallback for non-localizing
// consumers (logs, tests, other catch sites). The UI layer —
// `useEngine()` and the review page — recomposes the user-visible
// sentence in the ACTIVE locale at render time through
// `formatEngineError(locale, error)`, filling the catalogue
// placeholders ({builds}, {detail}, {file}, {expected}, {actual})
// from the structured fields. Raw per-build diagnostics (file names,
// HTTP/UCI messages) are preserved verbatim inside {detail} so
// developers keep the full picture in every locale.

import { t, type Locale, type MessageKey } from '@/i18n';
import type { EngineMode } from '@/lib/types';
import { EngineIntegrityError } from './engineManifest';

export { EngineIntegrityError };

/** Catalogue key for each build's display label (shared with the UI). */
export const ENGINE_BUILD_MESSAGE_KEY: Record<EngineMode, MessageKey> = {
  multi: 'pwa.buildFull',
  single: 'pwa.buildSingle',
  lite: 'pwa.buildLite',
};

/** Localized display label for an engine build, e.g. "Lite". */
export function engineBuildLabel(locale: Locale, mode: EngineMode): string {
  return t(locale, ENGINE_BUILD_MESSAGE_KEY[mode]);
}

/** One failed build attempt: which build, which file, raw diagnostic. */
export interface EngineBuildFailure {
  mode: EngineMode;
  file: string;
  detail: string;
}

/** Render the per-build failure list in `locale` (labels localized, detail raw). */
export function formatEngineBuildFailures(
  locale: Locale,
  failures: readonly EngineBuildFailure[],
): string {
  return failures
    .map((f) => `${engineBuildLabel(locale, f.mode)} (${f.file}): ${f.detail}`)
    .join(' ');
}

/** Compose the all-builds-failed sentence in `locale`. */
export function formatEngineLoadMessage(
  locale: Locale,
  builds: readonly EngineMode[],
  failures: readonly EngineBuildFailure[],
): string {
  return t(locale, 'errors.engineLoadAllFailed', {
    builds: builds.map((m) => engineBuildLabel(locale, m)).join(' → '),
    detail: formatEngineBuildFailures(locale, failures),
  });
}

/**
 * Thrown when every engine build failed to load. Structured twin of
 * the old free-text init error: `builds` is the attempted build list
 * and `failures` the per-build diagnostics.
 */
export class EngineLoadError extends Error {
  readonly code = 'engine-load-all-failed' as const;
  readonly builds: EngineMode[];
  readonly failures: EngineBuildFailure[];

  constructor(builds: readonly EngineMode[], failures: readonly EngineBuildFailure[]) {
    super(formatEngineLoadMessage('en', builds, failures));
    this.name = 'EngineLoadError';
    this.builds = [...builds];
    this.failures = failures.map((f) => ({ ...f }));
  }
}

/**
 * Compose the user-visible message for any engine-surface failure in
 * `locale`. Structured errors (EngineLoadError, EngineIntegrityError
 * with fields) are localized from the catalogue; an unknown Error
 * keeps its raw message as the diagnostic detail; a non-Error thrown
 * value falls back to the localized generic sentence
 * (`errors.engineFailedToLoad`, formerly the hardcoded
 * 'Engine failed to load' fallback in useEngine).
 */
export function formatEngineError(locale: Locale, error: unknown): string {
  if (error instanceof EngineLoadError) {
    return formatEngineLoadMessage(locale, error.builds, error.failures);
  }
  if (error instanceof EngineIntegrityError) {
    if (error.file && error.expected && error.actual) {
      return t(locale, 'errors.engineIntegrityFailed', {
        file: error.file,
        expected: error.expected,
        actual: error.actual,
      });
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return t(locale, 'errors.engineFailedToLoad');
}
