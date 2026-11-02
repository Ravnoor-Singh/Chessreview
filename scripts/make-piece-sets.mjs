/**
 * Generates the four ORIGINAL piece sets for Prompt 7 (neo, staunton-wood,
 * minimal, high-contrast) into public/pieces/<set>/.
 *
 * All silhouettes are generic public-domain Staunton forms drawn from
 * scratch for this project (see LICENSES.md — CC0). Sets differ through
 * fill/gradient, stroke treatment and detail work, per the design brief.
 * cburnett is NOT generated here (it is the pre-existing third-party set).
 *
 * Run: node scripts/make-piece-sets.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pieces');

/**
 * Piece geometry, viewBox 0 0 45 45. Each piece is a list of SVG elements
 * built from a style `s`: { fill, stroke, sw, detail, detailSw }.
 * `d:` prefix = detail element (stroke only, no fill).
 */
const PIECES = {
  P: (s) => [
    `<circle cx="22.5" cy="11.5" r="5" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<path d="M17.6 18.6h9.8l.9 3.1H16.7Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M19.2 21.7h6.6l2.4 8.3H16.8Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M14.6 33h15.8l1.1 3.6H13.5Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
  ],
  N: (s) => [
    `<path d="M14 36.6v-8.1c0-4.5 2.5-7.5 5.5-10L15.8 14c-1.2-1.6-1-4 .4-5.2l2.3-2 1.3 3c2.2-3.2 6.6-4.4 10.2-2.8l-.8 4.8c1.8 2.8 2.2 6.2 1.2 9.6l-1.6 6.1 2 8.1Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<circle cx="19.6" cy="13.4" r="1.15" fill="${s.detail}"/>`,
    `<path d="M15.9 14.2l3.6 4.3" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw}" stroke-linecap="round"/>`,
    `<path d="M27.9 8.6c1.6 3.4 1.9 6.8 1 10.4" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw}" stroke-linecap="round"/>`,
  ],
  B: (s) => [
    `<circle cx="22.5" cy="5.6" r="1.9" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<path d="M22.5 7.2c4 4.4 6.5 8.6 6.5 12.6 0 4-2.9 6.9-6.5 6.9S16 23.8 16 19.8c0-4 2.5-8.2 6.5-12.6Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M19.2 15.2l6.6 6.6" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw + 0.4}" stroke-linecap="round"/>`,
    `<path d="M17.2 28.4h10.6l.9 3.1H16.3Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M14.6 33.4h15.8l1.1 3.6H13.5Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
  ],
  R: (s) => [
    `<path d="M14 8.5h4.6v3.4h3.2V8.5h3.4v3.4h3.2V8.5H31V19l-2.2 2.6V29H16.2v-7.4L14 19Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M16.4 25.3h12.2" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw}" stroke-linecap="round"/>`,
    `<path d="M14 30.6h17l1.1 4H12.9Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
  ],
  Q: (s) => [
    `<circle cx="11.5" cy="10.6" r="1.7" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<circle cx="17" cy="8.1" r="1.7" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<circle cx="22.5" cy="6.9" r="1.7" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<circle cx="28" cy="8.1" r="1.7" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<circle cx="33.5" cy="10.6" r="1.7" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`,
    `<path d="M11.5 12.7 17 19.2l3-8.2 2.5 7.6L25 11l3 8.2 5.5-6.5-1.9 13.7c-2.9 2.3-5.9 3.1-9.1 3.1s-6.2-.8-9.1-3.1Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M15.8 24.6c2.2 1.3 4.4 1.9 6.7 1.9s4.5-.6 6.7-1.9" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw}" stroke-linecap="round"/>`,
    `<path d="M14.6 32h15.8l1.1 3.6H13.5Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
  ],
  K: (s) => [
    `<path d="M21.3 3.6h2.4v2.7h2.7v2.4h-2.7v2.7h-2.4V8.7h-2.7V6.3h2.7Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M13 14.6c3-2 6-1 9.5 2 3.5-3 6.5-4 9.5-2l-1.5 11.3c-2.5 2.8-5.2 3.8-7.5 3.8s-5-1-7.5-3.8Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M17.6 21.2c1.9-1.5 3.4-.6 4.9 1 1.5-1.6 3-2.5 4.9-1" fill="none" stroke="${s.detail}" stroke-width="${s.detailSw}" stroke-linecap="round"/>`,
    `<path d="M16.6 30h11.8l.7 2.6H15.9Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
    `<path d="M14.4 34h16.2l1 3.4H13.4Z" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linejoin="round"/>`,
  ],
};

/** Extra wood-grain arcs, appended for the staunton-wood set only. */
const GRAIN = (s) => [
  `<path d="M15.5 34.8q7-2.2 14 0" fill="none" stroke="${s.detail}" stroke-width="0.7" opacity="0.45"/>`,
];

const SETS = {
  neo: {
    license: 'Original artwork for Chess Review (Prompt 7). License: CC0 1.0.',
    defs: (id) =>
      `<defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d2df"/></linearGradient><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#59636f"/><stop offset="1" stop-color="#22262d"/></linearGradient></defs>`,
    white: (id) => ({
      fill: `url(#${id}w)`,
      stroke: '#323e4d',
      sw: 1.5,
      detail: '#323e4d',
      detailSw: 1.1,
    }),
    black: (id) => ({
      fill: `url(#${id}b)`,
      stroke: '#0e1013',
      sw: 1.5,
      detail: '#d3dae3',
      detailSw: 1.1,
    }),
    extra: () => [],
  },
  'staunton-wood': {
    license: 'Original artwork for Chess Review (Prompt 7). License: CC0 1.0.',
    defs: (id) =>
      `<defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d29c"/><stop offset="1" stop-color="#bd8547"/></linearGradient><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a2662c"/><stop offset="1" stop-color="#4c2c10"/></linearGradient></defs>`,
    white: (id) => ({
      fill: `url(#${id}w)`,
      stroke: '#654321',
      sw: 1.5,
      detail: '#654321',
      detailSw: 1,
    }),
    black: (id) => ({
      fill: `url(#${id}b)`,
      stroke: '#2c1807',
      sw: 1.5,
      detail: '#eecfa0',
      detailSw: 1,
    }),
    extra: (s) => GRAIN(s),
  },
  minimal: {
    license: 'Original artwork for Chess Review (Prompt 7). License: CC0 1.0.',
    defs: () => '',
    white: () => ({
      fill: '#f7f7f4',
      stroke: '#22242a',
      sw: 1.4,
      detail: '#22242a',
      detailSw: 1.2,
    }),
    black: () => ({
      fill: '#22242a',
      stroke: '#22242a',
      sw: 1.4,
      detail: '#f7f7f4',
      detailSw: 1.2,
    }),
    extra: () => [],
  },
  'high-contrast': {
    license: 'Original artwork for Chess Review (Prompt 7). License: CC0 1.0.',
    defs: () => '',
    white: () => ({ fill: '#ffffff', stroke: '#000000', sw: 2.8, detail: '#000000', detailSw: 2 }),
    black: () => ({ fill: '#000000', stroke: '#000000', sw: 2.8, detail: '#ffffff', detailSw: 2 }),
    extra: () => [],
  },
};

