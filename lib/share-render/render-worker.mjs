// Draws one marketing card per message, off the main thread: satori lays out the element tree
// (plain objects, made by pool.ts), resvg rasterises it. Plain JS, loaded by path at runtime, so
// it's never bundled; satori and resvg come from node_modules (both are serverExternalPackages).

import { parentPort, workerData } from 'node:worker_threads';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const fonts = workerData.fonts.map((f) => ({ ...f, data: Buffer.from(f.data) }));

parentPort.on('message', async ({ id, node, width, height, scale }) => {
  try {
    const svg = await satori(node, { width, height, fonts });
    const png = new Resvg(svg, { fitTo: scale === 1 ? { mode: 'original' } : { mode: 'zoom', value: scale } }).render().asPng();
    const out = new Uint8Array(png);
    parentPort.postMessage({ id, png: out }, [out.buffer]);
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.stack || err) });
  }
});
