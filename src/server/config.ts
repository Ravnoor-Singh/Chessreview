// Server feature flags (Prompt 11).

/**
 * The legacy chess.com "callback" import path stays behind this flag
 * (default OFF). When off, /api/chesscom?id=… answers NOT_CONFIGURED
 * (503) and the client offers the paste-PGN fallback panel instead. The
 * username archive import is unaffected.
 */
export function chesscomCallbackEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CHESSCOM_CALLBACK_ENABLED === '1' || env.CHESSCOM_CALLBACK_ENABLED === 'true';
}
