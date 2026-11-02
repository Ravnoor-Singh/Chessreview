/**
 * Shared renderer for the screenshot-recognition fixtures (Prompt 8).
 *
 * Renders known FEN positions with the app's own piece-set SVGs (sharp
 * composites them over flat square colors) — the same glyphs the
 * recognizer's templates are built from, through an independent rendering
 * path (librsvg + JPEG/PNG encoders), so the fixture suite measures the
 * recognizer, not a copy of it.
 *
 * Colors only are borrowed from common online boards (the app's own theme
 * table in src/lib/boardThemes.ts plus lichess-style blue/grey pairs); no
 * proprietary artwork is used anywhere.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Chess } from 'chess.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIECES_DIR = path.join(ROOT, 'public', 'pieces');

export const FIXTURE_THEMES = {
  green: {
    light: '#eeeed2',
    dark: '#769656',
    coordOnLight: '#436128',
    coordOnDark: '#eeeed2',
    lastMove: 'rgba(255,255,0,0.38)',
  },
  brown: {
    light: '#f0d9b5',
    dark: '#b58863',
    coordOnLight: '#6e4520',
    coordOnDark: '#f0d9b5',
    lastMove: 'rgba(255,213,79,0.45)',
  },
  blue: {
    light: '#dee3e6',
    dark: '#8ca2ad',
    coordOnLight: '#33586e',
    coordOnDark: '#dee3e6',
    lastMove: 'rgba(255,235,59,0.42)',
  },
  grey: {
    light: '#e8e8e8',
    dark: '#8a8a8a',
    coordOnLight: '#4a4a4a',
    coordOnDark: '#e8e8e8',
    lastMove: 'rgba(255,235,59,0.42)',
  },
};

/** Eight varied, structurally legal positions (script asserts via chess.js). */
export const FIXTURE_FENS = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
  ['italian', 'r1bqk2r/pppp1ppp/2n2n2/2B1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 5'],
  ['sicilian', 'r2qkb1r/pp1bpppp/2n2n2/2pP4/2B1P3/5N2/PP3PPP/RNBQ1RK1 b kq - 0 7'],
  ['qgd-middlegame', 'r1b2rk1/pp1p1ppp/2n1pn2/q2P4/2B1P3/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9'],
  ['castling-home', 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'],
  ['pawn-endgame', '8/pp3kpp/2p5/8/3P4/8/PP2KPPP/8 w - - 0 1'],
  ['promotions', 'Q7/8/8/8/3k4/8/4q3/4K2Q w - - 0 1'],
  ['rook-endgame', '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1'],
];

for (const [name, fen] of FIXTURE_FENS) {
  try {
    new Chess(fen);
  } catch (err) {
    throw new Error(`Fixture FEN "${name}" is not structurally legal: ${err.message}`);
  }
}

const rasterCache = new Map();
export async function piecePng(set, key, size) {
  const cacheKey = `${set}/${key}/${size}`;
  if (!rasterCache.has(cacheKey)) {
    const svg = await readFile(path.join(PIECES_DIR, set, `${key}.svg`));
    rasterCache.set(cacheKey, sharp(svg).resize(size, size).png().toBuffer());
  }
  return rasterCache.get(cacheKey);
}

export function squareXY(square, board) {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49; // '1' -> 0
  const cell = board.size / 8;
  return { x: board.x + file * cell, y: board.y + (7 - rank) * cell, cell };
}

function boardSquares(fen) {
  const chess = new Chess(fen);
  const out = [];
  for (const row of chess.board()) {
    for (const sq of row)
      if (sq) out.push({ square: sq.square, piece: sq.color + sq.type.toUpperCase() });
  }
  return out;
}

/**
 * Render one board image.
 * opts: { fen, set, theme, board:{x,y,size}, canvas:{w,h,background},
 *         coords, highlights: string[], dot: string|null, ring: string|null,
 *         chrome: 'none'|'phone' }
 * Returns a sharp instance (caller chooses the encoder).
 */
