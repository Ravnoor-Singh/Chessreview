// Capture REAL vision fixtures from lichess.org (Round 2, Prompt 8).
//
//   node scripts/capture-lichess-fixtures.mjs
//
// Lichess is open source (AGPL-3.0); screenshots of its public analysis /
// game / puzzle pages are captured with a real Chromium for use as
// recognition test fixtures. chess.com imagery is NEVER captured (its
// assets are proprietary) — users test those locally with
// `npm run vision:eval -- <folder>` instead.
//
// Every capture's ground-truth FEN is EXTRACTED FROM THE CHESSGROUND DOM
// (piece elements' classes + transforms) after the screenshot and, for
// analysis captures, asserted equal to the intended position — a capture
// that does not match is discarded, never silently mislabeled.
//
// Network notes: this sandbox's Chromium cannot use the egress proxy
// directly, so when HTTPS_PROXY is set the script starts a tiny local
// CONNECT relay (scripts/../scratch pattern inlined here) on
// 127.0.0.1:8888 and points Chromium at it; TLS goes through the proxy's
// MITM CA, hence ignoreHTTPSErrors for this public-page capture only.
// On a normal machine with direct egress, unset the proxy env vars and
// the script connects directly.
//
// Output: PNGs + entries appended to tests/fixtures/vision/captures.json
// (merged into manifest.json by the fixture build step; provenance is
// recorded in tests/fixtures/vision/SOURCES.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect as netConnect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests', 'fixtures', 'vision');
const capturesPath = join(outDir, 'captures.json');

// --- optional local CONNECT relay (sandbox egress) --------------------------
async function ensureRelay() {
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!raw) return null;
  const upstream = new URL(raw);
  const auth = Buffer.from(
    `${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`,
  ).toString('base64');
  const server = createServer();
  server.on('connect', (req, clientSocket) => {
    const [host, portRaw] = (req.url ?? '').split(':');
    const upstreamSocket = netConnect(Number(upstream.port || 3128), upstream.hostname, () => {
      upstreamSocket.write(
        `CONNECT ${host}:${Number(portRaw || 443)} HTTP/1.1\r\nHost: ${host}:${Number(portRaw || 443)}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`,
      );
    });
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const idx = buffer.indexOf('\r\n\r\n');
      if (idx === -1) return;
      upstreamSocket.off('data', onData);
      if (!/ 200 /.test(buffer.slice(0, buffer.indexOf('\r\n')).toString('latin1'))) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        upstreamSocket.destroy();
        return;
      }
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = buffer.slice(idx + 4);
      if (rest.length) clientSocket.write(rest);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    };
    upstreamSocket.on('data', onData);
    upstreamSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstreamSocket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8888, '127.0.0.1', resolve);
  }).catch(() => null); // already running is fine
  return 'http://127.0.0.1:8888';
}

/**
 * Rotate a FEN placement 180° (piece case preserved). The fixture corpus
 * is IMAGE-oriented (the recognizer reads the board as displayed, rank 8
 * at the top; the app's UI owns any flipping). Lichess orients the
 * analysis board to the side to move, so a black-to-move FEN renders
 * flipped and its recorded ground truth must be rotated to match the
 * pixels. (This bit the kp-endgame captures in the first run.)
 */
function rot180(fen) {
  const [placement, ...rest] = fen.split(' ');
  const rows = placement.split('/').map((r) => {
    const cells = [];
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push('.');
      else cells.push(ch);
    }
    return cells;
  });
  const out = rows
    .reverse()
    .map((cells) =>
      cells
        .reverse()
        .join('')
        .replace(/\.+/g, (m) => String(m.length)),
    )
    .join('/');
  return [out, ...rest].join(' ');
}

/** Whether the board is currently rendered from Black's side. */
async function isBlackOriented(page) {
  return page.evaluate(() =>
    document.querySelector('.cg-wrap')?.classList.contains('orientation-black'),
  );
}

