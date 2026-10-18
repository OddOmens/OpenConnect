import { useCallback, useEffect, useRef, useState } from 'react';
import type { App, AppSummary, CreativeId, DeviceId, Slide } from './shared/types';
import { applyPreset, deepMerge } from './shared/presets';
import { DEVICES } from './shared/devices';
import { api, CLIENT_ID } from './api';
import { AppRail } from './components/AppRail';
import { Topbar } from './components/Topbar';
import { SetsBoard } from './components/SetsBoard';
import { PRIMARY_SET, setList, setView } from './shared/sets';
import { localize, localizeAppPatch, localizeSlidePatch } from './shared/locales';
import { CreativesBoard } from './components/CreativesBoard';
import { Inspector, type InspectorTab } from './components/Inspector';
import { ExportDialog } from './components/ExportDialog';
import { Welcome } from './components/Welcome';
import { useUiScale } from './theme';

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
  const device = p.get('device');
  // device=product-page opens the Product page view (header and search results assets).
  return {
    app: p.get('app'),
    device: device === 'product-page' ? null : (device as DeviceId | null),
    productPage: device === 'product-page',
    set: p.get('set') ?? PRIMARY_SET,
    lang: p.get('lang'),
  };
};

export function Editor() {
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appId, setAppId] = useState<string | null>(() => readParams().app ?? localStorage.getItem('appshot.app'));
  const [app, setApp] = useState<App | null>(null);
  const [device, setDevice] = useState<DeviceId>(() => readParams().device ?? 'iphone');
  const [selected, setSelected] = useState<string | null>(null);
  const [productPage, setProductPage] = useState(() => readParams().productPage);
  const [creative, setCreative] = useState<CreativeId | null>(null);
  // The screenshot set being edited; Slide and Style tabs work on it.
  const [activeSet, setActiveSet] = useState<string>(() => readParams().set);
  // The translation language being edited; null is the base language the slides are written in.
  const [lang, setLang] = useState<string | null>(() => readParams().lang);
  const [tab, setTab] = useState<InspectorTab>('slide');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('appshot.zoom')) || 520);
  const ui = useUiScale();
  // Canvas frames scale with the interface size too, so 100% zoom looks the same on any display.
  const canvasZoom = Math.round(zoom * ui[2]);
  // Floating side panels; ⌘/Ctrl + \ hides or shows both, like a design tool's "show UI".
  const [panels, setPanels] = useState<{ left: boolean; right: boolean }>(() => {
    try {
      return { left: true, right: true, ...JSON.parse(localStorage.getItem('appshot.panels') ?? '{}') };
    } catch {
      return { left: true, right: true };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('appshot.panels', JSON.stringify(panels));
    } catch {}
  }, [panels]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setPanels((p) => (p.left || p.right ? { left: false, right: false } : { left: true, right: true }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    url.searchParams.set('device', productPage ? 'product-page' : device);
    if (activeSet === PRIMARY_SET) url.searchParams.delete('set');
    else url.searchParams.set('set', activeSet);
    if (lang) url.searchParams.set('lang', lang);
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }, [appId, device, productPage, activeSet, lang]);

  // Back to the base language when this app doesn't have the one being edited.
  useEffect(() => {
    if (app && lang && !app.languages.includes(lang)) setLang(null);
  }, [app, lang]);

  // Fall back to the primary set when the active one is gone (deleted, or another app).
  useEffect(() => {
    if (app && !setList(app).some((x) => x.id === activeSet)) setActiveSet(PRIMARY_SET);
  }, [app, activeSet]);

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
      // Keys: "app|<set>" for app/style patches, "slide|<set>|<slide id>" for slides.
      const [kind, set, slideId] = key.split('|');
      try {
        if (kind === 'app') {
          const saved = await api.updateApp(id, patch, set);
          // Adopt the server's theme so both sides agree (e.g. after a preset).
          if ((patch as { preset?: string }).preset) setApp((a) => a && withSet(a, set, () => ({ theme: saved.theme })));
        } else {
          await api.updateSlide(id, slideId, patch, set);
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

  /** Actions on one screenshot set; every row of the canvas and the inspector get their set's. */
  const actionsFor = (setId: string): EditorActions => ({
    notify,
    patchApp: (raw) => {
      // While translating, creative and badge text goes to that language.
      const patch = localizeAppPatch(raw as Record<string, unknown>, lang);
      // Theme and creatives belong to the set; everything else (name, profile, devices…) is shared.
      const { preset, theme, creatives, ...shared } = patch as { preset?: string; theme?: unknown; creatives?: unknown };
      setApp((a) => {
        if (!a) return a;
        return withSet(deepMerge(a, shared), setId, (p) => {
          let t = preset ? applyPreset(p.theme, preset) : p.theme;
          if (theme) t = deepMerge(t, theme);
          return { theme: t, creatives: creatives ? deepMerge(p.creatives, creatives) : p.creatives };
        });
      });
      queue(`app|${setId}`, patch);
    },
    patchSlide: (slideId, raw) => {
      // While translating, headline, subtitle and screenshots go to that language.
      const patch = localizeSlidePatch(raw as Record<string, unknown>, lang);
      setApp((a) => a && withSet(a, setId, (p) => ({ slides: p.slides.map((s) => (s.id === slideId ? deepMerge(s, patch) : s)) })));
      queue(`slide|${setId}|${slideId}`, patch);
    },
    addSlide: (partial = {}, index) =>
      run(async () => {
        const s = await api.addSlide(app!.id, { ...partial, index }, setId);
        setActiveSet(setId);
        setSelected(s.id);
        setTab('slide');
      }),
    duplicateSlide: (slideId) =>
      run(async () => {
        const slides = setView(app!, setId === PRIMARY_SET ? null : setId).slides;
        const i = slides.findIndex((s) => s.id === slideId);
        const { id: _id, ...rest } = slides[i];
        const s = await api.addSlide(app!.id, { ...rest, index: i + 1 }, setId);
        setSelected(s.id);
      }, 'Slide duplicated'),
    deleteSlide: (slideId) =>
      run(async () => {
        await api.deleteSlide(app!.id, slideId, setId);
        setSelected(null);
      }, 'Slide deleted'),
    ingest: (files) =>
      run(async () => {
        const r = await api.ingest(app!.id, files, undefined, setId, lang);
        const placed = r.placed.length;
        if (r.skipped.length) notify(`Added ${placed}. Skipped ${r.skipped.map((s) => `${s.name}: ${s.reason}`).join('; ')}`);
        else notify(`Added ${placed} screenshot${placed === 1 ? '' : 's'}`);
      }),
    setShot: (slideId, files) => run(() => api.setShot(app!.id, slideId, device, files[0], setId, lang), lang ? 'Screenshot replaced for this language' : 'Screenshot replaced'),
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
      setApp((a) => a && withSet(a, setId, (p) => ({ slides: order.map((id) => p.slides.find((s) => s.id === id)!).filter(Boolean) })));
      await run(() => api.reorder(app!.id, order, setId));
    },
  });
  const actions = actionsFor(activeSet);

  const setActions = {
    create: (from: string | null, blank?: boolean) =>
      run(async () => {
        const s = await api.createSet(app!.id, { from: from ?? undefined, blank });
        // Load it first, or the "active set no longer exists" fallback would switch back to the primary.
        await refreshApp();
        setActiveSet(s.id);
        setSelected(null);
      }, 'Set created'),
    rename: (setId: string, name: string) => {
      setApp((a) => a && (setId === PRIMARY_SET ? { ...a, primarySetName: name } : { ...a, sets: a.sets.map((s) => (s.id === setId ? { ...s, name } : s)) }));
      api.renameSet(app!.id, setId, name).catch((e) => notify((e as Error).message));
    },
    remove: (setId: string) =>
      run(async () => {
        await api.deleteSet(app!.id, setId);
        if (setId === activeSet) setActiveSet(PRIMARY_SET);
      }, 'Set deleted'),
    makePrimary: (setId: string) =>
      run(async () => {
        await api.makePrimary(app!.id, setId);
        setActiveSet(PRIMARY_SET);
        setSelected(null);
      }, 'Set is now primary'),
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

  // The app in the language being edited, and as the active set sees it.
  const setRef = app && setList(app).some((x) => x.id === activeSet) && activeSet !== PRIMARY_SET ? activeSet : null;
  const shown = app ? localize(app, lang) : null;
  const view = shown ? setView(shown, setRef) : null;
  const selectedSlide = view?.slides.find((s) => s.id === selected) ?? null;
  // The same slide as written in the base language, shown next to a translation.
  const baseSlide = app && lang ? (setView(app, setRef).slides.find((s) => s.id === selected) ?? null) : null;

  return (
    <div className="shell" data-left={panels.left ? 'open' : 'closed'} data-right={panels.right && app ? 'open' : 'closed'}>
      {panels.left && (
      <AppRail
        onClose={() => setPanels((p) => ({ ...p, left: false }))}
        ui={ui}
        apps={apps ?? []}
        current={appId}
        onSelect={setAppId}
        onCreate={createApp}
        onDelete={deleteApp}
        layers={
          app && !productPage
            ? {
                app: shown!,
                activeSet,
                selected,
                onSelect: (setId, id) => {
                  setActiveSet(setId);
                  setSelected(id);
                  if (id) setTab('slide');
                },
              }
            : null
        }
      />
      )}
      {app ? (
        <>
          <main className="workspace">
            <Topbar
              app={view!}
              device={device}
              onDevice={(d) => {
                setDevice(d);
                setProductPage(false);
              }}
              productPage={productPage}
              onProductPage={() => setProductPage(true)}
              zoom={zoom}
              onZoom={setZoom}
              lang={lang}
              onLang={setLang}
              onAddLanguage={() => {
                setTab('app');
                setPanels((p) => ({ ...p, right: true }));
              }}
              onExport={() => setExporting(true)}
              panels={{
                ...panels,
                openLeft: () => setPanels((p) => ({ ...p, left: true })),
                openRight: () => setPanels((p) => ({ ...p, right: true })),
              }}
              onToggleDevice={(d) => {
                const devices = app.devices.includes(d) ? app.devices.filter((x) => x !== d) : [...app.devices, d];
                if (!devices.length) return;
                actions.patchApp({ devices });
                if (!app.devices.includes(d)) setDevice(d);
              }}
            />
            {productPage ? (
              <CreativesBoard
                app={view!}
                onSet={(id) => {
                  setActiveSet(id);
                  setCreative(null);
                }}
                zoom={canvasZoom}
                selected={creative}
                onSelect={(id) => {
                  setCreative(id);
                  if (id) setTab('slide');
                }}
              />
            ) : (
              <SetsBoard
                app={shown!}
                device={device}
                zoom={canvasZoom}
                activeSet={activeSet}
                selected={selected}
                onSelect={(setId, id) => {
                  setActiveSet(setId);
                  setSelected(id);
                  if (id) setTab('slide');
                }}
                actionsFor={actionsFor}
                sets={setActions}
              />
            )}
          </main>
          {panels.right && (
          <Inspector
            onClose={() => setPanels((p) => ({ ...p, right: false }))}
            app={view!}
            device={device}
            slide={selectedSlide}
            baseSlide={baseSlide}
            productPage={productPage}
            creative={creative}
            tab={tab}
            onTab={setTab}
            actions={actions}
          />
          )}
          {exporting && <ExportDialog app={setView(app, setRef)} device={device} onClose={() => setExporting(false)} />}
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

/** Replace one set's theme/slides/creatives in the whole-app document. */
function withSet(a: App, setId: string, fn: (p: Pick<App, 'theme' | 'slides' | 'creatives'>) => Partial<Pick<App, 'theme' | 'slides' | 'creatives'>>): App {
  if (setId === PRIMARY_SET) return { ...a, ...fn(a) };
  return { ...a, sets: a.sets.map((s) => (s.id === setId ? { ...s, ...fn(s) } : s)) };
}

export const deviceLabel = (d: DeviceId) => DEVICES[d].label;
