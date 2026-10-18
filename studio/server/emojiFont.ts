// Emoji from a color emoji font the user provides (e.g. Apple Color Emoji, copied from a Mac): cut out once
// into one PNG per emoji, so stickers in that look go through the same <img> path as the bundled Fluent Emoji.
// Apple's emoji can't be redistributed, so nothing is bundled; drop the font into <data>/fonts and restart.
// Reads sbix (Apple) and CBDT/CBLC (Noto) bitmap fonts, .ttc or .ttf. Emoji sequences (ZWJ, skin tones,
// keycaps) are resolved through the font's GSUB ligatures, or, for Apple's font (which builds them with AAT
// `morx` instead), through its glyph names: 🧑‍⚕️ is u1F9D1_u2695, with .0–.5 for skin tones (.0 is default).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type Glyph = number;

class Font {
  private tables = new Map<string, number>();
  constructor(private b: Buffer) {
    let base = 0;
    if (b.toString('latin1', 0, 4) === 'ttcf') base = b.readUInt32BE(12); // first font of the collection
    const n = b.readUInt16BE(base + 4);
    for (let i = 0; i < n; i++) {
      const r = base + 12 + i * 16;
      this.tables.set(b.toString('latin1', r, r + 4), b.readUInt32BE(r + 8));
    }
  }
  table(tag: string) {
    return this.tables.get(tag);
  }
  get numGlyphs() {
    return this.b.readUInt16BE(this.tables.get('maxp')! + 4);
  }

