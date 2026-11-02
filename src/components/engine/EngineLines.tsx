'use client';

import { useMessages } from '@/i18n/useMessages';

import { formatEval } from '@/lib/format';
import { pvToSan } from '@/lib/san';
import type { EngineLine } from '@/lib/types';
import WdlBar from '@/components/review/WdlBar';

export interface EngineLinesProps {
  fen: string;
  lines: EngineLine[];
  thinking: boolean;
  depth: number;
  onPreviewPv: (uciMoves: string[]) => void;
  onPlayPv: (uciMoves: string[]) => void;
}

/** Side to move from a FEN string ('w' | 'b'); defaults to 'w' when malformed. */
export function sideToMove(fen: string): 'w' | 'b' {
  const turn = fen.trim().split(/\s+/)[1];
  return turn === 'b' ? 'b' : 'w';
}

/**
 * Convert a line score (side-to-move perspective) to White's perspective.
 * Mate keeps its sign convention: positive = White mates.
 */
export function lineScoreWhite(fen: string, line: EngineLine): { cp: number; mate?: number } {
  const flip = sideToMove(fen) === 'b' ? -1 : 1;
  if (line.scoreMate !== undefined) {
    const mate = flip * line.scoreMate;
    // Encode mate into the cp channel the same way PlyAnalysis does so
    // formatEval renders it consistently even if called with cp only.
    return { cp: mate === 0 ? 0 : Math.sign(mate) * (100000 - Math.abs(mate)), mate };
  }
  return { cp: flip * (line.scoreCp ?? 0) };
}

export default function EngineLines({
  fen,
  lines,
  thinking,
  depth,
  onPreviewPv,
  onPlayPv,
}: EngineLinesProps) {
  const { t, formatNumber } = useMessages();
  const shown = lines.slice(0, 5);
  const nps = shown[0]?.nps;

  return (
    <section className="rounded-base bg-panel p-3" aria-label={t('engine.engineLinesLabel')}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted" aria-live="polite">
        {thinking ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span>
              {nps !== undefined
                ? t('engine.thinkingDepthNps', { depth, nps: formatNumber(nps) })
                : t('engine.thinkingDepth', { depth })}
            </span>
          </>
        ) : (
          <span>{t('engine.depthOnly', { depth })}</span>
        )}
      </div>

      {shown.length > 0 && shown[0].wdl && (
        <div className="mb-2">
          <WdlBar wdl={shown[0].wdl} sideToMove={sideToMove(fen)} />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t('engine.engineOffThinking')}</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((line) => {
            const { cp, mate } = lineScoreWhite(fen, line);
            const evalText = formatEval(cp, mate);
            const whiteWinning = mate !== undefined ? mate > 0 : cp >= 0;
            let sans: string[] = [];
            try {
              sans = pvToSan(fen, line.pv);
            } catch {
              sans = line.pv;
            }
            return (
              <li
                key={line.multipv}
                className="flex items-start gap-2 rounded bg-panel2 px-2 py-1.5"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums ${
                    whiteWinning ? 'bg-white text-black' : 'bg-black text-white ring-1 ring-line'
                  }`}
                  title={t('engine.evalFromWhite')}
                >
                  {evalText}
                </span>
                <span className="shrink-0 pt-1 text-[10px] tabular-nums text-muted">
                  d{line.depth}
                </span>
                <p className="min-w-0 flex-1 break-words text-[13px] leading-relaxed text-ink">
                  {sans.map((san, i) => (
                    <button
                      key={`${line.multipv}-${i}`}
                      type="button"
                      onClick={() => onPreviewPv(line.pv.slice(0, i + 1))}
                      className="rounded px-0.5 hover:bg-hover hover:underline"
                      title={t('engine.previewThrough', { san })}
                    >
                      {san}
                    </button>
                  ))}
                </p>
                <button
                  type="button"
                  onClick={() => onPlayPv(line.pv)}
                  className="shrink-0 rounded bg-accent px-2 py-1 text-[11px] font-semibold text-[#1d2b12] hover:brightness-110"
                >
                  {t('engine.playLine')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
