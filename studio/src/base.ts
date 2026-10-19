/**
 * Where this studio is served. Inside OpenConnect the editor is a Next.js page at /studio; the render
 * pages (and the standalone editor) are built by Vite, which sets __STUDIO_BASE__ from BASE_PATH
 * ("" when the studio runs on its own). Every URL the browser asks for goes through `at()`.
 * Not import.meta.env: Next.js defines BASE_URL there too ("/"), which would drop the /studio prefix.
 */
declare const __STUDIO_BASE__: string | undefined;
export const BASE = typeof __STUDIO_BASE__ === 'string' ? __STUDIO_BASE__ : '/studio';
export const at = (path: string) => BASE + path;
