import { useCallback, useEffect, useRef, useState } from 'react';
import type { App, AppSummary, DeviceId, Slide } from './shared/types';
import { applyPreset, deepMerge } from './shared/presets';
import { DEVICES } from './shared/devices';
import { api, CLIENT_ID } from './api';
import { AppRail } from './components/AppRail';
import { Topbar } from './components/Topbar';
import { Pasteboard } from './components/Pasteboard';
import { Inspector, type InspectorTab } from './components/Inspector';
import { ExportDialog } from './components/ExportDialog';
import { Welcome } from './components/Welcome';

export interface EditorActions {
  patchApp: (patch: unknown) => void;
  patchSlide: (slideId: string, patch: unknown) => void;
  addSlide: (partial?: Partial<Slide>, index?: number) => Promise<void>;
  duplicateSlide: (slideId: string) => Promise<void>;
  deleteSlide: (slideId: string) => Promise<void>;
  ingest: (files: File[]) => Promise<void>;
  setShot: (slideId: string, files: File[]) => Promise<void>;
  setIcon: (file: File) => Promise<void>;
  uploadBackground: (file: File) => Promise<string | undefined>;
  reorder: (order: string[]) => Promise<void>;
  notify: (msg: string) => void;
}

const readParams = () => {
  const p = new URLSearchParams(location.search);
  return { app: p.get('app'), device: p.get('device') as DeviceId | null };
};

