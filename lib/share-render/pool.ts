// Marketing cards are drawn on worker threads (render-worker.mjs), a few at once, so a page of
// cards uses every core and the server stays responsive while they draw. If the workers can't
// start (the file is missing from a build), cards are drawn here instead, one layout at a time.

import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { Fragment } from 'react';
import { renderAsync } from '@resvg/resvg-js';
import { loadFonts } from './kit';

const WORKERS = Math.max(1, Math.min(4, os.availableParallelism() - 1));
const WORKER_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), 'lib', 'share-render', 'render-worker.mjs');

interface Job {
  node: unknown;
  width: number;
  height: number;
  scale: number;
  resolve: (png: Buffer) => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
}

const g = globalThis as unknown as { __cardPool?: { slots: Slot[]; queue: Job[]; failed: boolean } };

function pool() {
  if (!g.__cardPool) g.__cardPool = { slots: [], queue: [], failed: false };
  return g.__cardPool;
}

function spawn(): Slot | null {
  const p = pool();
  let worker: Worker;
  try {
    const fonts = loadFonts().map((f) => ({ ...f, data: new Uint8Array(f.data) }));
    worker = new Worker(WORKER_FILE, { workerData: { fonts } });
  } catch (err) {
    console.error('[marketing] card workers unavailable, drawing on the main thread:', (err as Error).message);
    p.failed = true;
    return null;
  }
  // Workers never keep the process alive on their own (the HTTP server does).
  worker.unref();
  const slot: Slot = { worker, job: null };
  worker.on('message', (m: { png?: Uint8Array; error?: string }) => {
    const job = slot.job;
    slot.job = null;
    if (job) {
      if (m.png) job.resolve(Buffer.from(m.png.buffer, m.png.byteOffset, m.png.byteLength));
      else job.reject(new Error(m.error || 'Card render failed'));
    }
    next();
  });
  const lost = (err: Error) => {
    slot.job?.reject(err);
    slot.job = null;
    p.slots = p.slots.filter((s) => s !== slot);
    next();
  };
  worker.on('error', lost);
  worker.on('exit', (code) => code !== 0 && lost(new Error(`Card worker exited (${code})`)));
  p.slots.push(slot);
  return slot;
}

function next() {
  const p = pool();
  while (p.queue.length) {
    let slot = p.slots.find((s) => !s.job);
    if (!slot && p.slots.length < WORKERS && !p.failed) slot = spawn() ?? undefined;
    if (!slot) {
      if (p.failed && !p.slots.length) drainHere();
      return;
    }
    const job = p.queue.shift()!;
    slot.job = job;
    slot.worker.postMessage({ node: job.node, width: job.width, height: job.height, scale: job.scale });
  }
}

// Without workers: one layout at a time here, rasterised on resvg's own threads.
let drawingHere = false;
async function drainHere() {
  if (drawingHere) return;
  drawingHere = true;
  const p = pool();
  const satori = (await import('satori')).default;
  while (p.queue.length) {
    const job = p.queue.shift()!;
    try {
      const svg = await satori(job.node as React.ReactElement, { width: job.width, height: job.height, fonts: loadFonts() });
      const fitTo = job.scale === 1 ? { mode: 'original' as const } : { mode: 'zoom' as const, value: job.scale };
      job.resolve((await renderAsync(svg, { fitTo })).asPng());
    } catch (err) {
      job.reject(err as Error);
    }
  }
  drawingHere = false;
}

/**
 * The element tree as plain objects a worker can receive: components called (none of the card
 * templates use hooks), fragments flattened, keys dropped. satori takes these as it takes JSX.
 */
function plain(node: unknown): unknown {
  if (node == null || typeof node === 'boolean') return null;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(plain);
  const el = node as { type: unknown; props?: Record<string, unknown> };
  if (typeof el.type === 'function') return plain((el.type as (p: unknown) => unknown)(el.props ?? {}));
  if (el.type === Fragment) return plain(el.props?.children);
  const { children, ...props } = el.props ?? {};
  return { type: el.type, props: children === undefined ? props : { ...props, children: plain(children) } };
}

/** The card as PNG, `scale` times its size. */
export function drawCard(node: React.ReactNode, width: number, height: number, scale: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pool().queue.push({ node: plain(node), width, height, scale, resolve, reject });
    next();
  });
}
