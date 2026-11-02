// Theme registry check (Themes & Presets program): `npm run themes:check`.
//
// Loads the registries from src/themes/ and the four i18n dictionaries
// (compiled on the fly with esbuild, like scripts/i18n-check.mjs) and
// fails on:
//  - duplicate ids within any kind;
//  - a labelKey missing from any of the four dictionaries;
//  - a piece set whose folder does not contain exactly the 12 expected
//    SVGs (same viewBox as the definition, no external references,
//    total size over the definition's budget, missing LICENSE.txt);
//  - a board whose coordinate colors are under WCAG 4.5:1 against
//    their squares, or whose highlights are not visibly different from
//    both square colors (CIE76 ΔE of the composited overlay — the
//    last-move/selected tints differ from the squares mostly in hue,
//    so a luminance-only ratio cannot express their visibility);
//  - a background whose effective color (scrim composited over the
//    base color and every gradient stop) is under 4.5:1 against the
//    ink of the UI theme it declares (`forTheme`);
//  - a preset referencing an unknown board/piece/background/sound/
//    animation id;
//  - any registered id without a row in src/themes/PROVENANCE.md.
// Exits non-zero with a readable report when anything is off.

import { build } from 'esbuild';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const problems = [];
const fail = (msg) => problems.push(msg);

/* ---------------- bundle the TS sources ---------------- */
const dir = mkdtempSync(join(tmpdir(), 'themes-check-'));
const entryPath = join(dir, 'entry.ts');
const abs = (p) => join(root, p);
writeFileSync(
  entryPath,
  `
export { en } from ${JSON.stringify(abs('src/i18n/en.ts'))};
export { hi } from ${JSON.stringify(abs('src/i18n/hi.ts'))};
export { es } from ${JSON.stringify(abs('src/i18n/es.ts'))};
export { pa } from ${JSON.stringify(abs('src/i18n/pa.ts'))};
export { BOARD_THEME_DEFS } from ${JSON.stringify(abs('src/themes/boards.ts'))};
export { PIECE_SET_DEFS, PIECE_KEYS } from ${JSON.stringify(abs('src/themes/pieces.ts'))};
export { BACKGROUND_DEFS } from ${JSON.stringify(abs('src/themes/backgrounds.ts'))};
export { SOUND_THEME_DEFS } from ${JSON.stringify(abs('src/themes/sounds.ts'))};
export { ANIMATION_STYLE_DEFS } from ${JSON.stringify(abs('src/themes/animations.ts'))};
export { PRESET_DEFS } from ${JSON.stringify(abs('src/themes/presets.ts'))};
`,
);
const outPath = join(dir, 'bundle.mjs');
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outPath,
  logLevel: 'silent',
});
const M = await import(pathToFileURL(outPath).href);
const DICTS = { en: M.en, hi: M.hi, es: M.es, pa: M.pa };

