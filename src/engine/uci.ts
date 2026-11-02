// UCI protocol parsing/serialization helpers (spec 5.1).
import type { EngineLine } from '@/lib/types';

export interface InfoUpdate {
  depth: number;
  seldepth?: number;
  multipv: number;
  scoreCp?: number;
  scoreMate?: number;
  wdl?: [number, number, number];
  nodes?: number;
  nps?: number;
  pv: string[];
}

/** Parse one `info depth ...` line. Returns null for non-search info lines. */
export function parseInfoLine(line: string): InfoUpdate | null {
  if (!line.startsWith('info ') || !line.includes(' depth ')) return null;
  if (line.includes(' string')) return null;
  const tokens = line.split(/\s+/);
  const out: Partial<InfoUpdate> & { pv: string[] } = { pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        out.depth = Number(tokens[++i]);
        break;
      case 'seldepth':
        out.seldepth = Number(tokens[++i]);
        break;
      case 'multipv':
        out.multipv = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const val = Number(tokens[++i]);
        if (kind === 'cp') out.scoreCp = val;
        else if (kind === 'mate') out.scoreMate = val;
        break;
      }
      case 'wdl': {
        const w = Number(tokens[++i]);
        const d = Number(tokens[++i]);
        const l = Number(tokens[++i]);
        out.wdl = [w, d, l];
        break;
      }
      case 'nodes':
        out.nodes = Number(tokens[++i]);
        break;
      case 'nps':
        out.nps = Number(tokens[++i]);
        break;
      case 'pv':
        out.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      default:
        break;
    }
  }
  if (out.depth === undefined || out.multipv === undefined) return null;
  if (out.scoreCp === undefined && out.scoreMate === undefined) return null;
  return out as InfoUpdate;
}

/**
 * UCI `position` command for a search (Round 2). When repetition
 * history is supplied, the engine is given the game start position plus
 * the moves played (`position fen <start> moves …`) so its repetition
 * detection and hash state match the real game; otherwise a bare FEN.
 */
export function buildPositionCommand(
  fen: string,
  history?: { startFen: string; movesUci: string[] },
): string {
  if (history && history.movesUci.length > 0) {
    return `position fen ${history.startFen} moves ${history.movesUci.join(' ')}`;
  }
  return `position fen ${fen}`;
}

export function parseBestMove(line: string): { best: string; ponder?: string } | null {
  if (!line.startsWith('bestmove')) return null;
  const parts = line.split(/\s+/);
  const best = parts[1];
  if (!best) return null;
  const ponder = parts[2] === 'ponder' ? parts[3] : undefined;
  return { best, ponder };
}

export function parseEngineName(line: string): string | null {
  if (!line.startsWith('id name ')) return null;
  return line.slice('id name '.length).trim();
}

/** Merge an info update into a lines array (keyed by multipv), keeping the deepest data. */
export function mergeInfoLine(lines: EngineLine[], info: InfoUpdate): EngineLine[] {
  const next = lines.slice();
  const idx = next.findIndex((l) => l.multipv === info.multipv);
  const entry: EngineLine = {
    multipv: info.multipv,
    depth: info.depth,
    scoreCp: info.scoreCp,
    scoreMate: info.scoreMate,
    wdl: info.wdl,
    pv: info.pv,
    nodes: info.nodes,
    nps: info.nps,
    seldepth: info.seldepth,
  };
  if (idx >= 0) next[idx] = entry;
  else next.push(entry);
  next.sort((a, b) => a.multipv - b.multipv);
  return next;
}
