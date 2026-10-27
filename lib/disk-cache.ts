// Marketing's files on disk, under <data>/cache/marketing: App Store listings, downloaded icons and
// screenshots, shrunk studio screens and rendered cards. Memory caches sit in front of these; the
// disk copies are what make a restart or a deploy start warm instead of from nothing.
//
// Everything here can be rebuilt, so every read and write fails quietly (a full or read-only disk
// only makes Marketing slower).

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { dataDir } from './db';

export type CacheKind = 'listings' | 'images' | 'shots' | 'thumbs' | 'cards';

const root = () => path.join(/*turbopackIgnore: true*/ dataDir(), 'cache', 'marketing');
const made = new Set<CacheKind>();

/** A file name for any key: its hash, so URLs and long card keys are safe and short. */
const fileFor = (kind: CacheKind, key: string, ext: string) =>
  path.join(/*turbopackIgnore: true*/ root(), kind, crypto.createHash('sha1').update(key).digest('hex') + ext);

export async function readCached(kind: CacheKind, key: string, ext = ''): Promise<Buffer | null> {
  try {
    return await fs.promises.readFile(fileFor(kind, key, ext));
  } catch {
    return null;
  }
}

export function readCachedSync(kind: CacheKind, key: string, ext = ''): Buffer | null {
  try {
    return fs.readFileSync(fileFor(kind, key, ext));
  } catch {
    return null;
  }
}

/** Written to a temporary file and renamed, so a reader never sees half a file. */
export async function writeCached(kind: CacheKind, key: string, data: Buffer | string, ext = '') {
  const file = fileFor(kind, key, ext);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    if (!made.has(kind)) {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      made.add(kind);
    }
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, file);
  } catch {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

/**
 * Keeps a folder within `maxBytes`, dropping files unused for `maxAgeDays` and then the least
 * recently written. Rendered cards churn (every sync changes their key); the rest barely grows.
 */
export async function prune(kind: CacheKind, maxBytes: number, maxAgeDays: number) {
  const dir = path.join(/*turbopackIgnore: true*/ root(), kind);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const files: { file: string; size: number; at: number }[] = [];
  for (const name of names) {
    const file = path.join(/*turbopackIgnore: true*/ dir, name);
    try {
      const st = await fs.promises.stat(file);
      if (st.mtimeMs < cutoff || name.endsWith('.tmp')) await fs.promises.unlink(file);
      else files.push({ file, size: st.size, at: st.mtimeMs });
    } catch {
      // gone already
    }
  }
  let total = files.reduce((n, f) => n + f.size, 0);
  for (const f of files.sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break;
    await fs.promises.unlink(f.file).catch(() => {});
    total -= f.size;
  }
}
