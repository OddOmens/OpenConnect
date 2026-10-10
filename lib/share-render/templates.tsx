// Extra share-card templates: Global Reach, World Map, Rating, Review spotlight, Milestone.
// All share the dashboard's look (colours, card borders, header) with the Overview card.

import type { MapShare, MilestoneShare, RatingShare, ReachShare, ReviewShare } from '@/lib/share';
import {
  AppIcon, CountryCode, DottedWorld, FORMATS, Format, Header, Icon, STAR_COLOR, Stars, Theme, WORLD_H, WORLD_W, WorldPin, fmtCompact, fmtNumber,
} from './kit';

type Icons = (string | null)[];

function layout(format: Format) {
  const { width, height } = FORMATS[format];
  const tall = format === '9x16';
  const pad = tall ? 64 : 56;
  return { width, height, tall, pad, gap: tall ? 28 : 24, inner: width - pad * 2, cardPad: tall ? 36 : 32, headerH: tall ? 120 : 104 };
}

const cardStyle = (theme: Theme) => ({ display: 'flex', background: theme.card, border: `2px solid ${theme.border}`, borderRadius: 20 }) as const;

function Frame({ format, theme, children }: { format: Format; theme: Theme; children: React.ReactNode }) {
  const { width, height, pad, gap } = layout(format);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height, padding: pad, gap, background: theme.background, color: theme.foreground, fontFamily: 'Inter' }}>
      {children}
    </div>
  );
}

function CardTitle({ children, aside, theme, tall }: { children: React.ReactNode; aside?: string; theme: Theme; tall: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52, fontSize: tall ? 30 : 28, fontWeight: 600 }}>
      {children}
      {aside && <span style={{ fontSize: 22, fontWeight: 400, color: theme.muted }}>{aside}</span>}
    </div>
  );
}

function Bar({ value, theme, height = 12, color }: { value: number; theme: Theme; height?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', flex: 1, height, borderRadius: height, background: theme.secondary }}>
      {value > 0 && <div style={{ display: 'flex', width: `${Math.max(1.5, Math.min(100, value * 100))}%`, height, borderRadius: height, background: color ?? theme.chart }} />}
    </div>
  );
}

/** Progress ring with the percentage in the middle. */
function Ring({ value, size, theme }: { value: number; size: number; theme: Theme }) {
  const stroke = size * 0.1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.secondary} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.chart}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ display: 'flex', fontSize: size * 0.24, fontWeight: 600, letterSpacing: -1 }}>{Math.round(value * 100)}%</div>
    </div>
  );
}

function Legend({ items, theme }: { items: { color: string; label: string }[]; theme: Theme }) {
  return (
    <div style={{ display: 'flex', gap: 28, fontSize: 21, color: theme.muted }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 14, background: i.color }} />
          {i.label}
        </div>
      ))}
    </div>
  );
}

/** Fits the map into the space left: as wide as possible, never taller than it has room for. */
function mapWidth(maxWidth: number, maxHeight: number) {
  return Math.floor(Math.min(maxWidth, (maxHeight * WORLD_W) / WORLD_H));
}

const NEW_COLOR = '#10b981';

// --- Global Reach -----------------------------------------------------------------------

