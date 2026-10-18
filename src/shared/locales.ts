import type { App, Creative, CreativeId, DeviceId, Slide, SlideLocale, Theme } from './types';
import { CREATIVE_IDS } from './types';

/**
 * Languages: an app's slides are written in `app.baseLanguage`; `app.languages` are the translations. Each
 * slide keeps its translations in `slide.locales[code]` (headline, subtitle, and screenshots taken in that
 * language), creatives in `creative.locales`, the hero badge in `theme.hero.locales`. Anything not
 * translated falls back to the base language. `localize(app, code)` returns an App-shaped view in one
 * language, so renderers, checks and summaries work unchanged (like `setView` for screenshot sets).
 */

/** App Store Connect localizations. Other BCP 47 codes work too; they just show as the code. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'en-AU', name: 'English (Australia)' },
  { code: 'en-CA', name: 'English (Canada)' },
  { code: 'en-GB', name: 'English (U.K.)' },
  { code: 'en-US', name: 'English (U.S.)' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'fr-CA', name: 'French (Canada)' },
  { code: 'de-DE', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ms', name: 'Malay' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
];

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** English name of a code's language from the runtime's locale data, or null when it doesn't know it. */
function intlName(code: string): string | null {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    const base = code.split('-')[0];
    return names.of(base) !== base ? (names.of(code) ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Canonical form of a language code: a listed code in its listed case, or any other real language code
 * (Apple adds localizations over time, e.g. bn-BD), or null.
 */
export function normalizeLanguage(code: string): string | null {
  const c = code.trim().replace(/_/g, '-');
  const known = LANGUAGES.find((l) => l.code.toLowerCase() === c.toLowerCase());
  if (known) return known.code;
  return CODE.test(c) && intlName(c) ? c : null;
}

export function languageName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.name ?? intlName(code) ?? code;
}

/**
 * Headline line height for a language: Arabic, Thai and Indic scripts stack marks above and below the letters,
 * so tight display leading makes lines collide.
 */
export function headlineLineHeight(lineHeight: number, lang?: string | null) {
  return /^(ar|fa|ur|th|hi|mr|ne|bn|gu|kn|ml|or|pa|ta|te)\b/.test(lang ?? '') ? Math.max(lineHeight, 1.32) : lineHeight;
}

/** Right-to-left scripts. */
export function isRtl(code?: string | null) {
  return !!code && /^(ar|he|fa|ur)\b/.test(code);
}

/**
 * Font stack for a slide: the theme's typeface first, then bundled Noto for scripts it doesn't cover, so the
 * editor and the headless export pick the same glyphs. Han characters look different per language, so the
 * CJK face follows the language.
 */
export function fontStack(family: string, lang?: string | null) {
  const cjk = /^ko\b/.test(lang ?? '')
    ? 'Noto Sans KR Variable'
    : /^zh-(Hant|TW|HK|MO)\b/.test(lang ?? '')
      ? 'Noto Sans TC Variable'
      : /^zh\b/.test(lang ?? '')
        ? 'Noto Sans SC Variable'
        : 'Noto Sans JP Variable';
  const scripts = `"${cjk}", "Noto Sans Arabic Variable", "Noto Sans Hebrew Variable", "Noto Sans Thai Variable", "Noto Sans Devanagari Variable"`;
  const first = family.startsWith('-') ? family : `"${family}"`;
  return `${first}, ${scripts}, -apple-system, system-ui, sans-serif`;
}

/** The language being translated, or null for the base language. Throws for one the app doesn't have. */
export function translationLanguage(app: Pick<App, 'baseLanguage' | 'languages'>, code?: string | null): string | null {
  if (!code) return null;
  const c = normalizeLanguage(code);
  if (c === app.baseLanguage) return null;
  if (!c || !app.languages.includes(c)) {
    const have = [app.baseLanguage, ...app.languages].join(', ');
    throw Object.assign(new Error(`${code} isn't one of this app's languages (${have}). Add it first.`), { status: 400 });
  }
  return c;
}

const present = (v?: string | null) => (v && v.trim() ? v : undefined);

function localSlide(s: Slide, lang: string): Slide {
  const loc = s.locales?.[lang];
  if (!loc) return s;
  const shots = { ...s.shots };
  for (const [d, id] of Object.entries(loc.shots ?? {})) if (id) shots[d as DeviceId] = id;
  return { ...s, headline: present(loc.headline) ?? s.headline, subtitle: present(loc.subtitle) ?? s.subtitle, shots };
}

function localCreatives(c: Record<CreativeId, Creative>, lang: string): Record<CreativeId, Creative> {
  const one = (x: Creative): Creative => {
    const loc = x.locales?.[lang];
    return loc ? { ...x, headline: present(loc.headline) ?? x.headline, subtitle: present(loc.subtitle) ?? x.subtitle } : x;
  };
  return { header: one(c.header), search: one(c.search) };
}

function localTheme(t: Theme, lang: string): Theme {
  const loc = t.hero.locales?.[lang];
  if (!loc) return t;
  return {
    ...t,
    hero: { ...t.hero, badgeTitle: present(loc.badgeTitle) ?? t.hero.badgeTitle, badgeCaption: present(loc.badgeCaption) ?? t.hero.badgeCaption },
  };
}

/** The app (every set) in one language. The base language, or none, returns the app as stored. */
export function localize(app: App, lang?: string | null): App {
  if (!lang || lang === app.baseLanguage) return app.activeLang ? { ...app, activeLang: undefined } : app;
  const part = <P extends Pick<App, 'theme' | 'slides' | 'creatives'>>(p: P): P => ({
    ...p,
    theme: localTheme(p.theme, lang),
    slides: p.slides.map((s) => localSlide(s, lang)),
    creatives: localCreatives(p.creatives, lang),
  });
  return { ...part(app), sets: app.sets.map(part), activeLang: lang };
}

/** Language a view shows (its own, or the base language). */
export const viewLanguage = (app: App) => app.activeLang ?? app.baseLanguage;

/**
 * A slide patch written while translating: headline, subtitle and screenshots go to `locales[lang]`;
 * everything else (stickers, callouts, style…) is shared by every language.
 */
export function localizeSlidePatch(patch: Record<string, unknown>, lang: string | null): Record<string, unknown> {
  if (!lang || !patch || typeof patch !== 'object') return patch;
  const { headline, subtitle, shots, ...rest } = patch as Partial<Slide> & Record<string, unknown>;
  const loc: SlideLocale = {};
  if (headline !== undefined) loc.headline = headline;
  if (subtitle !== undefined) loc.subtitle = subtitle;
  if (shots !== undefined) loc.shots = shots;
  return Object.keys(loc).length ? { ...rest, locales: { ...((rest.locales as object) ?? {}), [lang]: loc } } : rest;
}

/** An app patch written while translating: creative text and the hero badge text go to their `locales`. */
export function localizeAppPatch(patch: Record<string, unknown>, lang: string | null): Record<string, unknown> {
  if (!lang || !patch || typeof patch !== 'object') return patch;
  const out: Record<string, unknown> = { ...patch };
  const creatives = patch.creatives as Partial<Record<CreativeId, Partial<Creative>>> | undefined;
  if (creatives) {
    out.creatives = Object.fromEntries(
      Object.entries(creatives).map(([id, c]) => {
        if (!c) return [id, c];
        const { headline, subtitle, ...rest } = c;
        const loc: Record<string, string> = {};
        if (headline !== undefined) loc.headline = headline;
        if (subtitle !== undefined) loc.subtitle = subtitle;
        return [id, Object.keys(loc).length ? { ...rest, locales: { [lang]: loc } } : rest];
      }),
    );
  }
  const hero = (patch.theme as { hero?: Partial<Theme['hero']> } | undefined)?.hero;
  if (hero && (hero.badgeTitle !== undefined || hero.badgeCaption !== undefined)) {
    const { badgeTitle, badgeCaption, ...rest } = hero;
    const loc: Record<string, string> = {};
    if (badgeTitle !== undefined) loc.badgeTitle = badgeTitle;
    if (badgeCaption !== undefined) loc.badgeCaption = badgeCaption;
    out.theme = { ...(patch.theme as object), hero: { ...rest, locales: { [lang]: loc } } };
  }
  return out;
}

/** What a slide still needs in a language: the base text that has no translation yet. */
export function untranslated(s: Slide, lang: string): ('headline' | 'subtitle')[] {
  const loc = s.locales?.[lang];
  const missing: ('headline' | 'subtitle')[] = [];
  if (present(s.headline) && !present(loc?.headline)) missing.push('headline');
  if (present(s.subtitle) && !present(loc?.subtitle)) missing.push('subtitle');
  return missing;
}

/** Per language: how many slides of the app's own view (one set) are fully translated. */
export function translationProgress(app: App) {
  return app.languages.map((code) => ({
    code,
    name: languageName(code),
    done: app.slides.filter((s) => !untranslated(s, code).length).length,
    total: app.slides.length,
  }));
}

type Pair<K extends string> = Record<K, string>;
interface ReportItem<K extends string> {
  base: Pair<K>;
  translation: Pair<K>;
  missing: K[];
}

/** Base text next to each translation, and what's missing: what Claude reads before translating. */
export function translationReport(app: App, langs: string[]) {
  const pair = <K extends string>(keys: K[], base: Partial<Record<K, string>>, loc: Partial<Record<K, string>> | undefined): ReportItem<K> => ({
    base: Object.fromEntries(keys.map((k) => [k, base[k] ?? ''])) as Pair<K>,
    translation: Object.fromEntries(keys.map((k) => [k, loc?.[k] ?? ''])) as Pair<K>,
    missing: keys.filter((k) => present(base[k]) && !present(loc?.[k])),
  });
  const hero = app.slides.some((s) => s.role === 'hero') && app.theme.hero.badge !== 'none';
  return {
    baseLanguage: app.baseLanguage,
    languages: langs.map((code) => ({
      code,
      name: languageName(code),
      done: app.slides.filter((s) => !untranslated(s, code).length).length,
      total: app.slides.length,
      slides: app.slides.map((s, i) => ({
        position: i + 1,
        id: s.id,
        ...pair(['headline', 'subtitle'], s, s.locales?.[code]),
        /** devices with a screenshot taken in this language */
        screenshots: Object.entries(s.locales?.[code]?.shots ?? {}).filter(([, v]) => v).map(([d]) => d as DeviceId),
      })),
      creatives: CREATIVE_IDS.filter((id) => app.creatives[id].enabled).map((id) => ({
        creative: id,
        ...pair(['headline', 'subtitle'], app.creatives[id], app.creatives[id].locales?.[code]),
      })),
      hero: hero ? pair(['badgeTitle', 'badgeCaption'], app.theme.hero, app.theme.hero.locales?.[code]) : null,
    })),
  };
}
