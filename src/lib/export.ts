// Export helpers: annotated PGN, share links (spec Section 11).
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { GameReview } from '@/lib/types';
import { CLASS_NAG, CLASS_STYLE } from '@/lib/constants';
import { formatEval } from '@/lib/format';

/** Build an annotated PGN with [%eval], [%clk] and classification comments + NAGs. */
export function buildAnnotatedPgn(review: GameReview): string {
  const headers = { ...review.headers };
  if (!headers.Event) headers.Event = 'Game Review';
  const headerLines = Object.entries(headers)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `[${k} "${String(v).replace(/"/g, '')}"]`)
    .join('\n');

  const parts: string[] = [];
  const startTurn = review.plies[0]?.fen.split(' ')[1] ?? 'w';
  let moveNo = Number(review.plies[0]?.fen.split(' ')[5] ?? '1');
  for (let i = 1; i < review.plies.length; i++) {
    const ply = review.plies[i];
    if (!ply.san) continue;
    const isWhiteMove = ply.color === 'w';
    if (isWhiteMove || i === 1) {
      parts.push(`${moveNo}.`);
      if (!isWhiteMove && i === 1) parts[parts.length - 1] = `${moveNo}...`;
    }
    let token = ply.san;
    const nag = ply.classification ? CLASS_NAG[ply.classification] : undefined;
    if (nag) token += ` $${nag}`;
    const annotations: string[] = [];
    annotations.push(`[%eval ${formatEval(ply.evalWhiteCp, ply.mate)}]`);
    if (ply.clockMs !== undefined) {
      const totalSec = Math.floor(ply.clockMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      annotations.push(`[%clk ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`);
    }
    token += ` {${annotations.join(' ')}`;
    if (ply.classification) {
      const label = CLASS_STYLE[ply.classification]?.label ?? ply.classification;
      token += ` ${label}.`;
      if (ply.feedback) token += ` ${ply.feedback.replace(/[{}]/g, '')}`;
    }
    token += '}';
    parts.push(token);
    if (!isWhiteMove) moveNo++;
    void startTurn;
  }
  parts.push(review.headers.Result ?? '*');
  return `${headerLines}\n\n${parts.join(' ')}\n`;
}

export function shareUrlForPgn(pgn: string, origin: string): string {
  return `${origin}/review#pgn=${compressToEncodedURIComponent(pgn)}`;
}

export function pgnFromShareHash(hash: string): string | null {
  const m = hash.match(/[#&]pgn=([^&]+)/);
  if (!m) return null;
  try {
    return decompressFromEncodedURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
