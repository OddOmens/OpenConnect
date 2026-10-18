/**
 * Where this studio is served: "" on its own, "/studio" behind OpenConnect (set at build time by
 * BASE_PATH). Every URL the browser asks for goes through `at()`.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const at = (path: string) => BASE + path;