export function ReachCard({ data, icons, appIcons, format, theme }: { data: ReachShare; icons: Icons; appIcons: Icons; format: Format; theme: Theme }) {
  const { height, tall, pad, gap, inner, cardPad, headerH } = layout(format);
  const pct = data.total ? data.count / data.total : 0;
  const rows = tall ? 5 : 3;
  const list = data.apps.length ? data.apps.slice(0, rows) : data.latest.slice(0, rows);
  const rowH = tall ? 64 : 56;
  const heroH = tall ? 330 : 280;
  const listH = list.length ? cardPad * 2 + 52 + list.length * rowH : 0;
  const mapCardH = height - pad * 2 - headerH - heroH - listH - gap * (list.length ? 3 : 2);
  const legendH = 44;
  const mw = mapWidth(inner - cardPad * 2 - 4, mapCardH - cardPad * 2 - legendH);
  const reachedPins: WorldPin[] = data.reached.map((code) => ({ code, color: data.newCodes.includes(code) ? NEW_COLOR : theme.chart, r: 0.8 }));

  return (
    <Frame format={format} theme={theme}>
      <Header icons={icons} title={data.title} subtitle={data.subtitle} size={headerH} theme={theme} />

      <div style={{ ...cardStyle(theme), height: heroH, padding: cardPad, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 25, fontWeight: 600, color: theme.muted }}>
            <Icon name="globe" size={25} color={theme.muted} />
            Countries Reached
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
            <span style={{ fontSize: tall ? 150 : 128, fontWeight: 600, letterSpacing: -5, lineHeight: 1.05 }}>{data.count}</span>
            <span style={{ fontSize: tall ? 56 : 48, fontWeight: 600, color: theme.muted, marginLeft: 12 }}>/ {data.total}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 25, color: theme.muted }}>App Store storefronts with downloads</div>
          {data.newInRange > 0 && data.newLabel && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, fontSize: 25, color: theme.up, fontWeight: 600 }}>
              <svg width={18} height={18} viewBox="0 0 10 10" style={{ marginRight: 10 }}>
                <path d="M5 1 9.5 9h-9z" fill={theme.up} />
              </svg>
              {data.newInRange} new {data.newLabel}
            </div>
          )}
        </div>
        <Ring value={pct} size={tall ? 240 : 200} theme={theme} />
      </div>

      <div style={{ ...cardStyle(theme), flexDirection: 'column', height: mapCardH, padding: cardPad, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <DottedWorld width={mw} pins={reachedPins} theme={theme} />
        <Legend
          theme={theme}
          items={[{ color: theme.chart, label: 'Reached' }, ...(data.newCodes.length ? [{ color: NEW_COLOR, label: 'New' }] : []), { color: theme.border, label: 'Not yet' }]}
        />
      </div>

      {list.length > 0 && (
        <div style={{ ...cardStyle(theme), flexDirection: 'column', height: listH, padding: cardPad }}>
          <CardTitle theme={theme} tall={tall} aside={data.apps.length ? `of ${data.total}` : 'first download'}>
            {data.apps.length ? 'By app' : 'Latest countries'}
          </CardTitle>
          {data.apps.length
            ? data.apps.slice(0, rows).map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
                  <AppIcon src={appIcons[i] ?? null} size={rowH - 20} theme={theme} />
                  <div style={{ display: 'flex', width: tall ? 260 : 220, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <Bar value={a.count / data.total} theme={theme} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', width: 90, fontWeight: 600 }}>{a.count}</div>
                </div>
              ))
            : data.latest.slice(0, rows).map((c) => (
                <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
                  <CountryCode code={c.code} theme={theme} />
                  <div style={{ display: 'flex', flex: 1 }}>{c.name}</div>
                  <div style={{ display: 'flex', color: theme.muted }}>{c.when}</div>
                </div>
              ))}
        </div>
      )}
    </Frame>
  );
}

// --- World Map --------------------------------------------------------------------------

