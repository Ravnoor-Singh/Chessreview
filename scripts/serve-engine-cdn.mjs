// Minimal "CDN origin" static server for the cross-origin engine test
// (Round 2, Prompt 7). Serves public/engine under /engine/ on its own
// port — a DIFFERENT origin from the app — with exactly the headers the
// README's CDN recipe prescribes:
//   Access-Control-Allow-Origin: *
//   Cross-Origin-Resource-Policy: cross-origin
//   Cache-Control: public, max-age=31536000, immutable
//   Content-Type: application/wasm / text/javascript / application/json
// Not a production server: no range requests, no compression, one job.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(root, 'public', 'engine');
const port = Number(process.env.CDN_PORT ?? 3202);

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (!url.pathname.startsWith('/engine/')) {
    res.writeHead(404).end('not found');
    return;
  }
  const name = normalize(url.pathname.slice('/engine/'.length)).replace(/^(\.\.[/\\])+/, '');
  const ext = name.slice(name.lastIndexOf('.'));
  try {
    const body = await readFile(join(engineDir, name));
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // COEP/COOP on the script responses as well: not what unblocked the
      // cross-origin worker load (that was the page CSP — next.config.js
      // adds the configured engine origin to script-src/worker-src, see
      // tests/e2e/cdn.spec.ts), but harmless and consistent for hosts
      // that serve worker scripts to isolated pages.
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('not found');
  }
});

server.listen(port, () => {
  console.log(`[serve-engine-cdn] engine origin on http://localhost:${port}/engine/`);
});
