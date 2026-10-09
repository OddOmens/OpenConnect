import type { App, AppSummary, DeviceId, Slide } from './shared/types';

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

export const api = {
  listApps: () => req<AppSummary[]>('GET', '/api/apps'),
  getApp: (id: string) => req<App>('GET', `/api/apps/${id}`),
  createApp: (body: Partial<App> & { preset?: string }) => req<App>('POST', '/api/apps', body),
  updateApp: (id: string, patch: unknown) => req<App>('PATCH', `/api/apps/${id}`, patch),
  deleteApp: (id: string) => req<void>('DELETE', `/api/apps/${id}`),
  setIcon: (id: string, file: File) => req<App>('POST', `/api/apps/${id}/icon`, form([file], 'file')),
  uploadAssets: (id: string, files: File[], kind: 'screenshot' | 'background') =>
    req<{ id: string }[]>('POST', `/api/apps/${id}/assets?kind=${kind}`, form(files)),
  ingest: (id: string, files: File[], device?: DeviceId) =>
    req<{ placed: unknown[]; skipped: { name: string; reason: string }[] }>(
      'POST',
      `/api/apps/${id}/screenshots`,
      form(files, 'files', device ? { device } : {}),
    ),
  addSlide: (id: string, slide: Partial<Slide> & { index?: number }) => req<Slide>('POST', `/api/apps/${id}/slides`, slide),
  updateSlide: (id: string, slideId: string, patch: unknown) => req<Slide>('PATCH', `/api/apps/${id}/slides/${slideId}`, patch),
  deleteSlide: (id: string, slideId: string) => req<void>('DELETE', `/api/apps/${id}/slides/${slideId}`),
  setShot: (id: string, slideId: string, device: DeviceId, file: File) =>
    req<Slide>('PUT', `/api/apps/${id}/slides/${slideId}/shot`, form([file], 'file', { device })),
  reorder: (id: string, order: string[]) => req<App>('PUT', `/api/apps/${id}/order`, { order }),
  export: (id: string, body: { devices?: DeviceId[]; sizes?: Partial<Record<DeviceId, string[]>> }) =>
    req<{ dir: string; zipUrl: string | null; files: unknown[]; skipped: unknown[] }>('POST', `/api/apps/${id}/export`, body),
};
