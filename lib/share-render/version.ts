import * as fs from 'fs';
import * as path from 'path';

// Part of every card's cache key, ETag and URL version: the build, so a new deploy never serves
// (or lets a browser keep) a card drawn by older code. Falls back to the start time in dev.
export const RENDER_VERSION = (() => {
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return `dev-${Date.now()}`;
  }
})();