  /** Unicode code point → glyph, from the best cmap subtable (format 12, else format 4). */
  cmap(): Map<number, Glyph> {
    const b = this.b;
    const t = this.table('cmap');
    const out = new Map<number, Glyph>();
    if (t === undefined) return out;
    const subs: { format: number; at: number }[] = [];
    for (let i = 0; i < b.readUInt16BE(t + 2); i++) {
      const r = t + 4 + i * 8;
      const platform = b.readUInt16BE(r);
      const encoding = b.readUInt16BE(r + 2);
      if (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) {
        const at = t + b.readUInt32BE(r + 4);
        subs.push({ format: b.readUInt16BE(at), at });
      }
    }
    const f12 = subs.find((s) => s.format === 12);
    const f4 = subs.find((s) => s.format === 4);
    if (f12) {
      const groups = b.readUInt32BE(f12.at + 12);
      for (let g = 0; g < groups; g++) {
        const r = f12.at + 16 + g * 12;
        const start = b.readUInt32BE(r);
        const end = b.readUInt32BE(r + 4);
        const glyph = b.readUInt32BE(r + 8);
        for (let c = start; c <= end; c++) out.set(c, glyph + c - start);
      }
    }
    if (f4) {
      const segs = b.readUInt16BE(f4.at + 6) / 2;
      const ends = f4.at + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = b.readUInt16BE(ends + s * 2);
        const start = b.readUInt16BE(starts + s * 2);
        const delta = b.readInt16BE(deltas + s * 2);
        const range = b.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          if (out.has(c)) continue;
          let g: number;
          if (range === 0) g = (c + delta) & 0xffff;
          else {
            g = b.readUInt16BE(ranges + s * 2 + range + (c - start) * 2);
            if (g) g = (g + delta) & 0xffff;
          }
          if (g) out.set(c, g);
        }
      }
    }
    return out;
  }

  /** Glyph names from a format 2 `post` table (name → glyph); empty for other formats. */
  glyphNames(): Map<string, Glyph> {
    const b = this.b;
    const out = new Map<string, Glyph>();
    const t = this.table('post');
    if (t === undefined || b.readUInt32BE(t) !== 0x20000) return out;
    const count = b.readUInt16BE(t + 32);
    const index = Array.from({ length: count }, (_, g) => b.readUInt16BE(t + 34 + g * 2));
    const names: string[] = [];
    // Index 0–257 are the standard Macintosh names, which no emoji uses; the rest follow as Pascal strings.
    for (let at = t + 34 + count * 2, need = Math.max(...index) - 257; names.length < need; at += 1 + b[at]) {
      names.push(b.toString('latin1', at + 1, at + 1 + b[at]));
    }
    index.forEach((i, g) => i >= 258 && out.set(names[i - 258], g));
    return out;
  }

  private coverage(at: number): Glyph[] {
    const b = this.b;
    const out: Glyph[] = [];
    if (b.readUInt16BE(at) === 1) {
      for (let i = 0; i < b.readUInt16BE(at + 2); i++) out.push(b.readUInt16BE(at + 4 + i * 2));
    } else {
      for (let i = 0; i < b.readUInt16BE(at + 2); i++) {
        const r = at + 4 + i * 6;
        for (let g = b.readUInt16BE(r); g <= b.readUInt16BE(r + 2); g++) out.push(g);
      }
    }
    return out;
  }

  /** Every GSUB ligature (lookup type 4, also inside type 7 extensions): first glyph → [rest, result]. */
  ligatures(): Map<Glyph, { rest: Glyph[]; glyph: Glyph }[]> {
    const b = this.b;
    const out = new Map<Glyph, { rest: Glyph[]; glyph: Glyph }[]>();
    const t = this.table('GSUB');
    if (t === undefined) return out;
    const list = t + b.readUInt16BE(t + 8);
    for (let l = 0; l < b.readUInt16BE(list); l++) {
      const lookup = list + b.readUInt16BE(list + 2 + l * 2);
      const type = b.readUInt16BE(lookup);
      for (let s = 0; s < b.readUInt16BE(lookup + 4); s++) {
        let sub = lookup + b.readUInt16BE(lookup + 6 + s * 2);
        let subType = type;
        if (type === 7) {
          subType = b.readUInt16BE(sub + 2);
          sub += b.readUInt32BE(sub + 4);
        }
        if (subType !== 4) continue;
        const firsts = this.coverage(sub + b.readUInt16BE(sub + 2));
        firsts.forEach((first, i) => {
          const set = sub + b.readUInt16BE(sub + 6 + i * 2);
          for (let k = 0; k < b.readUInt16BE(set); k++) {
            const lig = set + b.readUInt16BE(set + 2 + k * 2);
            const count = b.readUInt16BE(lig + 2);
            const rest = Array.from({ length: count - 1 }, (_, j) => b.readUInt16BE(lig + 4 + j * 2));
            const entry = { rest, glyph: b.readUInt16BE(lig) };
            const arr = out.get(first) ?? [];
            arr.push(entry);
            out.set(first, arr);
          }
        });
      }
    }
    // Longest match first.
    for (const arr of out.values()) arr.sort((x, y) => y.rest.length - x.rest.length);
    return out;
  }

  /** The PNG for a glyph from the largest sbix strike, following 'dupe' and Apple's 'flip' (mirrored) references. */
  private sbix(glyph: Glyph, depth = 0): Buffer | null {
    const b = this.b;
    const t = this.table('sbix')!;
    let best = -1;
    let bestPpem = -1;
    for (let i = 0; i < b.readUInt32BE(t + 4); i++) {
      const strike = t + b.readUInt32BE(t + 8 + i * 4);
      const ppem = b.readUInt16BE(strike);
      const start = b.readUInt32BE(strike + 4 + glyph * 4);
      const end = b.readUInt32BE(strike + 8 + glyph * 4);
      if (end > start && ppem > bestPpem) {
        best = strike;
        bestPpem = ppem;
      }
    }
    if (best < 0) return null;
    const start = best + b.readUInt32BE(best + 4 + glyph * 4);
    const end = best + b.readUInt32BE(best + 8 + glyph * 4);
    const kind = b.toString('latin1', start + 4, start + 8);
    if (kind === 'png ') return b.subarray(start + 8, end);
    if (kind === 'dupe' && depth < 4) return this.sbix(b.readUInt16BE(start + 8), depth + 1);
    if (kind === 'flip' && depth < 4) {
      const png = this.sbix(b.readUInt16BE(start + 8), depth + 1);
      return png && mirrorPng(png);
    }
    return null;
  }

  /** The PNG for a glyph from the largest CBDT strike (index formats 1 and 3, image formats 17–19). */
  private cbdt(glyph: Glyph): Buffer | null {
    const b = this.b;
    const loc = this.table('CBLC')!;
    const data = this.table('CBDT')!;
    let found: { at: number; format: number; ppem: number } | null = null;
    for (let i = 0; i < b.readUInt32BE(loc + 4); i++) {
      const size = loc + 8 + i * 48;
      const ppem = b.readUInt8(size + 45);
      if (found && ppem <= found.ppem) continue;
      const arr = loc + b.readUInt32BE(size);
      for (let j = 0; j < b.readUInt32BE(size + 8); j++) {
        const e = arr + j * 8;
        const first = b.readUInt16BE(e);
        const last = b.readUInt16BE(e + 2);
        if (glyph < first || glyph > last) continue;
        const sub = arr + b.readUInt32BE(e + 4);
        const indexFormat = b.readUInt16BE(sub);
        const imageFormat = b.readUInt16BE(sub + 2);
        const base = data + b.readUInt32BE(sub + 4);
        const k = glyph - first;
        let off: number | null = null;
        let next: number | null = null;
        if (indexFormat === 1) [off, next] = [b.readUInt32BE(sub + 8 + k * 4), b.readUInt32BE(sub + 12 + k * 4)];
        else if (indexFormat === 3) [off, next] = [b.readUInt16BE(sub + 8 + k * 2), b.readUInt16BE(sub + 10 + k * 2)];
        if (off !== null && next !== null && next > off) found = { at: base + off, format: imageFormat, ppem };
      }
    }
    if (!found) return null;
    const skip = { 17: 5, 18: 8, 19: 0 }[found.format];
    if (skip === undefined) return null;
    const len = b.readUInt32BE(found.at + skip);
    return b.subarray(found.at + skip + 4, found.at + skip + 4 + len);
  }

  png(glyph: Glyph): Buffer | null {
    if (glyph <= 0 || glyph >= this.numGlyphs) return null;
    if (this.table('sbix') !== undefined) return this.sbix(glyph);
    if (this.table('CBDT') !== undefined && this.table('CBLC') !== undefined) return this.cbdt(glyph);
    return null;
  }
}

