import type { App } from './types';

/** Id of an app's own theme, slides and creatives. */
export const PRIMARY_SET = 'primary';

export interface SetSummary {
  id: string;
  name: string;
  primary: boolean;
  slides: number;
}

/** Find a set by id or name (any case); "primary" or empty means the app's own. */
export function findSet(app: App, ref?: string | null) {
  if (!ref || ref === PRIMARY_SET || ref.toLowerCase() === app.primarySetName.toLowerCase()) return null;
  const lower = ref.toLowerCase();
  const s = app.sets.find((x) => x.id === ref || x.name.toLowerCase() === lower);
  if (!s) throw Object.assign(new Error(`Set "${ref}" not found in ${app.name}. Sets: ${setList(app).map((x) => x.name).join(', ')}`), { status: 404 });
  return s;
}

/**
 * The app as one set sees it: that set's theme, slides and creatives with everything shared. Every renderer,
 * check and summary takes an App, so they work on any set through this.
 */
export function setView(app: App, ref?: string | null): App {
  const s = findSet(app, ref);
  if (!s) return app.activeSet ? { ...app, activeSet: undefined } : app;
  return { ...app, theme: s.theme, slides: s.slides, creatives: s.creatives, activeSet: s.id };
}

export function setList(app: App): SetSummary[] {
  return [
    { id: PRIMARY_SET, name: app.primarySetName, primary: true, slides: app.slides.length },
    ...app.sets.map((s) => ({ id: s.id, name: s.name, primary: false, slides: s.slides.length })),
  ];
}

/** Display name of the set an app view shows. */
export function setName(app: App) {
  return app.activeSet ? (app.sets.find((s) => s.id === app.activeSet)?.name ?? app.activeSet) : app.primarySetName;
}
