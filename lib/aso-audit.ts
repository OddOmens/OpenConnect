// ASO checks on one App Store listing (one locale). Pure functions with no server imports,
// so the keyword editor on the ASO page runs the same checks live in the browser.
//
// How App Store search reads a listing: the app name, subtitle and keyword field are indexed
// together, word by word, and words from all three combine into phrases. So a word only needs
// to appear once across the three; repeating it, spaces after commas, and words Apple adds on
// its own ("app", the category) spend characters for nothing. Promotional text and the
// description are not indexed for search, but they decide whether someone taps Get.

export const LIMITS = { name: 30, subtitle: 30, keywords: 100, promotional_text: 170, description: 4000 } as const;
export type ListingField = keyof typeof LIMITS;

export interface ListingText {
  name: string;
  subtitle: string;
  keywords: string;
  promotional_text: string;
  description: string;
}

export type Severity = 'error' | 'warn' | 'info';

export interface AuditIssue {
  severity: Severity;
  field: ListingField | 'locales';
  title: string;
  detail?: string;
  /** Characters this issue wastes in the indexed fields. */
  wasted?: number;
}

export interface KeywordTerm {
  term: string;
  /** Why the term spends characters for nothing, if it does. */
  waste: 'duplicate' | 'in-name' | 'in-subtitle' | 'generic' | 'category' | 'plural' | null;
}

export interface AuditResult {
  score: number; // 0-100
  issues: AuditIssue[];
  terms: KeywordTerm[];
  /** Characters of the 100 that do no work: spaces after commas, duplicates, wasted terms. */
  wastedChars: number;
  unusedChars: number;
  /** Every distinct indexed word, lowercased: name + subtitle + keywords. */
  indexedWords: string[];
}

// Words Apple matches without them being in the keyword field, or that nobody searches alone.
const GENERIC = new Set([
  'app', 'apps', 'application', 'free', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'to', 'in', 'on', 'my', 'your',
  'iphone', 'ipad', 'ios', 'apple', 'best', 'new', 'top',
]);