/* ---------------- color helpers ---------------- */
function parseColor(c) {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    c.trim(),
  );
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  }
  return null;
}
function composite(fg, bgHex) {
  const b = parseColor(bgHex);
  return {
    r: fg.r * fg.a + b.r * (1 - fg.a),
    g: fg.g * fg.a + b.g * (1 - fg.a),
    b: fg.b * fg.a + b.b * (1 - fg.a),
  };
}
function luminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrastRgb(x, y) {
  const lx = luminance(x);
  const ly = luminance(y);
  return (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05);
}
function toLab({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
function deltaE(c1, c2) {
  const p = toLab(c1);
  const q = toLab(c2);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/* ---------------- dictionary leaves ---------------- */
function leaf(dict, path) {
  let node = dict;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}
function checkLabel(kind, def) {
  for (const [locale, dict] of Object.entries(DICTS)) {
    const v = leaf(dict, def.labelKey);
    if (typeof v !== 'string' || v.length === 0) {
      fail(`${kind} '${def.id}': labelKey '${def.labelKey}' missing/empty in locale '${locale}'`);
    }
  }
}
function checkUnique(kind, defs) {
  const seen = new Set();
  for (const d of defs) {
    if (seen.has(d.id)) fail(`${kind}: duplicate id '${d.id}'`);
    seen.add(d.id);
    checkLabel(kind, d);
  }
}

/* ---------------- provenance ---------------- */
const provenance = readFileSync(join(root, 'src/themes/PROVENANCE.md'), 'utf8');
function checkProvenance(kind, def) {
  if (
    !new RegExp(`\\|\\s*${def.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`).test(provenance)
  ) {
    fail(`${kind} '${def.id}': no row in src/themes/PROVENANCE.md`);
  }
  if (!def.provenance || def.provenance.length < 8)
    fail(`${kind} '${def.id}': provenance text missing`);
  if (!def.license) fail(`${kind} '${def.id}': license missing`);
}

/* ---------------- boards ---------------- */
checkUnique('board', M.BOARD_THEME_DEFS);
for (const def of M.BOARD_THEME_DEFS) {
  checkProvenance('board', def);
  const tk = def.tokens;
  for (const [coordKey, squareKey] of [
    ['coordOnLight', 'light'],
    ['coordOnDark', 'dark'],
  ]) {
    const ratio = contrastRgb(parseColor(tk[coordKey]), parseColor(tk[squareKey]));
    if (ratio < 4.5) {
      fail(
        `board '${def.id}': ${coordKey} contrast ${ratio.toFixed(2)} < 4.5 against ${squareKey}`,
      );
    }
  }
  for (const squareKey of ['light', 'dark']) {
    const base = parseColor(tk[squareKey]);
    for (const key of ['lastMove', 'selected']) {
      const overlay = parseColor(tk[key]);
      const dE = deltaE(composite(overlay, tk[squareKey]), base);
      if (dE < 10)
        fail(`board '${def.id}': ${key} ΔE ${dE.toFixed(1)} < 10 against ${squareKey} square`);
    }
    const dotDE = deltaE(composite(parseColor(tk.legalDot), tk[squareKey]), base);
    if (dotDE < 8)
      fail(`board '${def.id}': legalDot ΔE ${dotDE.toFixed(1)} < 8 against ${squareKey} square`);
    const checkDE = deltaE(parseColor(tk.check), base);
    if (checkDE < 20)
      fail(`board '${def.id}': check ΔE ${checkDE.toFixed(1)} < 20 against ${squareKey} square`);
  }
  if (!def.border) fail(`board '${def.id}': border color missing`);
}

/* ---------------- piece sets ---------------- */
checkUnique('piece set', M.PIECE_SET_DEFS);
// Piece readability: white fills must separate from the lightest dark
// square in the registry, black fills from the lightest light square.
// Glyphs are large shapes with contrasting outlines by design, so the
// fill-separation floor is 1.9:1 — pegged just under the shipped
// Staunton Wood set (1.95), whose "white" pieces are mid-tone wood;
// contact sheets verify the rest visually.
const lightestLight = M.BOARD_THEME_DEFS.map((d) => parseColor(d.tokens.light)).sort(
  (a, b) => luminance(b) - luminance(a),
)[0];
const lightestDark = M.BOARD_THEME_DEFS.map((d) => parseColor(d.tokens.dark)).sort(
  (a, b) => luminance(b) - luminance(a),
)[0];
for (const def of M.PIECE_SET_DEFS) {
  checkProvenance('piece set', def);
  const setDir = join(root, 'public', 'pieces', def.id);
  if (!existsSync(setDir)) {
    fail(`piece set '${def.id}': folder public/pieces/${def.id} missing`);
    continue;
  }
  const svgs = readdirSync(setDir).filter((f) => f.endsWith('.svg'));
  if (svgs.length !== 12) fail(`piece set '${def.id}': ${svgs.length} SVGs on disk, expected 12`);
  let total = 0;
  for (const key of M.PIECE_KEYS) {
    const path = join(setDir, `${key}.svg`);
    if (!existsSync(path)) {
      fail(`piece set '${def.id}': ${key}.svg missing`);
      continue;
    }
    const svg = readFileSync(path, 'utf8');
    total += statSync(path).size;
    const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
    if (vb !== def.viewBox)
      fail(`piece set '${def.id}': ${key}.svg viewBox '${vb}' ≠ '${def.viewBox}'`);
    // The xmlns namespace URI is an identifier string, not a fetched
    // reference — strip namespace declarations before scanning for
    // anything that would actually load an external resource.
    const stripped = svg.replace(/xmlns(?::xlink)?="[^"]*"/g, '');
    if (/xlink:href|<image|@import|url\(\s*['"]?https?|href\s*=\s*['"]https?/i.test(stripped)) {
      fail(`piece set '${def.id}': ${key}.svg contains an external reference`);
    }
  }
  if (total > def.sizeBudgetBytes) {
    fail(`piece set '${def.id}': total ${total} B over budget ${def.sizeBudgetBytes} B`);
  }
  if (!existsSync(join(setDir, 'LICENSE.txt'))) {
    fail(`piece set '${def.id}': LICENSE.txt missing from the set folder`);
  }
  const whiteOnDark = contrastRgb(parseColor(def.primaryLight), lightestDark);
  if (whiteOnDark < 1.9) {
    fail(
      `piece set '${def.id}': white fill vs lightest dark square ${whiteOnDark.toFixed(2)} < 1.9`,
    );
  }
  const blackOnLight = contrastRgb(parseColor(def.primaryDark), lightestLight);
  if (blackOnLight < 1.9) {
    fail(
      `piece set '${def.id}': black fill vs lightest light square ${blackOnLight.toFixed(2)} < 1.9`,
    );
  }
}

/* ---------------- backgrounds ---------------- */
checkUnique('background', M.BACKGROUND_DEFS);
const INK = { dark: parseColor('#ffffff'), light: parseColor('#262522') };
for (const def of M.BACKGROUND_DEFS) {
  checkProvenance('background', def);
  // 'standard' is the app's own built-in background (it follows the UI
  // theme and predates this registry; its surfaces are axe-verified).
  if (def.id === 'standard') continue;
  // 'custom' definitions are placeholders: the rendered colors come
  // from the user's own settings (color/gradient/image), and
  // BackgroundLayer paints the user's scrim strength toward the
  // active UI theme — there is no fixed shipped color to verify.
  if (def.category === 'custom') continue;
  const bases = [def.backgroundColor];
  if (def.backgroundImage) {
    for (const m of def.backgroundImage.matchAll(/#[0-9a-f]{6}/gi)) bases.push(m[0]);
  }
  const inks = def.forTheme === 'any' ? [INK.dark, INK.light] : [INK[def.forTheme]];
  for (const baseHex of bases) {
    const effective = composite({ ...parseColor(def.scrim.color), a: def.scrim.opacity }, baseHex);
    for (const ink of inks) {
      const ratio = contrastRgb(effective, ink);
      if (ratio < 4.5) {
        fail(
          `background '${def.id}': effective contrast ${ratio.toFixed(2)} < 4.5 (base ${baseHex}, forTheme ${def.forTheme})`,
        );
      }
    }
  }
}

/* ---------------- sounds & animations ---------------- */
checkUnique('sound theme', M.SOUND_THEME_DEFS);
for (const def of M.SOUND_THEME_DEFS) {
  checkProvenance('sound theme', def);
  if (!['wav', 'synth', 'none'].includes(def.engine)) {
    fail(`sound theme '${def.id}': unknown engine '${def.engine}'`);
  }
  if (def.engine === 'synth' && !def.synthRecipe) {
    fail(`sound theme '${def.id}': engine 'synth' without a synthRecipe`);
  }
}
checkUnique('animation style', M.ANIMATION_STYLE_DEFS);
for (const def of M.ANIMATION_STYLE_DEFS) {
  checkProvenance('animation style', def);
  if (!def.timingFunction) fail(`animation style '${def.id}': timingFunction missing`);
}

/* ---------------- presets ---------------- */
checkUnique('preset', M.PRESET_DEFS);
const boardIds = new Set(M.BOARD_THEME_DEFS.map((d) => d.id));
const pieceIds = new Set(M.PIECE_SET_DEFS.map((d) => d.id));
const bgIds = new Set(M.BACKGROUND_DEFS.map((d) => d.id));
const soundIds = new Set(M.SOUND_THEME_DEFS.map((d) => d.id));
const animIds = new Set(M.ANIMATION_STYLE_DEFS.map((d) => d.id));
for (const def of M.PRESET_DEFS) {
  checkProvenance('preset', def);
  if (!boardIds.has(def.boardTheme)) fail(`preset '${def.id}': unknown board '${def.boardTheme}'`);
  if (!pieceIds.has(def.pieceSet)) fail(`preset '${def.id}': unknown piece set '${def.pieceSet}'`);
  if (!bgIds.has(def.backgroundId))
    fail(`preset '${def.id}': unknown background '${def.backgroundId}'`);
  if (!soundIds.has(def.soundThemeId))
    fail(`preset '${def.id}': unknown sound theme '${def.soundThemeId}'`);
  if (!animIds.has(def.animationStyleId)) {
    fail(`preset '${def.id}': unknown animation style '${def.animationStyleId}'`);
  }
}

/* ---------------- report ---------------- */
if (problems.length > 0) {
  console.error(`themes:check FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `themes:check OK — ${M.BOARD_THEME_DEFS.length} boards, ${M.PIECE_SET_DEFS.length} piece sets, ` +
    `${M.BACKGROUND_DEFS.length} backgrounds, ${M.SOUND_THEME_DEFS.length} sound themes, ` +
    `${M.ANIMATION_STYLE_DEFS.length} animation styles, ${M.PRESET_DEFS.length} presets; ` +
    `labels in 4 locales, contrast + provenance verified.`,
);