/** A PNG mirrored left to right (8-bit RGB or RGBA, not interlaced, as Apple's emoji are); null otherwise. */
function mirrorPng(png: Buffer): Buffer | null {
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IHDR') ihdr = png.subarray(at + 8, at + 8 + len);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  if (!ihdr) return null;
  const [w, h] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)];
  const bpp = ihdr[9] === 6 ? 4 : ihdr[9] === 2 ? 3 : 0;
  if (ihdr[8] !== 8 || !bpp || ihdr[12] !== 0) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc((stride + 1) * h); // every row written back with filter 0 (none)
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < w; x++) line.copy(out, y * (stride + 1) + 1 + (w - 1 - x) * bpp, x * bpp, (x + 1) * bpp);
    prev = line;
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Apple's glyph name for an emoji: its code points without joiners and selectors (u1F9D1_u2695), then the
 * skin tone (.0 is the default), then a man/woman sign as .M/.W and "facing right" as .u27A1. Some symbols
 * are uniXXXX instead.
 */
function byName(text: string, names: Map<string, Glyph>): Glyph | null {
  const cps = [...text].map((c) => c.codePointAt(0)!).filter((c) => c !== 0x200d && c !== 0xfe0f);
  const suffix: string[] = [];
  while (cps.length > 1 && [0x2642, 0x2640, 0x27a1].includes(cps.at(-1)!)) {
    const c = cps.pop()!;
    suffix.unshift(c === 0x2642 ? 'M' : c === 0x2640 ? 'W' : 'u27A1');
  }
  const hex = (c: number) => c.toString(16).toUpperCase().padStart(4, '0');
  const name = cps.map((c) => `u${hex(c)}`).join('_');
  const tail = suffix.map((x) => `.${x}`).join('');
  const candidates = [`${name}.0${tail}`, `${name}${tail}`];
  if (!tail && cps.length === 1) candidates.push(`uni${hex(cps[0])}`);
  for (const c of candidates) if (names.has(c)) return names.get(c)!;
  return null;
}