// --- FEN from the chessground DOM -------------------------------------------
async function fenFromDom(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.cg-wrap');
    const board = document.querySelector('cg-board');
    if (!wrap || !board) return null;
    const black = wrap.classList.contains('orientation-black');
    const size = board.getBoundingClientRect().width;
    const sq = size / 8;
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (const el of board.querySelectorAll('piece')) {
      const cls = el.className.split(/\s+/);
      const color = cls.includes('white') ? 'w' : 'b';
      const role = cls.find((c) =>
        ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].includes(c),
      );
      if (!role) continue;
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.getAttribute('style') ?? '');
      if (!m) continue;
      let file = Math.round(parseFloat(m[1]) / sq);
      let rankFromTop = Math.round(parseFloat(m[2]) / sq);
      if (black) {
        file = 7 - file;
        rankFromTop = 7 - rankFromTop;
      }
      grid[rankFromTop][file] = color === 'w' ? role.toUpperCase() : role;
    }
    const rows = grid.map((row) => {
      let out = '';
      let empty = 0;
      for (const cell of row) {
        if (!cell) {
          empty++;
          continue;
        }
        if (empty) out += String(empty);
        empty = 0;
        out += {
          PAWN: 'P',
          KNIGHT: 'N',
          BISHOP: 'B',
          ROOK: 'R',
          QUEEN: 'Q',
          KING: 'K',
          pawn: 'p',
          knight: 'n',
          bishop: 'b',
          rook: 'r',
          queen: 'q',
          king: 'k',
        }[cell];
      }
      if (empty) out += String(empty);
      return out;
    });
    return `${rows.join('/')} w - - 0 1`;
  });
}

function placementOf(fen) {
  return fen.split(' ')[0];
}