export async function renderBoardImage(opts) {
  const { fen, set, board, canvas } = opts;
  const theme = FIXTURE_THEMES[opts.theme];
  const cell = board.size / 8;
  const parts = [];

  parts.push(`<rect width="${canvas.w}" height="${canvas.h}" fill="${canvas.background}"/>`);
  if (opts.chrome === 'phone') {
    // Status-bar-ish band + fake buttons: flat shapes, no text glyphs that
    // could be mistaken for board content.
    parts.push(`<rect width="${canvas.w}" height="84" fill="#111111"/>`);
    parts.push(`<rect x="36" y="30" width="110" height="24" rx="6" fill="#3a3a3a"/>`);
    parts.push(`<rect x="${canvas.w - 150}" y="30" width="90" height="24" rx="6" fill="#3a3a3a"/>`);
    const by = board.y + board.size + 70;
    parts.push(`<rect x="72" y="${by}" width="420" height="96" rx="14" fill="#2e2a26"/>`);
    parts.push(
      `<rect x="${canvas.w - 492}" y="${by}" width="420" height="96" rx="14" fill="#2e2a26"/>`,
    );
    parts.push(
      `<rect x="72" y="${by + 150}" width="${canvas.w - 144}" height="180" rx="14" fill="#241f1c"/>`,
    );
  }
  // Squares.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      parts.push(
        `<rect x="${board.x + col * cell}" y="${board.y + row * cell}" width="${cell + 1}" height="${cell + 1}" fill="${isLight ? theme.light : theme.dark}"/>`,
      );
    }
  }
  // Last-move highlights (under the pieces).
  for (const sq of opts.highlights ?? []) {
    const { x, y } = squareXY(sq, board);
    parts.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${theme.lastMove}"/>`,
    );
  }
  // Legal-move dot on an empty square (under nothing — the square is empty).
  if (opts.dot) {
    const { x, y } = squareXY(opts.dot, board);
    parts.push(
      `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.115}" fill="rgba(20,20,20,0.22)"/>`,
    );
  }
  // Coordinate labels, lichess-style: rank numbers top-left of the a-file,
  // file letters bottom-right of rank 1, colored for the square's parity.
  if (opts.coords) {
    const fontSize = Math.max(10, cell * 0.18);
    for (let row = 0; row < 8; row++) {
      const isLight = row % 2 === 0; // a-file square of this row: (row+0) parity
      const fill = isLight ? theme.coordOnLight : theme.coordOnDark;
      parts.push(
        `<text x="${board.x + cell * 0.05}" y="${board.y + row * cell + fontSize * 1.05}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${fill}">${8 - row}</text>`,
      );
    }
    for (let col = 0; col < 8; col++) {
      const isLight = (7 + col) % 2 === 0; // rank-1 square of this file
      const fill = isLight ? theme.coordOnLight : theme.coordOnDark;
      parts.push(
        `<text x="${board.x + col * cell + cell - fontSize * 0.72}" y="${board.y + 8 * cell - cell * 0.05}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${fill}">${'abcdefgh'[col]}</text>`,
      );
    }
  }

  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}">${parts.join('')}</svg>`;
  const composites = [];
  for (const { square, piece } of boardSquares(fen)) {
    const { x, y } = squareXY(square, board);
    composites.push({
      input: await piecePng(set, piece, Math.round(cell)),
      left: Math.round(x),
      top: Math.round(y),
    });
  }
  let image = sharp(Buffer.from(baseSvg)).composite(composites);

  // Capture ring overlays the piece's edge, as on real boards.
  if (opts.ring) {
    const { x, y } = squareXY(opts.ring, board);
    const ringSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}">` +
      `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.44}" fill="none" stroke="rgba(20,20,20,0.24)" stroke-width="${cell * 0.075}"/></svg>`;
    const withRing = await image.png().toBuffer();
    image = sharp(withRing).composite([{ input: Buffer.from(ringSvg), left: 0, top: 0 }]);
  }
  return image;
}

/** Pick decoration squares from the position itself (dot must be empty, ring occupied). */
export function decorationsFor(fen) {
  const occupied = boardSquares(fen).map((s) => s.square);
  const centerPreference = ['e4', 'd4', 'e5', 'd5', 'c4', 'f4', 'c5', 'f5', 'e3', 'd3'];
  const dot = centerPreference.find((sq) => !occupied.includes(sq)) ?? 'a3';
  const ring =
    occupied.find((sq) => !sq.endsWith('K') && sq !== 'e1' && sq !== 'e8') ?? occupied[0];
  const other = occupied.find((sq) => sq !== ring) ?? ring;
  return { dot, ring, highlights: [ring, other] };
}