/** Shape an emoji the way the font would: code points to glyphs, then apply ligatures until one glyph is left. */
function shape(text: string, cmap: Map<number, Glyph>, ligs: Map<Glyph, { rest: Glyph[]; glyph: Glyph }[]>): Glyph | null {
  const attempt = (cps: number[]): Glyph | null => {
    const gs = cps.map((c) => cmap.get(c));
    if (gs.some((g) => g === undefined)) return null;
    let seq = gs as Glyph[];
    for (let changed = true; changed && seq.length > 1; ) {
      changed = false;
      for (let i = 0; i < seq.length && !changed; i++) {
        for (const l of ligs.get(seq[i]) ?? []) {
          if (l.rest.every((g, j) => seq[i + 1 + j] === g)) {
            seq = [...seq.slice(0, i), l.glyph, ...seq.slice(i + 1 + l.rest.length)];
            changed = true;
            break;
          }
        }
      }
    }
    return seq.length === 1 ? seq[0] : null;
  };
  const cps = [...text].map((c) => c.codePointAt(0)!);
  // Fonts differ on whether ligatures include the emoji presentation selector (U+FE0F).
  return attempt(cps) ?? attempt(cps.filter((c) => c !== 0xfe0f));
}

const FONT_EXT = /\.(ttc|ttf|otf)$/i;

/** The emoji font dropped into <data>/fonts, if any (a file with "emoji" in its name). */
export function findEmojiFont(dataDir: string): string | null {
  const dir = path.join(dataDir, 'fonts');
  try {
    const f = fs.readdirSync(dir).find((n) => FONT_EXT.test(n) && /emoji/i.test(n));
    return f ? path.join(dir, f) : null;
  } catch {
    return null;
  }
}

/** Bump when extraction improves, so PNGs cut by an older version are cut again. */
const EXTRACTOR_VERSION = 2;

export interface EmojiFontIndex {
  /** font file the PNGs came from, and its mtime, so a new font is picked up */
  source: string;
  mtime: number;
  version: number;
  slugs: string[];
}

/**
 * Cut every emoji in `entries` out of the font into `<outDir>/<slug>.png`. Skips the work when `outDir`
 * already holds the PNGs of this exact font file.
 */
export function extractEmojiFont(fontPath: string, entries: { slug: string; glyph: string }[], outDir: string): EmojiFontIndex {
  const mtime = fs.statSync(fontPath).mtimeMs;
  const indexFile = path.join(outDir, 'index.json');
  try {
    const prev = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as EmojiFontIndex;
    if (prev.source === path.basename(fontPath) && prev.mtime === mtime && prev.version === EXTRACTOR_VERSION) return prev;
  } catch {}
  const font = new Font(fs.readFileSync(fontPath));
  if (font.table('sbix') === undefined && font.table('CBDT') === undefined) {
    throw new Error(`${path.basename(fontPath)} has no color bitmaps (sbix or CBDT); use Apple Color Emoji or Noto Color Emoji`);
  }
  const cmap = font.cmap();
  const ligs = font.ligatures();
  const names = font.glyphNames();
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const slugs: string[] = [];
  for (const e of entries) {
    if (!e.glyph) continue;
    // A single code point maps through cmap; a sequence the ligatures can't build may still be found by name.
    const g = shape(e.glyph, cmap, ligs) ?? byName(e.glyph, names);
    const png = g === null ? null : font.png(g);
    if (!png?.length) continue;
    fs.writeFileSync(path.join(outDir, `${e.slug}.png`), png);
    slugs.push(e.slug);
  }
  const index: EmojiFontIndex = { source: path.basename(fontPath), mtime, version: EXTRACTOR_VERSION, slugs };
  fs.writeFileSync(indexFile, JSON.stringify(index));
  return index;
}
