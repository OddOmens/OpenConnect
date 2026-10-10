#!/usr/bin/env bash
# Download Microsoft Fluent Emoji (MIT) into vendor/fluent-emoji so stickers work offline:
#   vendor/fluent-emoji/<slug>/{3d.png,color.svg,flat.svg} + index.json (name, glyph, group, keywords).
# Default skin tone only. Re-run any time to update. Uses a sparse, blob-filtered git clone (~130 MB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/fluent-emoji"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching Fluent Emoji…"
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/microsoft/fluentui-emoji.git "$TMP/repo"
cd "$TMP/repo"
git sparse-checkout set --no-cone \
  '/assets/*/metadata.json' \
  '/assets/*/3D/*' '/assets/*/Color/*' '/assets/*/Flat/*' \
  '/assets/*/Default/3D/*' '/assets/*/Default/Color/*' '/assets/*/Default/Flat/*' \
  '/LICENSE'

node - "$TMP/repo" "$DEST" <<'NODE'
const fs = require('fs');
const path = require('path');
const [src, dest] = process.argv.slice(2);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dest, 'LICENSE'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const index = [];
for (const name of fs.readdirSync(path.join(src, 'assets')).sort()) {
  const dir = path.join(src, 'assets', name);
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')); } catch {}
  const base = fs.existsSync(path.join(dir, 'Default')) ? path.join(dir, 'Default') : dir;
  const pick = (style, ext) => {
    const d = path.join(base, style);
    if (!fs.existsSync(d)) return null;
    const f = fs.readdirSync(d).find((x) => x.endsWith(ext));
    return f ? path.join(d, f) : null;
  };
  const files = { '3d.png': pick('3D', '.png'), 'color.svg': pick('Color', '.svg'), 'flat.svg': pick('Flat', '.svg') };
  if (!files['3d.png'] && !files['flat.svg']) continue;
  const s = slug(name);
  fs.mkdirSync(path.join(dest, s), { recursive: true });
  for (const [out, file] of Object.entries(files)) if (file) fs.copyFileSync(file, path.join(dest, s, out));
  index.push({
    slug: s,
    name: name,
    glyph: meta.glyph ?? '',
    group: meta.group ?? 'Other',
    keywords: (meta.keywords ?? []).filter((k) => k.toLowerCase() !== name.toLowerCase()),
    styles: Object.keys(files).filter((k) => files[k]).map((k) => k.split('.')[0]),
  });
}
fs.writeFileSync(path.join(dest, 'index.json'), JSON.stringify(index));
console.log(`Saved ${index.length} emoji to ${dest}`);
NODE
du -sh "$DEST" | cut -f1 | xargs echo "Size:"
