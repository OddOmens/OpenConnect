// Helpers for a server on another machine (e.g. Docker on a Linux box, reached over the LAN, Tailscale
// or an SSH tunnel). Preview and export write files on the server; when those aren't on this disk,
// these download them here so the caller (and Claude) can open them. Shared by the CLI and MCP server.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** True when the URL points at this machine. */
export function isLocalUrl(base) {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(base).hostname);
}

let localCache;
/** Whether the server's data folder is on this disk, i.e. paths it returns can be opened here. */
export async function serverIsLocal(base) {
  if (localCache !== undefined) return localCache;
  try {
    const health = await (await fetch(`${base}/api/health`)).json();
    localCache = !!health.data && fs.existsSync(path.join(health.data, 'apps'));
  } catch {
    localCache = isLocalUrl(base);
  }
  return localCache;
}

export async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Download preview PNGs into a temp folder; returns the result with local paths. */
export async function fetchPreviews(base, appId, r) {
  // The server's preview folder names the app and, when not the defaults, the set and the language.
  const folder = r.files[0]?.url?.split('/')[2] ?? appId;
  const dir = path.join(os.tmpdir(), 'openappshot', 'previews', folder);
  fs.rmSync(dir, { recursive: true, force: true });
  const files = [];
  for (const f of r.files) {
    const local = path.join(dir, f.device, path.basename(f.url));
    await download(base + f.url, local);
    files.push({ ...f, path: local, serverPath: f.path });
  }
  return { ...r, dir, files, serverDir: r.dir };
}

/**
 * Download an export's zip into destRoot (default ~/.openappshot/exports on this machine) and unpack it
 * next to the zip. Returns the result with local paths.
 */
export async function fetchExport(base, r, destRoot) {
  if (!r.zipUrl) throw new Error(`the server wrote the export outside its exports folder (${r.zip}), so it can't be downloaded`);
  const root = destRoot ?? path.join(os.homedir(), '.openappshot', 'exports');
  const name = path.basename(r.zip, '.zip');
  const zip = await download(base + r.zipUrl, path.join(root, `${name}.zip`));
  const dir = path.join(root, name);
  let unpacked = true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'pipe' });
  } catch {
    unpacked = false;
  }
  const local = (p) => (unpacked ? path.join(dir, path.relative(r.dir, p)) : zip);
  const files = r.files.map((f) => ({ ...f, path: local(f.path) }));
  const creatives = (r.creatives ?? []).map((c) => ({ ...c, path: local(c.path) }));
  return { ...r, dir: unpacked ? dir : root, zip, files, creatives, serverDir: r.dir, serverZip: r.zip };
}
