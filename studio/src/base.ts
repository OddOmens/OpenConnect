/**
 * Where this studio is served. Inside OpenConnect the editor is a Next.js page at /studio; the render
 * pages are built by Vite with BASE_PATH ("" when the studio runs on its own). Every URL the browser
 * asks for goes through `at()`.
 */
const viteBase = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL;
export const BASE = (viteBase ?? '/studio/').replace(/\/$/, '');
export const at = (path: string) => BASE + path;
