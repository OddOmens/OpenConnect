import type { App, AppSummary, CreativeId, DeviceId, ScreenshotSet, Slide } from './shared/types';
import { PRIMARY_SET } from './shared/sets';

/** Identifies this tab so it can ignore its own change events. */
export const CLIENT_ID = Math.random().toString(36).slice(2);

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'x-client-id': CLIENT_ID } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const form = (files: File[], field = 'files', extra: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  for (const f of files) fd.append(field, f, f.name);
  return fd;
};

/** ?set= for a non-primary screenshot set. */
const q = (set?: string, first = true) => (set && set !== PRIMARY_SET ? `${first ? '?' : '&'}set=${encodeURIComponent(set)}` : '');
/** ?set= and ?lang= (a translation language, for screenshots taken in that language). */
const ql = (set?: string, lang?: string | null) => q(set) + (lang ? `${q(set) ? '&' : '?'}lang=${encodeURIComponent(lang)}` : '');

export const api = {
  listApps: () => req<AppSummary[]>('GET', '/api/apps'),
  /** The whole app: primary set plus `sets`. */
  getApp: (id: string) => req<App>('GET', `/api/apps/${id}`),
  createApp: (body: Partial<App> & { preset?: string }) => req<App>('POST', '/api/apps', body),
  updateApp: (id: string, patch: unknown, set?: string) => req<App>('PATCH', `/api/apps/${id}${q(set)}`, patch),
  deleteApp: (id: string) => req<void>('DELETE', `/api/apps/${id}`),
  setIcon: (id: string, file: File) => req<App>('POST', `/api/apps/${id}/icon`, form([file], 'file')),
  uploadAssets: (id: string, files: File[], kind: 'screenshot' | 'background') =>
    req<{ id: string }[]>('POST', `/api/apps/${id}/assets?kind=${kind}`, form(files)),
  ingest: (id: string, files: File[], device?: DeviceId, set?: string, lang?: string | null) =>
    req<{ placed: unknown[]; skipped: { name: string; reason: string }[] }>(
      'POST',
      `/api/apps/${id}/screenshots${ql(set, lang)}`,
      form(files, 'files', device ? { device } : {}),
    ),
  addSlide: (id: string, slide: Partial<Slide> & { index?: number }, set?: string) => req<Slide>('POST', `/api/apps/${id}/slides${q(set)}`, slide),
  updateSlide: (id: string, slideId: string, patch: unknown, set?: string) => req<Slide>('PATCH', `/api/apps/${id}/slides/${slideId}${q(set)}`, patch),
  deleteSlide: (id: string, slideId: string, set?: string) => req<void>('DELETE', `/api/apps/${id}/slides/${slideId}${q(set)}`),
  setShot: (id: string, slideId: string, device: DeviceId, file: File, set?: string, lang?: string | null) =>
    req<Slide>('PUT', `/api/apps/${id}/slides/${slideId}/shot${ql(set, lang)}`, form([file], 'file', { device })),
  reorder: (id: string, order: string[], set?: string) => req<App>('PUT', `/api/apps/${id}/order${q(set)}`, { order }),
  export: (id: string, body: { devices?: DeviceId[]; sizes?: Partial<Record<DeviceId, string[]>>; creatives?: CreativeId[]; languages?: string[] }, set?: string) =>
    req<{ dir: string; zipUrl: string | null; files: unknown[]; skipped: unknown[]; creatives: unknown[]; untranslated: { language: string; position: number }[] }>(
      'POST',
      `/api/apps/${id}/export${q(set)}`,
      body,
    ),
  // screenshot sets
  createSet: (id: string, body: { name?: string; from?: string; blank?: boolean }) => req<ScreenshotSet>('POST', `/api/apps/${id}/sets`, body),
  renameSet: (id: string, set: string, name: string) => req<unknown>('PATCH', `/api/apps/${id}/sets/${encodeURIComponent(set)}`, { name }),
  deleteSet: (id: string, set: string) => req<unknown>('DELETE', `/api/apps/${id}/sets/${encodeURIComponent(set)}`),
  makePrimary: (id: string, set: string) => req<unknown>('POST', `/api/apps/${id}/sets/${encodeURIComponent(set)}/primary`),
};
