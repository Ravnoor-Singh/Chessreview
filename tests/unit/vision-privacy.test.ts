/**
 * Privacy invariant (Prompt 8): screenshot recognition is fully on-device.
 * This test fails if any module under src/vision reaches for a network
 * API — fetch, XHR, WebSocket, EventSource, sendBeacon, or a Node network
 * module. The worker's postMessage transport to its own main thread is
 * not a network API and stays allowed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const VISION_DIR = path.join(process.cwd(), 'src', 'vision');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
  return out;
}

const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /EventSource/, label: 'EventSource' },
  { pattern: /sendBeacon/, label: 'sendBeacon' },
  {
    pattern: /from\s+['"](?:node:)?(?:http|https|net|dgram)['"]/,
    label: 'Node network module import',
  },
  {
    pattern: /import\s*\(\s*['"](?:node:)?(?:http|https|net)['"]/,
    label: 'dynamic network import',
  },
];

describe('vision privacy — no network surface', () => {
  it('no src/vision module references a network API', () => {
    const files = sourceFiles(VISION_DIR);
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${path.relative(process.cwd(), file)}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the only fetch in src/vision is the same-origin piece-template load in client.ts', () => {
    // client.ts loads the app's OWN bundled piece-set SVGs (static,
    // same-origin assets; it sends nothing — least of all the user's
    // image, which never enters that module's network path: recognition
    // runs in the worker on an ImageBitmap). The invariant pinned here:
    // fetch( appears nowhere else in src/vision, and in client.ts it is
    // only ever called with the pieceSrc() asset path builder.
    const fetchSites: string[] = [];
    for (const file of sourceFiles(VISION_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bfetch\s*\(\s*([A-Za-z]+)/g)) {
        fetchSites.push(`${path.relative(process.cwd(), file)} :: fetch(${match[1]}(`);
      }
    }
    expect(fetchSites).toEqual(['src/vision/client.ts :: fetch(pieceSrc(']);
  });
});