export function Editor() {
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appId, setAppId] = useState<string | null>(() => readParams().app ?? localStorage.getItem('appshot.app'));
  const [app, setApp] = useState<App | null>(null);
  const [device, setDevice] = useState<DeviceId>(() => readParams().device ?? 'iphone');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>('slide');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('appshot.zoom')) || 520);

  const pending = useRef(new Map<string, unknown>());
  const flushTimer = useRef<number | undefined>(undefined);
  const appIdRef = useRef(appId);
  appIdRef.current = appId;

  const notify = useCallback((msg: string) => setToast({ msg, key: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshApps = useCallback(() => api.listApps().then(setApps).catch(() => setApps([])), []);
  const refreshApp = useCallback(async () => {
    const id = appIdRef.current;
    if (!id) return setApp(null);
    try {
      setApp(await api.getApp(id));
    } catch {
      setApp(null);
      setAppId(null);
    }
  }, []);

  useEffect(() => {
    refreshApps();
  }, [refreshApps]);

  useEffect(() => {
    if (appId) localStorage.setItem('appshot.app', appId);
    setSelected(null);
    refreshApp();
  }, [appId, refreshApp]);

  // Pick a sensible app when none is chosen yet.
  useEffect(() => {
    if (apps && apps.length && (!appId || !apps.some((a) => a.id === appId))) setAppId(apps[0].id);
  }, [apps, appId]);

  useEffect(() => {
    const url = new URL(location.href);
    if (appId) url.searchParams.set('app', appId);
    url.searchParams.set('device', device);
    history.replaceState(null, '', url);
  }, [appId, device]);

  useEffect(() => {
    if (app && !app.devices.includes(device)) setDevice(app.devices[0] ?? 'iphone');
  }, [app, device]);

  useEffect(() => localStorage.setItem('appshot.zoom', String(zoom)), [zoom]);

  // Live updates from the CLI / API (e.g. Claude uploading screenshots).
  useEffect(() => {
    let listTimer: number | undefined;
    const es = new EventSource('/api/events');
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as { type: string; id: string; origin?: string };
      clearTimeout(listTimer);
      listTimer = window.setTimeout(refreshApps, 250);
      if (e.origin === CLIENT_ID || e.id !== appIdRef.current) return;
      if (e.type === 'deleted') return setAppId(null);
      if (pending.current.size === 0) refreshApp();
    };
    return () => es.close();
  }, [refreshApps, refreshApp]);

  const flush = useCallback(async () => {
    const id = appIdRef.current;
    const entries = [...pending.current.entries()];
    pending.current.clear();
    if (!id) return;
    for (const [key, patch] of entries) {
      try {
        if (key === '__app') {
          const saved = await api.updateApp(id, patch);
          // Adopt the server's theme so both sides agree (e.g. after a preset).
          if ((patch as { preset?: string }).preset) setApp((a) => a && { ...a, theme: saved.theme });
        } else {
          const s = await api.updateSlide(id, key, patch);
          void s;
        }
      } catch (e) {
        notify(`Couldn't save: ${(e as Error).message}`);
      }
    }
  }, [notify]);

  const queue = useCallback(
    (key: string, patch: unknown) => {
      pending.current.set(key, deepMerge(pending.current.get(key) ?? {}, patch));
      clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(flush, 350);
    },
    [flush],
  );

  useEffect(() => {
    const onUnload = () => {
      if (pending.current.size) flush();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flush]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, done?: string) => {
      try {
        await flush();
        await fn();
        await refreshApp();
        if (done) notify(done);
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [flush, refreshApp, notify],
  );

  const actions: EditorActions = {
    notify,
    patchApp: (patch) => {
      // A preset is resolved into a full theme here too, so the board updates instantly.
      const { preset, ...rest } = patch as { preset?: string };
      setApp((a) => {
        if (!a) return a;
        const next = deepMerge(a, rest);
        return preset ? { ...next, theme: applyPreset(next.theme, preset) } : next;
      });
      queue('__app', patch);
    },
    patchSlide: (slideId, patch) => {
      setApp((a) => a && { ...a, slides: a.slides.map((s) => (s.id === slideId ? deepMerge(s, patch) : s)) });
      queue(slideId, patch);
    },
    addSlide: (partial = {}, index) =>
      run(async () => {
        const s = await api.addSlide(app!.id, { ...partial, index });
        setSelected(s.id);
        setTab('slide');
      }),
    duplicateSlide: (slideId) =>
      run(async () => {
        const i = app!.slides.findIndex((s) => s.id === slideId);
        const { id: _id, ...rest } = app!.slides[i];
        const s = await api.addSlide(app!.id, { ...rest, index: i + 1 });
        setSelected(s.id);
      }, 'Slide duplicated'),
    deleteSlide: (slideId) =>
      run(async () => {
        await api.deleteSlide(app!.id, slideId);
        setSelected(null);
      }, 'Slide deleted'),
    ingest: (files) =>
      run(async () => {
        const r = await api.ingest(app!.id, files, undefined);
        const placed = r.placed.length;
        if (r.skipped.length) notify(`Added ${placed}. Skipped ${r.skipped.map((s) => `${s.name}: ${s.reason}`).join('; ')}`);
        else notify(`Added ${placed} screenshot${placed === 1 ? '' : 's'}`);
      }),
    setShot: (slideId, files) => run(() => api.setShot(app!.id, slideId, device, files[0]), 'Screenshot replaced'),
    setIcon: (file) => run(() => api.setIcon(app!.id, file), 'Icon updated'),
    uploadBackground: async (file) => {
      try {
        const [a] = await api.uploadAssets(app!.id, [file], 'background');
        await refreshApp();
        return a.id;
      } catch (e) {
        notify((e as Error).message);
      }
    },
    reorder: async (order) => {
      setApp((a) => a && { ...a, slides: order.map((id) => a.slides.find((s) => s.id === id)!).filter(Boolean) });
      await run(() => api.reorder(app!.id, order));
    },
  };

  // Paste an image to replace the selected slide's screenshot (or add a new slide).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!app) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      if (selected) actions.setShot(selected, files);
      else actions.ingest(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const createApp = async (name: string, preset: string) => {
    try {
      const a = await api.createApp({ name, preset });
      await refreshApps();
      setAppId(a.id);
      setTab('app');
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const deleteApp = async (id: string) => {
    await api.deleteApp(id);
    if (id === appId) setAppId(null);
    refreshApps();
  };

  const selectedSlide = app?.slides.find((s) => s.id === selected) ?? null;

  return (
    <div className="shell">
      <AppRail apps={apps ?? []} current={appId} onSelect={setAppId} onCreate={createApp} onDelete={deleteApp} />
      {app ? (
        <>
          <main className="workspace">
            <Topbar
              app={app}
              device={device}
              onDevice={setDevice}
              zoom={zoom}
              onZoom={setZoom}
              onExport={() => setExporting(true)}
              onToggleDevice={(d) => {
                const devices = app.devices.includes(d) ? app.devices.filter((x) => x !== d) : [...app.devices, d];
                if (!devices.length) return;
                actions.patchApp({ devices });
                if (!app.devices.includes(d)) setDevice(d);
              }}
            />
            <Pasteboard
              app={app}
              device={device}
              zoom={zoom}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                if (id) setTab('slide');
              }}
              actions={actions}
            />
          </main>
          <Inspector app={app} device={device} slide={selectedSlide} tab={tab} onTab={setTab} actions={actions} />
          {exporting && <ExportDialog app={app} device={device} onClose={() => setExporting(false)} />}
        </>
      ) : (
        <Welcome hasApps={!!apps?.length} onCreate={createApp} loading={apps === null} />
      )}
      {toast && (
        <div className="toast" role="status" key={toast.key}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export const deviceLabel = (d: DeviceId) => DEVICES[d].label;
