// Fixture snapshot generation (Prompt 4).
//
//   node scripts/make-fixtures.mjs [--force] [--depth 18] [gameId ...]
//
// Runs the REAL stockfish package (single-thread build, same as
// scripts/bench.mjs) in Node at the requested depth (default 18),
// MultiPV 3, over every position of every PGN in tests/fixtures/games/
// and writes a deterministic JSON snapshot next to each PGN:
// <gameId>.json with, per position, the FEN, the move that led there
// (san/uci/from/to/captured), the legal move count and the engine's
// top-3 lines. Unit tests consume the snapshots WITHOUT a live engine
// (tests/unit/fixtures-golden.test.ts, fixtures-property.test.ts).
//
// Resumable / per-game: a game whose snapshot already exists with the
// same depth and a complete position list is skipped unless --force is
// passed, so re-running never restarts finished games. Parallelize by
// launching several processes with disjoint game-id lists, e.g.:
//
//   node scripts/make-fixtures.mjs opera-1858 immortal-1851 &
//   node scripts/make-fixtures.mjs evergreen-1852 byrne-fischer-1956 &
//   wait
//
// Terminal positions (mate/stalemate/draw) are recorded with no lines —
// the analyzer assigns them exact scores without an engine search, and
// the fixture tests mirror that.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const Stockfish = require('stockfish');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = join(root, 'tests', 'fixtures', 'games');
const MULTI_PV = 3;
const SEARCH_WATCHDOG_MS = 180_000;

function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' depth ') || line.includes(' string'))
    return null;
  const tokens = line.split(/\s+/);
  const out = { pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') out.depth = Number(tokens[++i]);
    else if (t === 'multipv') out.multipv = Number(tokens[++i]);
    else if (t === 'score') {
      const kind = tokens[++i];
      const val = Number(tokens[++i]);
      if (kind === 'cp') out.scoreCp = val;
      else if (kind === 'mate') out.scoreMate = val;
    } else if (t === 'pv') {
      out.pv = tokens.slice(i + 1);
      break;
    }
  }
  if (out.depth === undefined || out.multipv === undefined) return null;
  if (out.scoreCp === undefined && out.scoreMate === undefined) return null;
  return out;
}

class NodeEngine {
  constructor() {
    this.engine = Stockfish('single');
    this.waiters = [];
    this.search = null;
    this.name = 'Stockfish';
    this.engine.listener = (line) => this.onLine(line);
  }

  send(cmd) {
    this.engine.processCommand(cmd);
  }

  waitFor(predicate) {
    return new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }

  onLine(line) {
    if (typeof line !== 'string') return;
    if (line.startsWith('id name ')) this.name = line.slice('id name '.length).trim();
    this.waiters = this.waiters.filter((w) => {
      if (w.predicate(line)) {
        w.resolve(line);
        return false;
      }
      return true;
    });
    const s = this.search;
    if (!s) return;
    const info = parseInfo(line);
    if (info) {
      const prev = s.lines.get(info.multipv);
      if (!prev || info.depth >= prev.depth) s.lines.set(info.multipv, info);
      return;
    }
    if (line.startsWith('bestmove')) {
      this.search = null;
      s.resolve(s.lines);
    }
  }

  async init() {
    const uciok = this.waitFor((l) => l === 'uciok');
    this.send('uci');
    await uciok;
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 128');
    this.send(`setoption name MultiPV value ${MULTI_PV}`);
    this.send('setoption name UCI_AnalyseMode value true');
    const ready = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  async newGame() {
    this.send('ucinewgame');
    const ready = this.waitFor((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  runSearch(fen, depth) {
    return new Promise((resolve) => {
      const watchdog = setTimeout(() => {
        if (this.search) this.send('stop');
      }, SEARCH_WATCHDOG_MS);
      this.search = {
        lines: new Map(),
        resolve: (lines) => {
          clearTimeout(watchdog);
          resolve(lines);
        },
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }
}

function positionsOf(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const positions = [
    { fen: history.length > 0 ? history[0].before : chess.fen(), move: null },
    ...history.map((h) => ({
      fen: h.after,
      move: {
        san: h.san,
        uci: h.from + h.to + (h.promotion ?? ''),
        from: h.from,
        to: h.to,
        captured: h.captured ?? null,
        promotion: h.promotion ?? null,
      },
    })),
  ];
  return positions.map((p, ply) => {
    const c = new Chess(p.fen);
    const terminal =
      c.isCheckmate() ||
      c.isStalemate() ||
      c.isDraw() ||
      c.isThreefoldRepetition() ||
      c.isInsufficientMaterial();
    return {
      ply,
      fen: p.fen,
      move: p.move,
      legalMoveCount: terminal ? 0 : c.moves().length,
      terminal,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const depthIdx = args.indexOf('--depth');
  const depth = depthIdx >= 0 ? Number(args[depthIdx + 1]) : 18;
  const ids = args.filter((a, i) => !a.startsWith('--') && (depthIdx < 0 || i !== depthIdx + 1));
  const allIds = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.pgn'))
    .map((f) => f.replace(/\.pgn$/, ''))
    .sort();
  const todo = ids.length > 0 ? ids : allIds;

  const engine = new NodeEngine();
  await engine.init();
  console.log(`engine: ${engine.name} · depth ${depth} · MultiPV ${MULTI_PV}`);

  for (const id of todo) {
    const pgnPath = join(FIXTURE_DIR, `${id}.pgn`);
    const jsonPath = join(FIXTURE_DIR, `${id}.json`);
    const pgn = readFileSync(pgnPath, 'utf8');
    const positions = positionsOf(pgn);
    if (!force && existsSync(jsonPath)) {
      try {
        const prev = JSON.parse(readFileSync(jsonPath, 'utf8'));
        if (prev.depth === depth && prev.positions?.length === positions.length) {
          console.log(`${id}: snapshot exists (${positions.length} positions) — skipping`);
          continue;
        }
      } catch {
        // Corrupt snapshot: regenerate.
      }
    }
    const started = Date.now();
    await engine.newGame();
    const outPositions = [];
    for (const pos of positions) {
      let lines = [];
      if (!pos.terminal) {
        const byPv = await engine.runSearch(pos.fen, depth);
        lines = [...byPv.values()]
          .sort((a, b) => a.multipv - b.multipv)
          .map((l) => {
            const line = { multipv: l.multipv, depth: l.depth, pv: l.pv };
            if (l.scoreCp !== undefined) line.scoreCp = l.scoreCp;
            if (l.scoreMate !== undefined) line.scoreMate = l.scoreMate;
            return line;
          });
      }
      outPositions.push({
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move,
        legalMoveCount: pos.legalMoveCount,
        terminal: pos.terminal,
        lines,
      });
    }
    const snapshot = {
      gameId: id,
      pgnFile: `${id}.pgn`,
      engine: engine.name,
      depth,
      multiPv: MULTI_PV,
      positions: outPositions,
    };
    writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 1)}\n`);
    console.log(
      `${id}: ${outPositions.length} positions in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${jsonPath}`,
    );
  }
  engine.send('quit');
}

await main();