// --- capture matrix ----------------------------------------------------------
const POSITIONS = [
  ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
  ['italian', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'],
  ['sicilian', 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6'],
  ['french', 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3'],
  ['qgd', 'r1bq1rk1/pp2ppbp/2np1np1/8/3P4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 3 8'],
  ['kp-endgame', '8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 b - - 0 1'],
  ['rook-endgame', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'],
  ['queen-endgame', '8/8/4k3/8/8/3QK3/8/8 w - - 0 1'],
  ['bishops-mid', 'r2q1rk1/pp1bppbp/2np1np1/8/3NP3/2N1BP2/PPP3PP/R2QKB1R w KQ - 5 9'],
  ['sparse-kr', '8/8/8/8/8/4k3/8/4K2R w K - 0 1'],
];

const entries = existsSync(capturesPath) ? JSON.parse(readFileSync(capturesPath, 'utf8')) : [];
const done = new Set(entries.map((e) => e.file));
async function record(entry) {
  if (done.has(entry.file)) return;
  entries.push(entry);
  done.add(entry.file);
  writeFileSync(capturesPath, `${JSON.stringify(entries, null, 2)}\n`);
  console.log('captured', entry.file, entry.fen.slice(0, 40));
}

const proxyServer = await ensureRelay();
const exe =
  process.env.PLAYWRIGHT_CHROMIUM ??
  '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: exe,
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
});

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  return ctx.newPage();
}

async function openAnalysis(page, fen) {
  const url = `https://lichess.org/analysis/standard/${fen.replace(/ /g, '_')}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('cg-board piece', { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function boardBox(page) {
  return page.locator('.cg-wrap').first().boundingBox();
}

async function flip(page) {
  // The flip button sits under the board (data-icon with opposing arrows);
  // keyboard 'f' also flips on lichess board pages.
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
}

// Element capture of the board only.
async function captureAnalysis(
  name,
  fen,
  { flipBoard = false, viewport = { width: 1400, height: 1000 }, moves = [] } = {},
) {
  const file = `lichess-${name}.png`;
  if (done.has(file)) return;
  const page = await newPage(viewport);
  try {
    await openAnalysis(page, fen);
    if (flipBoard) await flip(page);
    const box = await boardBox(page);
    if (!box) throw new Error('no board box');
    if (moves.length) {
      const sq = box.width / 8;
      const center = (algebraic) => {
        const f = algebraic.charCodeAt(0) - 97;
        const r = 8 - Number(algebraic[1]);
        const ff = flipBoard ? 7 - f : f;
        const rr = flipBoard ? 7 - r : r;
        return { x: box.x + (ff + 0.5) * sq, y: box.y + (rr + 0.5) * sq };
      };
      for (const [from, to] of moves) {
        const a = center(from);
        const b = center(to);
        await page.mouse.click(a.x, a.y);
        await page.waitForTimeout(250);
        await page.mouse.click(b.x, b.y);
        await page.waitForTimeout(700);
      }
    }
    const actual = await fenFromDom(page);
    // After played moves the placement changes; only assert for static ones.
    if (!moves.length && placementOf(actual ?? '') !== placementOf(fen)) {
      console.log(`SKIP ${file}: DOM FEN mismatch (${actual} vs ${fen})`);
      return;
    }
    const gameFen = moves.length ? (actual ?? fen) : fen;
    const finalFen = (await isBlackOriented(page)) ? rot180(gameFen) : gameFen;
    await page
      .locator('.cg-wrap')
      .first()
      .screenshot({ path: join(outDir, file) });
    await record({
      file,
      kind: 'screenshot',
      fen: finalFen,
      set: 'lichess-cburnett',
      theme: 'lichess-brown',
      boardRect: { x: 0, y: 0, size: Math.round(box.width) },
      canvas: { w: Math.round(box.width), h: Math.round(box.height) },
      source: 'https://lichess.org/analysis',
    });
  } catch (e) {
    console.log(`FAIL ${file}: ${String(e).slice(0, 120)}`);
  } finally {
    await page.context().close();
  }
}

// Full-page capture (UI borders, panels, player bars around the board).
async function captureFullPage(name, fen, { flipBoard = false } = {}) {
  const file = `lichess-full-${name}.png`;
  if (done.has(file)) return;
  const page = await newPage({ width: 1400, height: 1000 });
  try {
    await openAnalysis(page, fen);
    if (flipBoard) await flip(page);
    const box = await boardBox(page);
    if (!box) throw new Error('no board box');
    const actual = await fenFromDom(page);
    if (placementOf(actual ?? '') !== placementOf(fen)) {
      console.log(`SKIP ${file}: DOM FEN mismatch`);
      return;
    }
    await page.screenshot({ path: join(outDir, file) });
    await record({
      file,
      kind: 'screenshot',
      fen: (await isBlackOriented(page)) ? rot180(fen) : fen,
      set: 'lichess-cburnett',
      theme: 'lichess-brown',
      boardRect: { x: Math.round(box.x), y: Math.round(box.y), size: Math.round(box.width) },
      canvas: { w: 1400, h: 1000 },
      source: 'https://lichess.org/analysis (full page)',
    });
  } catch (e) {
    console.log(`FAIL ${file}: ${String(e).slice(0, 120)}`);
  } finally {
    await page.context().close();
  }
}

// --- run the matrix -----------------------------------------------------------
mkdirSync(outDir, { recursive: true });
for (const [name, fen] of POSITIONS) {
  await captureAnalysis(name, fen);
}
for (const [name, fen] of POSITIONS.slice(0, 4)) {
  await captureAnalysis(`${name}-black`, fen, { flipBoard: true });
}
for (const [name, fen] of POSITIONS.slice(0, 4)) {
  await captureAnalysis(`${name}-mobile`, fen, { viewport: { width: 420, height: 860 } });
}
// Last-move highlights: play a move on the analysis board first.
await captureAnalysis('italian-highlight', POSITIONS[1][1], { moves: [['c4', 'b5']] });
await captureAnalysis('startpos-highlight', POSITIONS[0][1], {
  moves: [
    ['e2', 'e4'],
    ['e7', 'e5'],
  ],
});
for (const [name, fen] of POSITIONS.slice(0, 6)) {
  await captureFullPage(name, fen);
}
await browser.close();
console.log(`done: ${entries.length} captures recorded in captures.json`);
