// Generate the PWA icon set (public/icons/) from the app's own artwork:
// the cburnett white knight (GFDL/BSD — see LICENSES.md) centred on the
// app background colour #262522. Run with `npm run icons`; the PNGs are
// committed, so this only needs re-running if the artwork/colour changes.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const BACKGROUND = { r: 0x26, g: 0x25, b: 0x22, alpha: 1 };
const knightSvg = readFileSync(join(root, 'public/pieces/cburnett/wN.svg'));

async function makeIcon(file, size, glyphFraction) {
  const glyph = Math.round(size * glyphFraction);
  const knight = await sharp(knightSvg, { density: 384 }).resize(glyph, glyph).png().toBuffer();
  const out = join(outDir, file);
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: knight, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  const { size: bytes } = await import('node:fs').then((fs) => fs.promises.stat(out));
  console.log(`icons: ${file} ${size}×${size} — ${bytes} bytes`);
}

await makeIcon('icon-192.png', 192, 0.82);
await makeIcon('icon-512.png', 512, 0.82);
// Maskable: full-bleed background with the glyph inside the safe zone (~80%).
await makeIcon('icon-maskable-512.png', 512, 0.6);
await makeIcon('apple-touch-icon.png', 180, 0.82);