for (const [setId, set] of Object.entries(SETS)) {
  const dir = join(ROOT, setId);
  mkdirSync(dir, { recursive: true });
  for (const color of ['w', 'b']) {
    for (const [letter, build] of Object.entries(PIECES)) {
      const gid = `${setId.replace(/-/g, '')}${color}`;
      const style = color === 'w' ? set.white(gid) : set.black(gid);
      // Minimal: drop purely decorative detail paths (keep bishop cut + king cross region lines are elements; keep all — they are the distinguishing details).
      const body = [...build(style), ...set.extra(style)].join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${set.defs(gid)}${body}</svg>\n`;
      writeFileSync(join(dir, `${color}${letter}.svg`), svg);
    }
  }
  writeFileSync(join(dir, 'LICENSE.txt'), `${set.license}\n`);
  console.log(`wrote ${setId}`);
}

/* ================================================================== */
/*  Stage C (Themes & Presets): generated families                     */
/*                                                                     */
/*  Nine further hand-authored base silhouettes (coordinates written   */
/*  for this script; Staunton forms are a public-domain convention,    */
/*  these paths are our own) combined with style recipes into 31       */
/*  sets. Element model: [role, kind, ...coords] with role             */
/*  'body' | 'base' | 'detail' | 'accent'. A recipe side paints:       */
/*    { body, base?, detail, accent?, stroke, strokeWidth?,            */
/*      detailMode?: 'fill'|'line', detailWidth?, gradient?: [t, b],   */
/*      pattern?: { size, shapes }, opacity?, glow?, scale? }          */
/* ================================================================== */

const C_KEYS = ['P', 'N', 'B', 'R', 'Q', 'K'];
const plinthC = (x, w) => [
  'base',
  'path',
  `M${x} 36.6 L${x + 1.6} 32.9 H${x + w - 1.6} L${x + w} 36.6 Z`,
];

const C_BASES = {
  /* ---- Staunton: classic proportions, our own curves ---- */
  staunton: {
    P: [
      ['body', 'circle', 22.5, 12.6, 4.7],
      ['body', 'path', 'M16.9 19.4 H28.1 L27 22.6 H18 Z'],
      [
        'body',
        'path',
        'M19.7 22.6 C19.7 26 17.2 27.8 15.4 29.7 L14.5 32.9 H30.5 L29.6 29.7 C27.8 27.8 25.3 26 25.3 22.6 Z',
      ],
      plinthC(12.2, 20.6),
    ],
    N: [
      [
        'body',
        'path',
        'M14.2 32.9 V30.1 C16.2 28.9 17.7 27.4 18.9 25.5 L15.3 15.9 C14.3 14.3 14.6 12.3 16 11 L18.2 8.9 L19.3 11.8 C21.2 8.5 25.1 6.9 28.8 7.8 L28.1 12.4 C30 15.2 30.6 18.6 29.9 22.1 L28.6 27.9 L29.9 32.9 Z',
      ],
      ['detail', 'circle', 19.2, 13.9, 1.05],
      ['detail', 'path', 'M26.9 9.4 C28.3 12.5 28.7 15.8 28.1 19.4'],
      ['detail', 'path', 'M15.6 16.4 L19.1 20.3'],
      plinthC(12.2, 20.6),
    ],
    B: [
      [
        'body',
        'path',
        'M22.5 5.6 C22.5 5.6 29.6 12 29.6 18.6 C29.6 22.4 27.4 24.6 25.9 26.4 L27.4 29.5 L28.3 32.9 H16.7 L17.6 29.5 L19.1 26.4 C17.6 24.6 15.4 22.4 15.4 18.6 C15.4 12 22.5 5.6 22.5 5.6 Z',
      ],
      ['detail', 'path', 'M19.9 13.4 L25.4 20.6'],
      ['body', 'circle', 22.5, 5.2, 1.7],
      ['body', 'path', 'M17.3 29.7 H27.7 L27 32.9 H18 Z'],
      plinthC(12.2, 20.6),
    ],
    R: [
      [
        'body',
        'path',
        'M15.3 8.2 H19 L19 11.6 H21.5 V8.2 H23.5 V11.6 H26 V8.2 H29.7 L28.9 17.4 H16.1 Z',
      ],
      ['body', 'path', 'M18.3 17.4 H26.7 L27.9 29.5 L28.6 32.9 H16.4 L17.1 29.5 Z'],
      ['detail', 'path', 'M17.9 21.2 H27.1'],
      plinthC(12.2, 20.6),
    ],
    Q: [
      [
        'body',
        'path',
        'M12.9 12.2 L17.4 19.6 L19.9 10.9 L22.5 18.6 L25.1 10.9 L27.6 19.6 L32.1 12.2 L30.4 27.1 C28 29.3 25.4 30.3 22.5 30.3 C19.6 30.3 17 29.3 14.6 27.1 Z',
      ],
      ['detail', 'circle', 12.9, 10.4, 1.75],
      ['detail', 'circle', 17.6, 8.6, 1.75],
      ['detail', 'circle', 22.5, 7.6, 1.75],
      ['detail', 'circle', 27.4, 8.6, 1.75],
      ['detail', 'circle', 32.1, 10.4, 1.75],
      ['detail', 'path', 'M16.9 25.2 C19.9 27 25.1 27 28.1 25.2'],
      ['body', 'path', 'M16.2 30.6 H28.8 L28.1 32.9 H16.9 Z'],
      plinthC(12.2, 20.6),
    ],
    K: [
      [
        'body',
        'path',
        'M22.5 10.6 C26.8 10.6 30.6 14.9 30.6 19.7 C30.6 23.4 28.5 25.9 26.9 27.8 L28.1 30.4 L28.8 32.9 H16.2 L16.9 30.4 L18.1 27.8 C16.5 25.9 14.4 23.4 14.4 19.7 C14.4 14.9 18.2 10.6 22.5 10.6 Z',
      ],
      ['accent', 'path', 'M22.5 3.4 V9.8 M19.6 6.2 H25.4'],
      ['detail', 'path', 'M17.9 24.9 C20.4 26.4 24.6 26.4 27.1 24.9'],
      plinthC(12.2, 20.6),
    ],
  },

  /* ---- Modern Soft: rounded, friendly ---- */
  modern: {
    P: [
      ['body', 'circle', 22.5, 13.4, 5.1],
      [
        'body',
        'path',
        'M18.9 20.1 C18.6 24.4 16.9 27.6 14.9 30.2 L14.2 32.9 H30.8 L30.1 30.2 C28.1 27.6 26.4 24.4 26.1 20.1 Z',
      ],
      plinthC(12.6, 19.8),
    ],
    N: [
      [
        'body',
        'path',
        'M15.1 32.9 C14.6 29.4 15.9 26.6 18.1 24.3 L15.6 15.7 C15 13.7 15.8 11.6 17.5 10.4 L19.6 8.9 L20.7 11.7 C22.9 8.9 26.9 7.9 30 9.3 C28.9 12.1 29.2 15.1 30.2 18.3 L30.9 32.9 Z',
      ],
      ['detail', 'circle', 19.7, 14.6, 1.15],
      plinthC(12.6, 19.8),
    ],
    B: [
      [
        'body',
        'path',
        'M22.5 6.4 C26.9 10.1 29.3 14.1 29.3 18.7 C29.3 23.1 27 26.6 24.9 29 L26.6 32.9 H18.4 L20.1 29 C18 26.6 15.7 23.1 15.7 18.7 C15.7 14.1 18.1 10.1 22.5 6.4 Z',
      ],
      ['detail', 'path', 'M20.1 14.1 L25.2 20.9'],
      ['accent', 'circle', 22.5, 8.3, 1.9],
      plinthC(12.6, 19.8),
    ],
    R: [
      ['body', 'rect', 15.1, 8.4, 14.8, 6.4, 1.6],
      ['body', 'path', 'M18.2 14.8 H26.8 L28.4 29.9 L29.1 32.9 H15.9 L16.6 29.9 Z'],
      plinthC(12.6, 19.8),
    ],
    Q: [
      [
        'body',
        'path',
        'M13.7 13.1 C15.9 15.3 17.7 17.9 19 20.9 L21.1 11.9 C21.4 10.6 23.6 10.6 23.9 11.9 L26 20.9 C27.3 17.9 29.1 15.3 31.3 13.1 C31.5 19.4 30.6 24.6 28.7 29.2 L29.4 32.9 H15.6 L16.3 29.2 C14.4 24.6 13.5 19.4 13.7 13.1 Z',
      ],
      ['accent', 'circle', 22.5, 8.3, 1.9],
      plinthC(12.6, 19.8),
    ],
    K: [
      [
        'body',
        'path',
        'M22.5 11.2 C27.3 11.2 30.9 15.2 30.9 20.2 C30.9 24.3 28.9 27.4 26.8 29.6 L27.7 32.9 H17.3 L18.2 29.6 C16.1 27.4 14.1 24.3 14.1 20.2 C14.1 15.2 17.7 11.2 22.5 11.2 Z',
      ],
      ['accent', 'path', 'M22.5 3.8 V9.4 M19.9 6.1 H25.1'],
      plinthC(12.6, 19.8),
    ],
  },

  /* ---- Figurine: fuller, sculpted forms ---- */
  figurine: {
    P: [
      ['body', 'circle', 22.5, 12.2, 4.9],
      [
        'body',
        'path',
        'M16.4 18.7 C18.2 19.6 20.2 20 22.5 20 C24.8 20 26.8 19.6 28.6 18.7 L27.4 22.9 C25.9 23.6 24.3 23.9 22.5 23.9 C20.7 23.9 19.1 23.6 17.6 22.9 Z',
      ],
      [
        'body',
        'path',
        'M19.3 23.9 C19.1 27.1 17.3 29.2 15.2 30.9 L14.4 32.9 H30.6 L29.8 30.9 C27.7 29.2 25.9 27.1 25.7 23.9 Z',
      ],
      plinthC(11.8, 21.4),
    ],
    N: [
      [
        'body',
        'path',
        'M13.8 32.9 L13.6 29.6 C15.9 28.2 17.6 26.3 18.9 23.9 L14.9 15.1 C13.9 13.2 14.4 11 16 9.7 L18.6 7.5 L19.8 10.6 C22.1 7.3 26.3 5.9 29.9 7.1 L29.1 11.9 C31 14.9 31.5 18.6 30.6 22.4 L29.2 28.1 L30.4 32.9 Z',
      ],
      ['detail', 'circle', 19, 13.2, 1.1],
      ['detail', 'path', 'M27.6 8.6 C29.2 11.9 29.6 15.4 29 19.2'],
      ['detail', 'path', 'M20.9 22.6 C19.4 25.1 17.4 27.2 14.9 28.9'],
      plinthC(11.8, 21.4),
    ],
    B: [
      [
        'body',
        'path',
        'M22.5 4.9 C23.9 7.4 26.4 9.7 28.1 12.4 C29.8 15.1 30.4 17.7 30.1 20.3 C29.8 23.3 28.2 25.6 26.4 27.4 L28 30.2 L28.9 32.9 H16.1 L17 30.2 L18.6 27.4 C16.8 25.6 15.2 23.3 14.9 20.3 C14.6 17.7 15.2 15.1 16.9 12.4 C18.6 9.7 21.1 7.4 22.5 4.9 Z',
      ],
      ['detail', 'path', 'M19.6 13.1 L25.7 21.3'],
      ['body', 'circle', 22.5, 4.6, 1.6],
      plinthC(11.8, 21.4),
    ],
    R: [
      [
        'body',
        'path',
        'M14.6 7.6 H18.6 V11 H20.9 V7.6 H24.1 V11 H26.4 V7.6 H30.4 L29.4 17.9 H15.6 Z',
      ],
      ['body', 'path', 'M17.8 17.9 H27.2 L28.6 30.1 L29.3 32.9 H15.7 L16.4 30.1 Z'],
      ['detail', 'path', 'M17.4 22.4 C20.4 23.4 24.6 23.4 27.6 22.4'],
      plinthC(11.8, 21.4),
    ],
    Q: [
      [
        'body',
        'path',
        'M12.2 11.3 L16.9 19.9 L19.4 9.7 L22.5 17.9 L25.6 9.7 L28.1 19.9 L32.8 11.3 L31.2 26.8 C28.7 29.4 25.8 30.7 22.5 30.7 C19.2 30.7 16.3 29.4 13.8 26.8 Z',
      ],
      ['detail', 'circle', 12.2, 9.5, 1.8],
      ['detail', 'circle', 17.1, 7.6, 1.8],
      ['detail', 'circle', 22.5, 6.6, 1.8],
      ['detail', 'circle', 27.9, 7.6, 1.8],
      ['detail', 'circle', 32.8, 9.5, 1.8],
      ['detail', 'path', 'M16.4 25.9 C19.9 27.7 25.1 27.7 28.6 25.9'],
      plinthC(11.8, 21.4),
    ],
    K: [
      [
        'body',
        'path',
        'M22.5 9.9 C27.4 9.9 31.4 14.4 31.4 19.8 C31.4 23.7 29.3 26.6 27.2 28.7 L28.6 31.1 L29.3 32.9 H15.7 L16.4 31.1 L17.8 28.7 C15.7 26.6 13.6 23.7 13.6 19.8 C13.6 14.4 17.6 9.9 22.5 9.9 Z',
      ],
      ['accent', 'path', 'M22.5 2.9 V9.1 M19.4 5.7 H25.6'],
      ['detail', 'path', 'M17.3 24.6 C20.1 26.3 24.9 26.3 27.7 24.6'],
      ['accent', 'circle', 22.5, 19.8, 2.2],
      plinthC(11.8, 21.4),
    ],
  },

  /* ---- Gothic: pointed arches, sharp finials ---- */
  gothic: {
    P: [
      [
        'body',
        'path',
        'M22.5 8.8 L25.9 14.8 C27 17 26.7 19 25.4 20.3 L27.2 22.4 H17.8 L19.6 20.3 C18.3 19 18 17 19.1 14.8 Z',
      ],
      [
        'body',
        'path',
        'M19.6 22.4 C19.4 26.2 17.6 28.9 15.4 30.8 L14.6 32.9 H30.4 L29.6 30.8 C27.4 28.9 25.6 26.2 25.4 22.4 Z',
      ],
      plinthC(12.2, 20.6),
    ],
    N: [
      [
        'body',
        'path',
        'M14.6 32.9 V29.9 L19.3 25.1 L15.1 15.4 L17.9 8.6 L20.3 11.3 C22.6 8.1 26.6 6.6 30.1 7.6 L29.2 12.6 C30.9 15.6 31.3 19.1 30.4 22.9 L29.3 28.4 L30.2 32.9 Z',
      ],
      ['detail', 'circle', 19.4, 13.6, 1.05],
      ['detail', 'path', 'M27.9 9.1 L28.6 19.6'],
      plinthC(12.2, 20.6),
    ],
    B: [
      [
        'body',
        'path',
        'M22.5 3.9 L29.9 16.9 C31.1 20.4 30.1 23.9 27.6 26.6 L28.9 30 L29.6 32.9 H15.4 L16.1 30 L17.4 26.6 C14.9 23.9 13.9 20.4 15.1 16.9 Z',
      ],
      ['detail', 'path', 'M19.7 13.9 L25.6 21.6'],
      plinthC(12.2, 20.6),
    ],
    R: [
      [
        'body',
        'path',
        'M14.9 7.9 L17.2 12.4 L19.6 7.9 L21.9 12.4 L24.6 7.9 L26.9 12.4 L29.3 7.9 L30.1 17.6 H14.9 Z',
      ],
      ['body', 'path', 'M18.1 17.6 H26.9 L28.1 30 L28.7 32.9 H16.3 L16.9 30 Z'],
      plinthC(12.2, 20.6),
    ],
    Q: [
      [
        'body',
        'path',
        'M11.9 9.4 L16.2 20.9 L19.9 8.7 L22.5 16.9 L25.1 8.7 L28.8 20.9 L33.1 9.4 L31.6 27.4 C28.9 29.8 25.9 30.9 22.5 30.9 C19.1 30.9 16.1 29.8 13.4 27.4 Z',
      ],
      ['accent', 'circle', 22.5, 6.2, 1.7],
      ['detail', 'path', 'M16.6 26 C19.9 27.6 25.1 27.6 28.4 26'],
      plinthC(12.2, 20.6),
    ],
    K: [
      [
        'body',
        'path',
        'M22.5 9.4 C27.9 9.4 31.9 14.1 31.9 19.9 C31.9 23.9 29.7 26.9 27.4 28.9 L28.8 31.2 L29.4 32.9 H15.6 L16.2 31.2 L17.6 28.9 C15.3 26.9 13.1 23.9 13.1 19.9 C13.1 14.1 17.1 9.4 22.5 9.4 Z',
      ],
      ['accent', 'path', 'M22.5 2.6 L24.1 5.4 L22.5 8.2 L20.9 5.4 Z'],
      ['detail', 'path', 'M17.1 24.9 C20 26.6 25 26.6 27.9 24.9'],
      plinthC(12.2, 20.6),
    ],
  },

  /* ---- Pixel: everything snaps to a 3.75-unit grid ---- */
  pixel: {
    P: [
      ['body', 'rect', 18.75, 7.5, 7.5, 3.75],
      ['body', 'rect', 15, 11.25, 15, 7.5],
      ['body', 'rect', 18.75, 18.75, 7.5, 3.75],
      ['body', 'rect', 15, 22.5, 15, 7.5],
      ['base', 'rect', 11.25, 30, 22.5, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
    N: [
      [
        'body',
        'path',
        'M11.25 33.75 V26.25 H15 V22.5 L11.25 18.75 V11.25 H15 L18.75 7.5 H30 V15 H33.75 V22.5 H30 V33.75 Z',
      ],
      ['detail', 'rect', 18.75, 15, 3.75, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
    B: [
      [
        'body',
        'path',
        'M18.75 3.75 H26.25 V7.5 H30 V18.75 H26.25 V26.25 H30 V30 H15 V26.25 H18.75 V18.75 H15 V7.5 H18.75 Z',
      ],
      ['detail', 'path', 'M18.75 15 L26.25 22.5'],
      ['base', 'rect', 11.25, 30, 22.5, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
    R: [
      ['body', 'rect', 11.25, 7.5, 7.5, 7.5],
      ['body', 'rect', 26.25, 7.5, 7.5, 7.5],
      ['body', 'rect', 11.25, 15, 22.5, 3.75],
      ['body', 'rect', 15, 18.75, 15, 11.25],
      ['base', 'rect', 11.25, 30, 22.5, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
    Q: [
      ['body', 'rect', 7.5, 7.5, 3.75, 7.5],
      ['body', 'rect', 18.75, 3.75, 7.5, 7.5],
      ['body', 'rect', 33.75, 7.5, 3.75, 7.5],
      ['body', 'path', 'M11.25 15 H33.75 L30 26.25 H15 Z'],
      ['detail', 'rect', 15, 18.75, 3.75, 3.75],
      ['detail', 'rect', 26.25, 18.75, 3.75, 3.75],
      ['base', 'rect', 11.25, 30, 22.5, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
    K: [
      ['accent', 'rect', 18.75, 3.75, 7.5, 3.75],
      ['accent', 'rect', 15, 7.5, 15, 3.75],
      ['body', 'path', 'M15 15 H30 L33.75 26.25 H11.25 Z'],
      ['detail', 'rect', 15, 18.75, 3.75, 3.75],
      ['detail', 'rect', 26.25, 18.75, 3.75, 3.75],
      ['base', 'rect', 11.25, 30, 22.5, 3.75],
      ['base', 'rect', 7.5, 33.75, 30, 3.75],
    ],
  },

  /* ---- Token: a disc with a bold glyph (glyph/accent + ring roles) ---- */
  token: {
    P: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      ['accent', 'circle', 22.5, 15.8, 3.4],
      ['accent', 'path', 'M18.6 21.4 H26.4 L27.9 28.6 H17.1 Z'],
    ],
    N: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      [
        'accent',
        'path',
        'M16.8 28.8 V26.9 C18.2 26.1 19.2 25 20 23.7 L17.5 16.9 C16.8 15.8 17 14.4 18 13.6 L19.5 12.3 L20.3 14.3 C21.6 12 24.3 11 26.8 11.6 L26.3 14.8 C27.6 16.7 28 19.1 27.5 21.5 L26.6 25.5 L27.5 28.8 Z',
      ],
    ],
    B: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      [
        'accent',
        'path',
        'M22.5 11.4 C22.5 11.4 27.4 15.8 27.4 20.4 C27.4 23 26 24.6 24.9 25.8 L25.9 28.6 H19.1 L20.1 25.8 C19 24.6 17.6 23 17.6 20.4 C17.6 15.8 22.5 11.4 22.5 11.4 Z',
      ],
    ],
    R: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      [
        'accent',
        'path',
        'M16.4 13.2 H19.6 V16.2 H21.3 V13.2 H23.7 V16.2 H25.4 V13.2 H28.6 L27.9 28.6 H17.1 Z',
      ],
    ],
    Q: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      [
        'accent',
        'path',
        'M15.9 15.4 L19.3 20.9 L21.2 14.6 L22.5 19.4 L23.8 14.6 L25.7 20.9 L29.1 15.4 L28.1 25.9 C26.4 27.3 24.6 28 22.5 28 C20.4 28 18.6 27.3 16.9 25.9 Z',
      ],
    ],
    K: [
      ['base', 'circle', 22.5, 21, 16.5],
      ['ring', 'circle', 22.5, 21, 13.2],
      ['accent', 'path', 'M22.5 11.6 V19.4 M19.3 14.9 H25.7'],
      [
        'accent',
        'path',
        'M22.5 18.6 C25.4 18.6 27.8 21.3 27.8 24.2 C27.8 26.4 26.6 27.9 25.6 28.9 L26.2 28.6 H18.8 L19.4 28.9 C18.4 27.9 17.2 26.4 17.2 24.2 C17.2 21.3 19.6 18.6 22.5 18.6 Z',
      ],
    ],
  },

  /* ---- Letter: geometric block letters (glyph role = stroked paths) ---- */
  letter: {
    P: [
      ['glyph', 'path', 'M16.5 33.5 V11.5 H24.8 A6.8 6.8 0 0 1 24.8 25.1 H16.5'],
      plinthC(12.2, 20.6),
    ],
    N: [['glyph', 'path', 'M15.5 33.5 V11.5 L29.5 33.5 V11.5'], plinthC(12.2, 20.6)],
    B: [
      [
        'glyph',
        'path',
        'M16.5 11.5 V33.5 H24.3 A5.6 5.6 0 0 0 24.3 22.3 H16.5 A5.3 5.3 0 0 0 24.3 11.5 Z',
      ],
      plinthC(12.2, 20.6),
    ],
    R: [
      [
        'glyph',
        'path',
        'M16.5 33.5 V11.5 H24.8 A6.8 6.8 0 0 1 24.8 25.1 H16.5 M24.6 25.1 L30.5 33.5',
      ],
      plinthC(12.2, 20.6),
    ],
    Q: [
      ['glyph', 'circle', 22.3, 21.5, 9.3],
      ['glyph', 'path', 'M26.8 27.8 L31.8 34.5'],
      plinthC(12.2, 20.6),
    ],
    K: [['glyph', 'path', 'M16.5 11.5 V33.5 M29 11.5 L17.8 21.8 L29.8 33.5'], plinthC(12.2, 20.6)],
  },

  /* ---- Animals: front-facing abstract animal heads ---- */
  animal: {
    P: [
      ['body', 'circle', 22.5, 24.5, 8.6],
      ['body', 'circle', 22.5, 13.9, 5.2],
      ['accent', 'path', 'M19.6 15.6 H25.4 L22.5 19.6 Z'],
      ['detail', 'circle', 20.6, 12.9, 0.95],
      ['detail', 'circle', 24.4, 12.9, 0.95],
      plinthC(12.6, 19.8),
    ],
    N: [
      [
        'body',
        'path',
        'M16.9 6.9 L20.1 11.9 C18.7 15.9 17.8 19.9 18.1 23.9 L19.2 32.9 H25.8 L26.9 23.9 C27.2 19.9 26.3 15.9 24.9 11.9 L28.1 6.9 L24.4 10.4 H20.6 Z',
      ],
      ['accent', 'path', 'M20.6 10.4 H24.4 L23.6 15.9 H21.4 Z'],
      ['detail', 'circle', 20.9, 27.6, 1],
      ['detail', 'circle', 24.1, 27.6, 1],
      plinthC(12.6, 19.8),
    ],
    B: [
      [
        'body',
        'path',
        'M15.9 9.9 L18.9 6.2 L22.5 9.2 L26.1 6.2 L29.1 9.9 C31.6 14.9 31.2 23.9 28.6 29.1 C25.9 32.8 19.1 32.8 16.4 29.1 C13.8 23.9 13.4 14.9 15.9 9.9 Z',
      ],
      ['detail', 'circle', 18.9, 17.9, 2.7],
      ['detail', 'circle', 26.1, 17.9, 2.7],
      ['accent', 'path', 'M20.4 23.4 H24.6 L22.5 26.6 Z'],
      plinthC(12.6, 19.8),
    ],
    R: [
      [
        'body',
        'path',
        'M22.5 7.6 C30.1 7.6 33.2 12.6 32.6 18.9 L31.1 26.4 C29.2 24.8 27.1 24.1 25.4 24.6 L25.9 32.9 H19.1 L19.6 24.6 C17.9 24.1 15.8 24.8 13.9 26.4 L12.4 18.9 C11.8 12.6 14.9 7.6 22.5 7.6 Z',
      ],
      ['detail', 'circle', 17.9, 15.9, 1.15],
      ['detail', 'circle', 27.1, 15.9, 1.15],
      ['detail', 'path', 'M15.9 20.9 C14.9 23.4 14.9 25.9 15.9 28.4'],
      ['detail', 'path', 'M29.1 20.9 C30.1 23.4 30.1 25.9 29.1 28.4'],
      plinthC(12.6, 19.8),
    ],
    Q: [
      [
        'body',
        'path',
        'M12.9 13.9 L16.9 5.9 L21.1 11.2 H23.9 L28.1 5.9 L32.1 13.9 C33.6 21.9 29.1 30.4 22.5 30.4 C15.9 30.4 11.4 21.9 12.9 13.9 Z',
      ],
      ['detail', 'path', 'M16.2 10.9 L17.4 14.9 M28.8 10.9 L27.6 14.9'],
      ['detail', 'circle', 18.6, 19.4, 1.3],
      ['detail', 'circle', 26.4, 19.4, 1.3],
      ['accent', 'path', 'M21.2 24.9 H23.8 L22.5 27.4 Z'],
      plinthC(12.6, 19.8),
    ],
    K: [
      [
        'body',
        'path',
        'M22.5 6.4 L25.1 10.9 L30.4 9.4 L29.6 14.9 L34.4 16.9 L30.9 20.4 L33.9 24.4 L29.4 25.9 L30.4 31.4 L25.4 29.9 L22.5 34.4 L19.6 29.9 L14.6 31.4 L15.6 25.9 L11.1 24.4 L14.1 20.4 L10.6 16.9 L15.4 14.9 L14.6 9.4 L19.9 10.9 Z',
      ],
      ['detail', 'circle', 22.5, 20.4, 6.9],
      ['accent', 'circle', 19.9, 18.9, 1.05],
      ['accent', 'circle', 25.1, 18.9, 1.05],
      ['accent', 'path', 'M21.2 22.9 H23.8 L22.5 25.1 Z'],
      plinthC(12.6, 19.8),
    ],
  },
};

/* Letter Cases: uppercase glyphs for White, lowercase for Black. */
const caseBase = (y) => ['base', 'rect', 12.2, y, 20.6, 1.7];
C_BASES.cases = {
  P: {
    w: [['glyph', 'path', 'M16.5 33.5 V11.5 H24.8 A6.8 6.8 0 0 1 24.8 25.1 H16.5'], caseBase(39.4)],
    b: [
      [
        'glyph',
        'path',
        'M16.5 19.5 V38.5 M16.5 26.2 C16.5 22.2 19.2 19.9 22.4 19.9 C26.3 19.9 28.7 22.7 28.7 26.1 C28.7 29.5 26.3 32.3 22.4 32.3 C19.2 32.3 16.5 29.9 16.5 26.2',
      ],
      caseBase(39.4),
    ],
  },
  N: {
    w: [['glyph', 'path', 'M15.5 33.5 V11.5 L29.5 33.5 V11.5'], caseBase(39.4)],
    b: [
      [
        'glyph',
        'path',
        'M16 33.5 V19.5 M16 25.8 C16.8 21.7 19.8 19.4 23.1 19.6 C26.9 19.9 28.6 22.9 28.6 26.6 V33.5',
      ],
      caseBase(39.4),
    ],
  },
  B: {
    w: [
      [
        'glyph',
        'path',
        'M16.5 11.5 V33.5 H24.3 A5.6 5.6 0 0 0 24.3 22.3 H16.5 A5.3 5.3 0 0 0 24.3 11.5 Z',
      ],
      caseBase(39.4),
    ],
    b: [
      [
        'glyph',
        'path',
        'M16.5 11 V33.5 M16.5 26.9 C16.5 23.5 19.2 20.7 22.6 20.7 C26.4 20.7 28.9 23.5 28.9 26.9 C28.9 30.3 26.4 33.1 22.6 33.1 C19.2 33.1 16.5 30.4 16.5 26.9',
      ],
      caseBase(39.4),
    ],
  },
  R: {
    w: [
      [
        'glyph',
        'path',
        'M16.5 33.5 V11.5 H24.8 A6.8 6.8 0 0 1 24.8 25.1 H16.5 M24.6 25.1 L30.5 33.5',
      ],
      caseBase(39.4),
    ],
    b: [
      ['glyph', 'path', 'M16 33.5 V19.5 M16 26.2 C17 21.9 20.4 19.4 24.8 19.3 L27.6 19.4'],
      caseBase(39.4),
    ],
  },
  Q: {
    w: [
      ['glyph', 'circle', 22.3, 21.5, 9.3],
      ['glyph', 'path', 'M26.8 27.8 L31.8 34.5'],
      caseBase(39.4),
    ],
    b: [
      [
        'glyph',
        'path',
        'M28.6 19.5 V33.8 C28.6 37.2 26.7 39 23.7 39.1 M28.6 26.9 C28.6 23.5 26.1 20.7 22.7 20.7 C18.9 20.7 16.4 23.5 16.4 26.9 C16.4 30.3 18.9 33.1 22.7 33.1 C26.1 33.1 28.6 30.4 28.6 26.9',
      ],
      caseBase(39.4),
    ],
  },
  K: {
    w: [['glyph', 'path', 'M16.5 11.5 V33.5 M29 11.5 L17.8 21.8 L29.8 33.5'], caseBase(39.4)],
    b: [
      ['glyph', 'path', 'M16.5 10.5 V33.5 M27.8 20.3 L18.9 26.9 M20.4 25.2 L28.6 33.5'],
      caseBase(39.4),
    ],
  },
};

/* ------------------------- recipes ------------------------- */

const C_LICENSE =
  'Original artwork for Chess Review (Themes & Presets, Stage C). Generated by scripts/make-piece-sets.mjs from hand-authored base silhouettes drawn for this project. License: CC0 1.0.';

/** Compact recipe builder: sides share everything not overridden. */
const R = (base, light, dark, opts = {}) => ({ base, light, dark, ...opts });

const C_SETS = {
  staunton: R(
    'staunton',
    { body: '#f7f3e8', stroke: '#26221c', detail: '#26221c' },
    { body: '#2e2a26', stroke: '#100e0c', detail: '#e8e2d2' },
  ),
  outline: R(
    'staunton',
    { body: 'rgba(255,255,255,0.32)', stroke: '#191919', detail: '#191919', strokeWidth: 1.9 },
    { body: 'rgba(15,15,20,0.48)', stroke: '#f2f2f2', detail: '#f2f2f2', strokeWidth: 1.9 },
  ),
  glass: R(
    'staunton',
    { gradient: ['#eaf6ff', '#bcd9ef'], stroke: '#33506b', detail: '#33506b' },
    { gradient: ['#7fb2d9', '#3d6a94'], stroke: '#12283d', detail: '#dceefb' },
    { opacity: 0.94 },
  ),
  marble: R(
    'staunton',
    { gradient: ['#fdfdfd', '#d7d9de'], stroke: '#555a63', detail: '#555a63' },
    { gradient: ['#5a5e66', '#26282e'], stroke: '#101114', detail: '#cfd3da' },
  ),
  metal: R(
    'staunton',
    { gradient: ['#ffffff', '#aeb6bf'], stroke: '#3c434c', detail: '#3c434c' },
    { gradient: ['#8b95a1', '#333a42'], stroke: '#14181d', detail: '#d5dbe2' },
  ),
  wood: R(
    'staunton',
    { gradient: ['#fdf3d0', '#e8c078'], stroke: '#6b4420', detail: '#6b4420' },
    { gradient: ['#a06a34', '#54340f'], stroke: '#2a1705', detail: '#f0d5a0' },
  ),
  '3d-look': R(
    'staunton',
    { gradient: ['#ffffff', '#c3c9d2'], stroke: '#434a54', detail: '#434a54', strokeWidth: 1.6 },
    { gradient: ['#9aa2ae', '#363d46'], stroke: '#12151a', detail: '#e2e7ee', strokeWidth: 1.6 },
  ),
  newspaper: R(
    'staunton',
    {
      pattern: { size: 3, bg: '#f4f1e6', shapes: '<circle cx="1" cy="1" r="0.8" fill="{FG}"/>' },
      patternFg: '#26241f',
      stroke: '#26241f',
      detail: '#26241f',
    },
    {
      pattern: { size: 3, bg: '#26241f', shapes: '<circle cx="1" cy="1" r="0.8" fill="{FG}"/>' },
      patternFg: '#f4f1e6',
      stroke: '#f4f1e6',
      detail: '#f4f1e6',
    },
  ),
  symbols: R(
    'staunton',
    { body: '#f7f7f4', stroke: '#22242a', detail: '#22242a', accent: '#22242a', strokeWidth: 1.7 },
    { body: '#22242a', stroke: '#000000', detail: '#f7f7f4', accent: '#f7f7f4', strokeWidth: 1.7 },
    { hideDetails: true },
  ),
  large: R(
    'staunton',
    { body: '#ffffff', stroke: '#111318', detail: '#111318', accent: '#111318', strokeWidth: 2 },
    { body: '#111318', stroke: '#000000', detail: '#ffffff', accent: '#ffffff', strokeWidth: 2 },
    { hideDetails: true, scale: 1.13 },
  ),
  'colorblind-safe': R(
    'staunton',
    { body: '#ffffff', stroke: '#10243a', detail: '#10243a', accent: '#10243a', strokeWidth: 1.7 },
    { body: '#14232e', stroke: '#e8f2fa', detail: '#ffffff', accent: '#ffffff', strokeWidth: 1.7 },
    {
      hideDetails: true,
      patternByPiece: {
        P: { size: 4, shapes: '<circle cx="2" cy="2" r="1.05" fill="{FG}"/>' },
        N: { size: 4, shapes: '<rect x="0" y="1.3" width="4" height="1.4" fill="{FG}"/>' },
        B: { size: 4, shapes: '<path d="M0 2 H4 M2 0 V4" stroke="{FG}" stroke-width="0.9"/>' },
        R: { size: 4, shapes: '<path d="M0 0.6 H4 M0.6 0 V4" stroke="{FG}" stroke-width="0.8"/>' },
        Q: {
          size: 5,
          shapes:
            '<circle cx="2.5" cy="2.5" r="1.2" fill="none" stroke="{FG}" stroke-width="0.9"/>',
        },
        K: null,
      },
      patternFgLight: '#10243a',
      patternBgLight: '#ffffff',
      patternFgDark: '#ffffff',
      patternBgDark: '#14232e',
    },
  ),
  'modern-soft': R(
    'modern',
    { gradient: ['#ffffff', '#dfe7ee'], stroke: '#39424e', detail: '#39424e' },
    { gradient: ['#5a6673', '#2b333d'], stroke: '#141a21', detail: '#e8eef4' },
  ),
  club: R(
    'modern',
    { body: '#f3ecd9', stroke: '#2e4634', detail: '#2e4634' },
    { body: '#2e4634', stroke: '#14231a', detail: '#e9dfc2' },
  ),
  icy: R(
    'modern',
    { gradient: ['#ffffff', '#cfeef7'], stroke: '#2c5d70', detail: '#2c5d70' },
    { gradient: ['#a8d8ea', '#4a90a8'], stroke: '#17394a', detail: '#e6f7fd' },
  ),
  neon: R(
    'modern',
    { body: '#eafcff', stroke: '#00a8c0', detail: '#00808f' },
    { body: '#12121c', stroke: '#ff4fa3', detail: '#ff8ac0' },
    { glow: true },
  ),
  bubblegum: R(
    'modern',
    { gradient: ['#fff5fa', '#ffd3e8'], stroke: '#a13a72', detail: '#a13a72' },
    { gradient: ['#f78fc3', '#d14b8d'], stroke: '#571233', detail: '#ffd7ea' },
  ),
  space: R(
    'modern',
    { body: '#eef1f6', stroke: '#232838', detail: '#232838', accent: '#b8860b' },
    { body: '#232838', stroke: '#0b0d14', detail: '#ffd166', accent: '#ffd166' },
  ),
  figurine: R(
    'figurine',
    { body: '#f6efe0', stroke: '#33302a', detail: '#33302a' },
    { body: '#40382c', stroke: '#171310', detail: '#eadfc6' },
  ),
  nature: R(
    'figurine',
    { gradient: ['#f7faf0', '#d9e6bd'], stroke: '#3d5a23', detail: '#3d5a23' },
    { gradient: ['#5d8140', '#35501d'], stroke: '#1d2c10', detail: '#dcebc2' },
  ),
  lolz: R(
    'figurine',
    { body: '#fff7ed', stroke: '#7c4a03', detail: '#e2600a', accent: '#0a84e2' },
    { body: '#35322e', stroke: '#0f0e0c', detail: '#ffb020', accent: '#ff5d8f' },
  ),
  gothic: R(
    'gothic',
    { body: '#e9e7e2', stroke: '#2b2b30', detail: '#2b2b30' },
    { body: '#26262c', stroke: '#0c0c10', detail: '#c9c9d2' },
  ),
  medieval: R(
    'gothic',
    { gradient: ['#faf3e0', '#dec9a0'], stroke: '#4c4234', detail: '#4c4234' },
    { gradient: ['#5f5340', '#33291c'], stroke: '#1d1710', detail: '#d8cfc0' },
  ),
  graffiti: R(
    'gothic',
    { body: '#f5f2ea', stroke: '#22242a', detail: '#ff4fa3', accent: '#0090b8' },
    { body: '#22242a', stroke: '#0a0a0e', detail: '#ffd166', accent: '#a3e635' },
  ),
  '8bit': R(
    'pixel',
    { body: '#f8f0d8', stroke: '#2b2b30', detail: '#2b2b30', strokeWidth: 1.2 },
    { body: '#3a3f4a', stroke: '#101216', detail: '#f8f0d8', strokeWidth: 1.2 },
  ),
  arcade: R(
    'pixel',
    { body: '#ffe95c', stroke: '#23232a', detail: '#23232a', strokeWidth: 1.2 },
    { body: '#2b6fe2', stroke: '#0d1440', detail: '#ffe95c', strokeWidth: 1.2 },
  ),
  dash: R(
    'token',
    { body: '#f7f7f4', base: '#f7f7f4', stroke: '#22242a', detail: '#22242a', accent: '#22242a' },
    { body: '#22242a', base: '#22242a', stroke: '#0c0d10', detail: '#f7f7f4', accent: '#f7f7f4' },
    { accentMode: 'fill' },
  ),
  bases: R(
    'token',
    { gradient: ['#ffffff', '#d8dce2'], stroke: '#3a4048', detail: '#3a4048', accent: '#3a4048' },
    { gradient: ['#4a5058', '#22262c'], stroke: '#101216', detail: '#e8ecf2', accent: '#e8ecf2' },
    { accentMode: 'fill' },
  ),
  letters: R(
    'letter',
    { body: '#f0efe9', stroke: '#20242a', detail: '#20242a', accent: '#20242a' },
    { body: '#22242a', stroke: '#f0efe9', detail: '#f0efe9', accent: '#f0efe9' },
    { glyphWidth: 3.4 },
  ),
  cases: R(
    'cases',
    { body: '#f5f2ea', stroke: '#7a1f1f', detail: '#7a1f1f', accent: '#7a1f1f' },
    { body: '#26241f', stroke: '#f3e9d2', detail: '#f3e9d2', accent: '#f3e9d2' },
    { glyphWidth: 3.1 },
  ),
  animals: R(
    'animal',
    { body: '#f3ead8', stroke: '#4a3a22', detail: '#4a3a22', accent: '#c96a1e' },
    { body: '#5a4632', stroke: '#241a0e', detail: '#f0dfba', accent: '#e8912d' },
  ),
  tigers: R(
    'animal',
    { body: '#fdf6ec', stroke: '#3a2a18', detail: '#3a2a18', accent: '#e07b26' },
    {
      pattern: {
        size: 5,
        bg: '#e07b26',
        shapes: '<rect x="0" y="1.6" width="5" height="1.7" fill="{FG}"/>',
      },
      patternFg: '#40200a',
      stroke: '#40200a',
      detail: '#40200a',
      accent: '#40200a',
    },
  ),
};

/* ------------------------- emitter ------------------------- */

function cPaint(recipe, side, pieceLetter) {
  const paint = { ...(side === 'w' ? recipe.light : recipe.dark) };
  if (recipe.patternByPiece) {
    const p = recipe.patternByPiece[pieceLetter];
    if (p) {
      paint.pattern = {
        size: p.size,
        bg: side === 'w' ? recipe.patternBgLight : recipe.patternBgDark,
        shapes: p.shapes,
      };
      paint.patternFg = side === 'w' ? recipe.patternFgLight : recipe.patternFgDark;
    }
  }
  return paint;
}

function cElement(el, paint, recipe) {
  const [role, kind, ...a] = el;
  const sw = recipe.strokeWidth ?? 1.4;
  const bodyFill = paint.pattern ? 'url(#p)' : paint.gradient ? 'url(#g)' : paint.body;
  const strokeAttrs = `stroke="${paint.stroke}" stroke-width="${sw}" stroke-linejoin="round"`;
  if (kind === 'path') {
    const d = a[0];
    if (role === 'body') return `<path d="${d}" fill="${bodyFill}" ${strokeAttrs}/>`;
    if (role === 'base') return `<path d="${d}" fill="${paint.base ?? bodyFill}" ${strokeAttrs}/>`;
    if (role === 'accent') {
      if (recipe.accentMode === 'fill')
        return `<path d="${d}" fill="${paint.accent ?? paint.detail}" stroke="${paint.stroke}" stroke-width="1"/>`;
      return `<path d="${d}" fill="none" stroke="${paint.accent ?? paint.detail}" stroke-width="${(recipe.detailWidth ?? 1.2) + 0.6}" stroke-linecap="round"/>`;
    }
    if (role === 'glyph')
      return `<path d="${d}" fill="none" stroke="${paint.accent ?? paint.detail}" stroke-width="${recipe.glyphWidth ?? 3.2}" stroke-linecap="square"/>`;
    // detail path: a line
    return `<path d="${d}" fill="none" stroke="${paint.detail}" stroke-width="${recipe.detailWidth ?? 1.15}" stroke-linecap="round"/>`;
  }
  if (kind === 'circle') {
    const [cx, cy, r] = a;
    if (role === 'body')
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bodyFill}" ${strokeAttrs}/>`;
    if (role === 'base')
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${paint.base ?? bodyFill}" ${strokeAttrs}/>`;
    if (role === 'ring')
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${paint.detail}" stroke-width="1.3"/>`;
    if (role === 'glyph')
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${paint.accent ?? paint.detail}" stroke-width="${recipe.glyphWidth ?? 3.2}"/>`;
    if (role === 'accent')
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${paint.accent ?? paint.detail}"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${paint.detail}"/>`;
  }
  // rect
  const [x, y, w, h, rx] = a;
  const rxAttr = rx ? ` rx="${rx}"` : '';
  if (role === 'base')
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${paint.base ?? bodyFill}" ${strokeAttrs}/>`;
  if (role === 'detail')
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${paint.detail}"/>`;
  if (role === 'accent')
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${paint.accent ?? paint.detail}"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${bodyFill}" ${strokeAttrs}/>`;
}

function cDefs(paint) {
  let defs = '';
  if (paint.gradient) {
    defs += `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${paint.gradient[0]}"/><stop offset="1" stop-color="${paint.gradient[1]}"/></linearGradient></defs>`;
  }
  if (paint.pattern) {
    const shapes = paint.pattern.shapes.replaceAll('{FG}', paint.patternFg ?? '#000000');
    defs += `<defs><pattern id="p" width="${paint.pattern.size}" height="${paint.pattern.size}" patternUnits="userSpaceOnUse"><rect width="${paint.pattern.size}" height="${paint.pattern.size}" fill="${paint.pattern.bg}"/>${shapes}</pattern></defs>`;
  }
  return defs;
}

const C_FILTER_GLOW =
  '<defs><filter id="f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.15" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

const checkMode = process.argv.includes('--check');
const cSizes = {};
for (const [setId, recipe] of Object.entries(C_SETS)) {
  const base = C_BASES[recipe.base];
  if (!base) throw new Error(`unknown base ${recipe.base}`);
  const dir = join(ROOT, setId);
  if (!checkMode) mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const color of ['w', 'b']) {
    for (const letter of C_KEYS) {
      const paint = cPaint(recipe, color, letter);
      const entry = base[letter];
      let elements = Array.isArray(entry) ? entry : entry[color];
      if (recipe.base === 'letter' || recipe.base === 'cases') {
        // Letter tiles: a backing card replaces the plinth so light-ink
        // glyphs stay readable on light squares (and vice versa).
        elements = [
          ['base', 'rect', 10.8, 7.6, 23.4, 29.6, 3],
          ...elements.filter((el) => el[0] !== 'base'),
        ];
      }
      const parts = [];
      for (const el of elements) {
        const role = el[0];
        if (recipe.hideDetails && role === 'detail') continue;
        parts.push(cElement(el, paint, recipe));
      }
      let inner = parts.join('');
      const groupAttrs = [
        recipe.glow ? 'filter="url(#f)"' : '',
        recipe.opacity ? `opacity="${recipe.opacity}"` : '',
        recipe.scale
          ? `transform="translate(22.5 22.5) scale(${recipe.scale}) translate(-22.5 -22.5)"`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (groupAttrs) inner = `<g ${groupAttrs}>${inner}</g>`;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">` +
        `${cDefs(paint)}${recipe.glow ? C_FILTER_GLOW : ''}${inner}</svg>\n`;
      total += Buffer.byteLength(svg);
      const file = join(dir, `${color}${letter}.svg`);
      if (checkMode) {
        if (!existsSync(file) || readFileSync(file, 'utf8') !== svg) {
          console.error(`STALE: ${setId}/${color}${letter}.svg — rerun the generator`);
          process.exitCode = 1;
        }
      } else {
        writeFileSync(file, svg);
      }
    }
  }
  if (!checkMode) writeFileSync(join(dir, 'LICENSE.txt'), `${C_LICENSE}\n`);
  cSizes[setId] = total;
  console.log(`stage-c ${setId}: ${total} bytes`);
}