export function MapCard({ data, icons, format, theme }: { data: MapShare; icons: Icons; format: Format; theme: Theme }) {
  const { height, tall, pad, gap, inner, cardPad, headerH } = layout(format);
  const rows = tall ? 5 : 3;
  const rowH = tall ? 64 : 56;
  const heroH = tall ? 210 : 180;
  const listH = data.markets.length ? cardPad * 2 + 52 + Math.min(rows, data.markets.length) * rowH : 0;
  const mapCardH = height - pad * 2 - headerH - heroH - listH - gap * (listH ? 3 : 2);
  const mw = mapWidth(inner - cardPad * 2 - 4, mapCardH - cardPad * 2);
  const max = Math.max(1, ...data.pins.map((p) => p.value));
  // Pin size by downloads on a log scale, so small markets still show.
  const pins: WorldPin[] = [...data.pins].reverse().map((p) => ({ code: p.code, color: theme.chart, r: 0.45 + (Math.log10(p.value + 1) / Math.log10(max + 1)) * 1.1 }));

  return (
    <Frame format={format} theme={theme}>
      <Header icons={icons} title={data.title} subtitle={data.subtitle} size={headerH} theme={theme} />

      <div style={{ ...cardStyle(theme), height: heroH, padding: cardPad, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 25, fontWeight: 600, color: theme.muted }}>
            <Icon name="download" size={25} color={theme.muted} />
            First-time downloads
          </div>
          <div style={{ display: 'flex', fontSize: tall ? 110 : 96, fontWeight: 600, letterSpacing: -4, lineHeight: 1.1 }}>{fmtNumber(data.downloads)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: tall ? 72 : 64, fontWeight: 600, letterSpacing: -2 }}>{data.countries}</div>
          <div style={{ display: 'flex', fontSize: 25, color: theme.muted }}>countries</div>
        </div>
      </div>

      <div style={{ ...cardStyle(theme), height: mapCardH, padding: cardPad, alignItems: 'center', justifyContent: 'center' }}>
        <DottedWorld width={mw} pins={pins} theme={theme} />
      </div>

      {listH > 0 && (
        <div style={{ ...cardStyle(theme), flexDirection: 'column', height: listH, padding: cardPad }}>
          <CardTitle theme={theme} tall={tall} aside="Share of first-time downloads">Top Markets</CardTitle>
          {data.markets.slice(0, rows).map((m) => (
            <div key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
              <CountryCode code={m.code} theme={theme} />
              <div style={{ display: 'flex', width: tall ? 300 : 260, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.name}</div>
              <Bar value={m.share / (data.markets[0]?.share || 1)} theme={theme} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 110, fontWeight: 600 }}>{(m.share * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

// --- Rating -----------------------------------------------------------------------------

export function RatingCard({ data, icons, format, theme }: { data: RatingShare; icons: Icons; format: Format; theme: Theme }) {
  const { tall, cardPad, headerH } = layout(format);
  const rows = tall ? 5 : 3;
  const rowH = tall ? 62 : 54;
  const maxDist = Math.max(1, ...data.distribution.map((d) => d.count));
  const top = data.top.slice(0, rows);

  return (
    <Frame format={format} theme={theme}>
      <Header icons={icons} title={data.title} subtitle="App Store rating" size={headerH} theme={theme} />

      {/* The rating itself, big and centred */}
      <div style={{ ...cardStyle(theme), flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: cardPad }}>
        {data.rating != null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: tall ? 240 : 200, fontWeight: 600, letterSpacing: -10, lineHeight: 1 }}>{data.rating.toFixed(2)}</div>
            <div style={{ display: 'flex', marginTop: tall ? 36 : 28 }}>
              <Stars rating={data.rating} size={tall ? 84 : 72} gap={12} theme={theme} />
            </div>
            <div style={{ display: 'flex', marginTop: tall ? 32 : 26, fontSize: tall ? 32 : 28, color: theme.muted }}>
              {fmtNumber(data.ratingCount)} rating{data.ratingCount === 1 ? '' : 's'} · {data.storefronts} storefront{data.storefronts === 1 ? '' : 's'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 40, color: theme.muted }}>No ratings yet</div>
        )}
      </div>

      {data.reviewCount > 0 && (
        <div style={{ ...cardStyle(theme), flexDirection: 'column', padding: cardPad, gap: tall ? 16 : 12 }}>
          <CardTitle theme={theme} tall={tall} aside={`${fmtNumber(data.reviewCount)} written reviews`}>Review breakdown</CardTitle>
          {data.distribution.map((d) => (
            <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: tall ? 26 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 52 }}>
                {d.stars}
                <svg width={22} height={22} viewBox="0 0 24 24">
                  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill={STAR_COLOR} />
                </svg>
              </div>
              <Bar value={d.count / maxDist} theme={theme} color={STAR_COLOR} height={14} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 70, color: theme.muted }}>{d.count}</div>
            </div>
          ))}
        </div>
      )}

      {top.length > 0 && (
        <div style={{ ...cardStyle(theme), flexDirection: 'column', padding: cardPad }}>
          <CardTitle theme={theme} tall={tall} aside="Most ratings">Top storefronts</CardTitle>
          {top.map((c) => (
            <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
              <CountryCode code={c.code} theme={theme} />
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                {c.rating.toFixed(2)}
                <Stars rating={c.rating} size={22} gap={3} theme={theme} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 70, color: theme.muted }}>{c.count}</div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

// --- Review spotlight -------------------------------------------------------------------

export function ReviewCard({ data, icons, reviewAppIcon, format, theme }: { data: ReviewShare; icons: Icons; reviewAppIcon: string | null; format: Format; theme: Theme }) {
  const { tall, cardPad, headerH } = layout(format);
  const r = data.review;
  return (
    <Frame format={format} theme={theme}>
      <Header icons={icons} title={data.title} subtitle="What people are saying" size={headerH} theme={theme} />

      <div style={{ ...cardStyle(theme), flex: 1, flexDirection: 'column', padding: tall ? 64 : 52 }}>
        {r ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Quote centred in the space above the author; short quotes get a larger font. */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: tall ? 220 : 180, lineHeight: 0.8, height: tall ? 120 : 96, color: theme.chart, fontWeight: 800 }}>“</div>
            <Stars rating={r.rating} size={tall ? 56 : 48} gap={8} theme={theme} />
            {r.title && (
              <div style={{ display: 'block', marginTop: tall ? 36 : 28, fontSize: tall ? 50 : 44, fontWeight: 600, letterSpacing: -1, lineHeight: 1.2, lineClamp: 2 }}>{r.title}</div>
            )}
            <div style={{ display: 'block', marginTop: tall ? 28 : 22, fontSize: (tall ? 36 : 32) + (r.body.length < 160 ? 8 : r.body.length < 320 ? 4 : 0), lineHeight: 1.45, color: theme.foreground, opacity: 0.85, lineClamp: tall ? (r.title ? 14 : 16) : r.title ? 9 : 11 }}>
              {r.body}
            </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 28, borderTop: `2px solid ${theme.border}` }}>
              {icons.length > 1 && <AppIcon src={reviewAppIcon} size={56} theme={theme} />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 600 }}>{r.reviewer}</div>
                <div style={{ display: 'flex', fontSize: 23, color: theme.muted }}>
                  {[icons.length > 1 ? r.appName : null, r.country, r.date].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 36, color: theme.muted }}>No 4- or 5-star written reviews yet</div>
        )}
      </div>

      {data.rating != null && (
        <div style={{ ...cardStyle(theme), alignItems: 'center', gap: 20, padding: `${tall ? 30 : 26}px ${cardPad}px` }}>
          <div style={{ display: 'flex', fontSize: tall ? 52 : 46, fontWeight: 600, letterSpacing: -1.5 }}>{data.rating.toFixed(2)}</div>
          <Stars rating={data.rating} size={tall ? 36 : 32} gap={5} theme={theme} />
          <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', fontSize: 24, color: theme.muted }}>
            average from {fmtNumber(data.ratingCount)} rating{data.ratingCount === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </Frame>
  );
}

// --- Milestone --------------------------------------------------------------------------

export function MilestoneCard({ data, icons, format, theme }: { data: MilestoneShare; icons: Icons; format: Format; theme: Theme }) {
  const { tall, inner, cardPad, headerH } = layout(format);
  const tiles = [
    { label: 'Countries reached', value: `${data.countries}`, sub: `of ${data.totalCountries} storefronts` },
    data.rating != null ? { label: 'Average rating', value: data.rating.toFixed(2), sub: `${fmtCompact(data.ratingCount)} ratings`, star: true } : null,
    data.since ? { label: data.apps > 1 ? 'Apps' : 'On the App Store', value: data.apps > 1 ? `${data.apps}` : `since ${data.since}`, sub: data.apps > 1 ? `since ${data.since}` : '' } : null,
  ].filter(Boolean) as { label: string; value: string; sub: string; star?: boolean }[];
  const tileW = (inner - 18 * (tiles.length - 1)) / tiles.length;

  return (
    <Frame format={format} theme={theme}>
      <Header icons={icons} title={data.title} subtitle="All time" size={headerH} theme={theme} />

      <div style={{ ...cardStyle(theme), flex: 1, position: 'relative', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Faint world map behind the number */}
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: tall ? 60 : 30, justifyContent: 'center', opacity: 0.55 }}>
          <DottedWorld width={inner - cardPad * 2} pins={[]} theme={theme} />
        </div>
        <div style={{ display: 'flex', padding: '10px 26px', borderRadius: 999, border: `2px solid ${theme.chart}`, color: theme.chart, fontSize: 24, fontWeight: 600, letterSpacing: 3 }}>
          MILESTONE
        </div>
        <div style={{ display: 'flex', marginTop: tall ? 40 : 30, fontSize: data.milestone >= 100000 ? (tall ? 200 : 170) : tall ? 240 : 210, fontWeight: 800, letterSpacing: -10, lineHeight: 1 }}>
          {fmtNumber(data.milestone)}+
        </div>
        <div style={{ display: 'flex', marginTop: tall ? 28 : 20, fontSize: tall ? 40 : 36, color: theme.muted }}>first-time downloads</div>
      </div>

      <div style={{ display: 'flex', gap: 18 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ ...cardStyle(theme), flexDirection: 'column', justifyContent: 'center', width: tileW, height: tall ? 190 : 170, padding: '0 26px' }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: theme.muted }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: tall ? 52 : 46, fontWeight: 600, letterSpacing: -1.5 }}>
              {t.value}
              {t.star && (
                <svg width={34} height={34} viewBox="0 0 24 24">
                  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill={STAR_COLOR} />
                </svg>
              )}
            </div>
            {t.sub && <div style={{ display: 'flex', marginTop: 4, fontSize: 21, color: theme.muted }}>{t.sub}</div>}
          </div>
        ))}
      </div>
    </Frame>
  );
}