/** Lowercase words: letters and digits in any script; apostrophes and hyphens split words, as search does. */
export function words(text: string): string[] {
  return (text || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function chars(s: string): number {
  return [...(s || '')].length;
}

/** "timers" → "timer", "diaries" → "diary"; only to spot singular/plural pairs, so it can be crude. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function splitKeywords(field: string): string[] {
  return (field || '').split(/[,，、]/).map((t) => t.trim()).filter(Boolean);
}

/**
 * Checks one locale's listing. `category` is the primary category's name (e.g. "Productivity"),
 * used to spot keywords Apple already matches through the category.
 */
export function auditListing(l: ListingText, opts: { category?: string | null } = {}): AuditResult {
  const issues: AuditIssue[] = [];
  const nameWords = new Set(words(l.name));
  const subtitleWords = new Set(words(l.subtitle));
  const category = new Set(words(opts.category || ''));

  // --- Keyword field -----------------------------------------------------------------------
  const raw = l.keywords || '';
  const spaces = (raw.match(/\s*[,，、]\s*/g) || []).reduce((n, sep) => n + chars(sep) - 1, 0) + (chars(raw) - chars(raw.trim()));
  const terms: KeywordTerm[] = [];
  const seenTerms = new Set<string>();
  const seenWords = new Map<string, number>();
  const singulars = new Set<string>();
  for (const term of splitKeywords(raw)) {
    const ws = words(term);
    const key = ws.join(' ');
    let waste: KeywordTerm['waste'] = null;
    if (!ws.length) continue;
    if (seenTerms.has(key)) waste = 'duplicate';
    else if (ws.every((w) => nameWords.has(w))) waste = 'in-name';
    else if (ws.every((w) => nameWords.has(w) || subtitleWords.has(w))) waste = 'in-subtitle';
    else if (ws.every((w) => GENERIC.has(w))) waste = 'generic';
    else if (ws.every((w) => category.has(w))) waste = 'category';
    else if (ws.length === 1 && singulars.has(singular(ws[0]))) waste = 'plural';
    seenTerms.add(key);
    ws.forEach((w) => {
      seenWords.set(w, (seenWords.get(w) || 0) + 1);
      singulars.add(singular(w));
    });
    terms.push({ term, waste });
  }

  const wastedTerms = terms.filter((t) => t.waste);
  const wastedTermChars = wastedTerms.reduce((n, t) => n + chars(t.term) + 1, 0);
  const used = chars(raw);
  const unusedChars = Math.max(0, LIMITS.keywords - used);

  if (!raw.trim()) {
    issues.push({ severity: 'error', field: 'keywords', title: 'The keyword field is empty', detail: '100 characters of search terms that only App Store search sees. Fill them.' });
  }
  if (spaces > 0) {
    issues.push({
      severity: 'warn', field: 'keywords', wasted: spaces,
      title: `${spaces} space${spaces === 1 ? '' : 's'} around commas`,
      detail: 'Separate keywords with a comma alone ("focus,timer"); every space counts against the 100.',
    });
  }
  const byWaste = (kind: KeywordTerm['waste']) => wastedTerms.filter((t) => t.waste === kind).map((t) => t.term);
  const listTerms = (ts: string[]) => ts.map((t) => `“${t}”`).join(', ');
  const wasteIssues: [KeywordTerm['waste'], Severity, string, string][] = [
    ['duplicate', 'warn', 'Repeated keywords', 'Each keyword counts once.'],
    ['in-name', 'warn', 'Keywords already in the app name', 'The name is indexed too; repeating its words gains nothing.'],
    ['in-subtitle', 'warn', 'Keywords already in the subtitle', 'The subtitle is indexed too; repeating its words gains nothing.'],
    ['generic', 'warn', 'Words search ignores or adds itself', 'Words like “app” and “free” match anyway.'],
    ['category', 'info', 'Your category’s name', 'Apps usually match their category’s name without it.'],
    ['plural', 'info', 'Singular and plural of the same word', 'Search often matches both forms; keeping one frees room.'],
  ];
  for (const [kind, severity, title, detail] of wasteIssues) {
    const ts = byWaste(kind);
    if (!ts.length) continue;
    issues.push({ severity, field: 'keywords', title, detail: `${listTerms(ts)}. ${detail}`, wasted: ts.reduce((n, t) => n + chars(t) + 1, 0) });
  }
  // Words repeated across phrases ("habit tracker,habit app") are spent twice: search combines words on its own.
  const repeated = [...seenWords.entries()].filter(([w, n]) => n > 1 && !GENERIC.has(w)).map(([w]) => w);
  if (repeated.length) {
    const wasted = [...seenWords.entries()].filter(([w, n]) => n > 1 && !GENERIC.has(w)).reduce((s, [w, n]) => s + (n - 1) * (chars(w) + 1), 0);
    issues.push({
      severity: 'info', field: 'keywords', wasted,
      title: 'Words repeated across keyword phrases',
      detail: `${listTerms(repeated)}. Search combines single words into phrases, so each word only needs to appear once.`,
    });
  }
  if (raw.trim() && unusedChars >= 8) {
    issues.push({
      severity: unusedChars >= 25 ? 'warn' : 'info', field: 'keywords',
      title: `${unusedChars} characters left`,
      detail: `Room for about ${Math.max(1, Math.floor(unusedChars / 8))} more keyword${unusedChars >= 16 ? 's' : ''}.`,
    });
  }

  // --- Name & subtitle ---------------------------------------------------------------------
  const nameLen = chars(l.name);
  const subtitleLen = chars(l.subtitle);
  if (!l.subtitle?.trim()) {
    issues.push({ severity: 'error', field: 'subtitle', title: 'No subtitle', detail: '30 indexed characters shown under the name in search results. Use them for your main keywords.' });
  } else if (subtitleLen < 20) {
    issues.push({ severity: 'info', field: 'subtitle', title: `Subtitle uses ${subtitleLen} of 30 characters`, detail: 'The subtitle is indexed; spare room is room for a keyword.' });
  }
  const subtitleRepeats = [...subtitleWords].filter((w) => nameWords.has(w) && !GENERIC.has(w));
  if (subtitleRepeats.length) {
    issues.push({
      severity: 'warn', field: 'subtitle', title: 'Subtitle repeats words from the name',
      detail: `${listTerms(subtitleRepeats)}. A word only needs to appear once across name, subtitle and keywords.`,
      wasted: subtitleRepeats.reduce((n, w) => n + chars(w) + 1, 0),
    });
  }
  if (nameLen && nameLen < 18 && !/[:\-–—|]/.test(l.name)) {
    issues.push({ severity: 'info', field: 'name', title: 'The name is the brand alone', detail: 'The name carries the most search weight. “Brand: main keyword” uses it for search too.' });
  }

  // --- Conversion fields (not indexed) -----------------------------------------------------
  if (!l.promotional_text?.trim()) {
    issues.push({ severity: 'info', field: 'promotional_text', title: 'No promotional text', detail: 'Shown above the description and changeable any time without a new version. Not indexed for search.' });
  }
  const descLen = chars(l.description);
  if (descLen < 600) {
    issues.push({ severity: 'info', field: 'description', title: `Short description (${descLen} characters)`, detail: 'Not indexed for search on iOS, but it is what people read before tapping Get.' });
  }

  // --- Score -------------------------------------------------------------------------------
  const wastedChars = Math.min(LIMITS.keywords, spaces + wastedTermChars);
  const fill = (n: number, max: number) => Math.min(1, n / max);
  const keywordWork = raw.trim() ? Math.max(0, (used - wastedChars) / LIMITS.keywords) : 0;
  const score = Math.round(
    15 * fill(nameLen, 24) +
      20 * (l.subtitle?.trim() ? fill(subtitleLen, 26) : 0) +
      45 * keywordWork +
      10 * (subtitleRepeats.length ? 0.4 : 1) +
      5 * (l.promotional_text?.trim() ? 1 : 0) +
      5 * fill(descLen, 1500)
  );

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const indexedWords = [...new Set([...nameWords, ...subtitleWords, ...splitKeywords(raw).flatMap(words)])];
  return { score: Math.max(0, Math.min(100, score)), issues, terms, wastedChars, unusedChars, indexedWords };
}

/**
 * The keyword field with the waste taken out: no spaces around commas, no repeats, nothing
 * already in the name or subtitle, no generic words. Multi-word phrases are split into words
 * when that saves room (search recombines them).
 */
export function cleanKeywords(l: Pick<ListingText, 'name' | 'subtitle' | 'keywords'>, opts: { category?: string | null } = {}): string {
  const taken = new Set([...words(l.name), ...words(l.subtitle)]);
  const category = new Set(words(opts.category || ''));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of splitKeywords(l.keywords)) {
    for (const w of words(term)) {
      if (taken.has(w) || seen.has(w) || GENERIC.has(w) || category.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  return out.join(',');
}

/** Where a search term's words appear in a listing. */
export type Coverage = 'name' | 'subtitle' | 'keywords' | 'partial' | 'missing';

export function keywordCoverage(term: string, l: Pick<ListingText, 'name' | 'subtitle' | 'keywords'> | null): Coverage {
  if (!l) return 'missing';
  const ws = words(term).filter((w) => !GENERIC.has(w));
  if (!ws.length) return 'missing';
  const name = new Set(words(l.name));
  const subtitle = new Set(words(l.subtitle));
  const keywords = new Set(splitKeywords(l.keywords).flatMap(words));
  const has = (w: string) => name.has(w) || subtitle.has(w) || keywords.has(w);
  const found = ws.filter(has).length;
  if (found < ws.length) return found ? 'partial' : 'missing';
  if (ws.every((w) => name.has(w))) return 'name';
  if (ws.every((w) => name.has(w) || subtitle.has(w))) return 'subtitle';
  return 'keywords';
}

export function isGenericWord(w: string): boolean {
  return GENERIC.has(w);
}
