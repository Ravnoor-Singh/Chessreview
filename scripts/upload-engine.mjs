// Upload the Stockfish engine payload to an S3-compatible bucket so it can
// be served from a CDN via NEXT_PUBLIC_ENGINE_BASE_URL (Round 2, Prompt 7;
// see README "Engine payload" for the full recipe).
//
//   node scripts/upload-engine.mjs [--dry-run]
//
// Configuration (environment):
//   ENGINE_CDN_S3_ENDPOINT   e.g. https://<account>.r2.cloudflarestorage.com
//                            or https://s3.<region>.amazonaws.com
//   ENGINE_CDN_BUCKET        bucket name
//   ENGINE_CDN_PREFIX        key prefix inside the bucket (default "engine")
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
//   AWS_REGION               default "us-east-1" ("auto" for Cloudflare R2)
//
// With no storage configured the script prints the exact files, content
// types and cache/CORS headers an operator must upload by hand, and exits
// successfully — it never guesses credentials. Uploads use plain HTTPS
// with AWS Signature V4 signing (node:crypto only, no new dependency).
// Files are taken from public/engine when present, else straight from the
// stockfish package (the ENGINE_BUNDLE=external flow).
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const manifestPath = join(root, 'public', 'engine', 'engine-manifest.json');
if (!existsSync(manifestPath)) {
  console.error(
    '[upload-engine] public/engine/engine-manifest.json not found — run `npm run postinstall` (or `node scripts/copy-engine.mjs`) first.',
  );
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const names = manifest.files.map((f) => f.name);
if (!names.includes('engine-manifest.json')) names.push('engine-manifest.json');

const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function sourceOf(name) {
  const local = join(root, 'public', 'engine', name);
  if (existsSync(local)) return local;
  return join(root, 'node_modules', 'stockfish', 'bin', name);
}

const files = names.map((name) => {
  const path = sourceOf(name);
  const ext = name.slice(name.lastIndexOf('.'));
  return {
    name,
    path,
    size: existsSync(path) ? readFileSync(path).length : 0,
    contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
  };
});

const endpoint = process.env.ENGINE_CDN_S3_ENDPOINT;
const bucket = process.env.ENGINE_CDN_BUCKET;
const prefix = (process.env.ENGINE_CDN_PREFIX ?? 'engine').replace(/^\/+|\/+$/g, '');
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION ?? 'us-east-1';

if (!endpoint || !bucket || !accessKey || !secretKey) {
  console.log(
    '[upload-engine] No storage configured (ENGINE_CDN_S3_ENDPOINT / ENGINE_CDN_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).',
  );
  console.log(
    'Upload these files to your CDN bucket under the "engine/" prefix with the headers below, then set',
  );
  console.log('NEXT_PUBLIC_ENGINE_BASE_URL to the public base URL that serves them:\n');
  for (const f of files) {
    console.log(
      `  ${prefix}/${f.name}  (${(f.size / 1048576).toFixed(2)} MiB, from ${f.path.replace(`${root}/`, '')})`,
    );
  }
  console.log(
    `\n  Content-Type: per file (.js → text/javascript, .wasm → application/wasm, .json → application/json)`,
  );
  console.log(`  Cache-Control: ${CACHE_CONTROL}`);
  console.log('  Access-Control-Allow-Origin: *');
  console.log('  The engine files must be served over HTTPS with those CORS headers;');
  console.log(
    '  the app verifies each .wasm against engine-manifest.json (SHA-256) before running it.',
  );
  process.exit(0);
}

const host = new URL(endpoint).host;
const basePath = new URL(endpoint).pathname.replace(/\/$/, '');

function signAndPut(file) {
  const key = `${prefix}/${file.name}`;
  const body = readFileSync(file.path);
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `${basePath}/${bucket}/${key}`
    .split('/')
    .map(encodeURIComponent)
    .join('/')
    .replace(/%252F/g, '/');
  const headers = {
    'cache-control': CACHE_CONTROL,
    'content-type': file.contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const hmac = (keyBytes, data) => createHmac('sha256', keyBytes).update(data).digest();
  const kSigning = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  if (dryRun) {
    console.log(
      `[dry-run] PUT ${endpoint}/${bucket}/${key} (${(body.length / 1048576).toFixed(2)} MiB, ${file.contentType})`,
    );
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: 'PUT',
        host,
        path: canonicalUri,
        headers: { ...headers, Authorization: authorization, 'Content-Length': body.length },
      },
      (res) => {
        let text = '';
        res.on('data', (d) => (text += d));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[upload-engine] ${key} → ${res.statusCode}`);
            resolve();
          } else {
            reject(new Error(`PUT ${key} failed: ${res.statusCode} ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

for (const file of files) {
  // Sequential: the payload is ~200 MB in total; parallel PUTs gain little
  // and sequential failures stop at the first broken file.
  await signAndPut(file);
}

// Write the manifest URL (Prompt 7): when the bucket's public base is
// known (ENGINE_CDN_PUBLIC_BASE_URL, e.g. https://cdn.example.com/engine),
// print the exact manifest URL and record it in engine-cdn-url.txt so the
// deploy step can consume it without scraping logs.
const publicBase = (process.env.ENGINE_CDN_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
if (publicBase) {
  const manifestUrl = `${publicBase}/engine-manifest.json`;
  writeFileSync(join(root, 'engine-cdn-url.txt'), `${manifestUrl}\n`);
  console.log(`\n[upload-engine] Done. Manifest URL: ${manifestUrl}`);
  console.log(`[upload-engine] Wrote engine-cdn-url.txt. Build the app with:`);
  console.log(`  NEXT_PUBLIC_ENGINE_BASE_URL=${publicBase} npm run build`);
} else {
  console.log(
    `\n[upload-engine] Done. Set NEXT_PUBLIC_ENGINE_BASE_URL to the public base that serves "${prefix}/"`,
  );
  console.log('(for example https://cdn.example.com/engine) and rebuild the app.');
  console.log(
    'Tip: set ENGINE_CDN_PUBLIC_BASE_URL next time and the exact manifest URL is printed + written to engine-cdn-url.txt.',
  );
}
