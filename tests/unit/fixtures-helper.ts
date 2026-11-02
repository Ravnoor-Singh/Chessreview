import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Snapshot } from '../../scripts/calibrate-entry';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'games');

export function loadSnapshot(id: string): Snapshot {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), 'utf8')) as Snapshot;
}

export function allSnapshotIds(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}
