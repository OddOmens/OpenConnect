// The original share card: big number + chart, KPI tiles, and top markets / top apps.

import type { ShareData } from '@/lib/share';
import type { ShareStatId } from '@/lib/prefs';
import { AppIcon, Change, Chart, FORMATS, Format, Icon, Theme, fmtCompact, fmtNumber } from './kit';

// Tile labels when four sit side by side and the full names don't fit.
const SHORT_LABELS: Record<ShareStatId, string> = {
  proceeds: 'Proceeds',
  rating: 'Rating',
  impressions: 'Impressions',
  pageViews: 'Page Views',
  redownloads: 'Redownloads',
  iap: 'Purchases',
  bestRank: 'Best Rank',
  storefronts: 'Storefronts',
  updates: 'Updates',
  reach: 'Reach',
};

export function OverviewCard({ data, icons, format, theme, showList }: { data: ShareData; icons: (string | null)[]; format: Format; theme: Theme; showList: boolean }) {
  const { width, height } = FORMATS[format];
  const tall = format === '9x16';
  const pad = tall ? 64 : 56;
  const gap = tall ? 28 : 24;
  const inner = width - pad * 2;
  const cardPad = tall ? 36 : 32;
  const radius = 20; // the app's 0.5rem, scaled to this canvas
  const cardStyle = { display: 'flex', background: theme.card, border: `2px solid ${theme.border}`, borderRadius: radius } as const;

  // KPI tiles: up to 4 (one row) in 4:5 and 6 (two rows of 3) in 9:16, spread evenly over
  // the rows so a row never ends with a lone tile (4 tiles in 9:16 = 2 + 2).
  const tiles = data.stats.slice(0, tall ? 6 : 4);
  const rows = tiles.length ? Math.ceil(tiles.length / (tall ? 3 : 4)) : 0;
  const tileRows: (typeof tiles)[] = [];
  for (let r = 0, i = 0; r < rows; r++) {
    const take = Math.ceil((tiles.length - i) / (rows - r));
    tileRows.push(tiles.slice(i, i + take));
    i += take;
  }
  const tileGap = tall ? 20 : 18;
  const tileH = tall ? 180 : 168;

  const listKind = data.topApps.length ? 'apps' : 'markets';
  const listRows = showList ? (listKind === 'apps' ? data.topApps : data.markets).slice(0, tall ? 5 : 3) : [];
  const rowH = tall ? 66 : 58;

  // Vertical budget: everything is fixed except the hero card, which takes the rest.
  const headerH = tall ? 120 : 104;
  const tilesH = rows ? rows * tileH + (rows - 1) * tileGap : 0;
  const listH = listRows.length ? cardPad * 2 + 52 + listRows.length * rowH : 0;
  const sections = 1 + (tilesH ? 1 : 0) + (listH ? 1 : 0);
  const heroH = height - pad * 2 - headerH - tilesH - listH - gap * sections;
  const heroTopH = (tall ? 34 : 32) + (tall ? 150 : 124) + (data.hero.change != null || data.hero.delta != null ? 44 : 0) + 24;
  const chartH = heroH - cardPad * 2 - heroTopH;

  const mosaic = icons.length > 1;
  const iconSize = headerH;
  const sub = Math.round((iconSize - 8) / 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height, padding: pad, gap, background: theme.background, color: theme.foreground, fontFamily: 'Inter' }}>
      {/* Header, like the sidebar's app row */}
      <div style={{ display: 'flex', alignItems: 'center', height: headerH, gap: 28 }}>
        {mosaic ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', width: iconSize, height: iconSize, gap: 8 }}>
            {icons.slice(0, 4).map((src, i) => <AppIcon key={i} src={src} size={sub} theme={theme} />)}
          </div>
        ) : (
          <AppIcon src={icons[0] ?? null} size={iconSize} theme={theme} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: tall ? 56 : 50, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {data.title}
          </div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: tall ? 27 : 25, color: theme.muted }}>
            {data.rangeLabel}
            {data.period ? ` · ${data.period}` : ''}
          </div>
        </div>
      </div>

      {/* Hero KPI + history chart */}
      <div style={{ ...cardStyle, flexDirection: 'column', height: heroH, padding: cardPad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: tall ? 34 : 32, fontSize: tall ? 27 : 25, fontWeight: 600, color: theme.muted }}>
          <Icon name={data.hero.icon} size={tall ? 27 : 25} color={theme.muted} />
          {data.hero.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: tall ? 150 : 124, fontSize: tall ? 136 : 112, fontWeight: 600, letterSpacing: tall ? -5 : -4 }}>
          {data.hero.value}
        </div>
        {(data.hero.change != null || data.hero.delta != null) && (
          <div style={{ display: 'flex', height: 44 }}>
            <Change value={data.hero.change} delta={data.hero.delta} label={data.compareLabel} size={tall ? 28 : 26} theme={theme} />
          </div>
        )}
        <div style={{ display: 'flex', height: 24 }} />
        <Chart series={data.series} granularity={data.granularity} width={inner - cardPad * 2 - 4} height={Math.max(120, chartH)} theme={theme} />
      </div>

      {/* KPI tiles, like the dashboard's KPI cards */}
      {tileRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tileGap }}>
          {tileRows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: tileGap }}>
          {row.map((s) => (
            <div key={s.id} style={{ ...cardStyle, flexDirection: 'column', justifyContent: 'center', width: (inner - tileGap * (row.length - 1)) / row.length, height: tileH, padding: `0 ${tall ? 28 : 24}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: row.length >= 4 ? 8 : 10, fontSize: row.length >= 4 ? 20 : 22, fontWeight: 600, color: theme.muted }}>
                <Icon name={s.icon} size={row.length >= 4 ? 20 : 22} color={theme.muted} />
                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.length >= 4 ? SHORT_LABELS[s.id] : s.label}</span>
              </div>
              <div style={{ display: 'flex', marginTop: 10, fontSize: tall ? 54 : 48, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ display: 'flex', marginTop: 8, height: 26 }}>
                {s.change != null || s.delta != null ? (
                  <Change value={s.change} delta={s.delta} label="" size={21} theme={theme} />
                ) : (
                  s.hint && <span style={{ fontSize: 21, color: theme.muted }}>{s.hint}</span>
                )}
              </div>
            </div>
          ))}
          </div>
          ))}
        </div>
      )}

      {/* Top apps (All Apps) or top markets (one app), like the dashboard's tables */}
      {listRows.length > 0 && (
        <div style={{ ...cardStyle, flexDirection: 'column', height: listH, padding: cardPad }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52, fontSize: tall ? 30 : 28, fontWeight: 600 }}>
            {listKind === 'apps' ? 'Top Apps' : 'Top Markets'}
            <span style={{ fontSize: 22, fontWeight: 400, color: theme.muted }}>{listKind === 'apps' ? 'First-time downloads' : 'Share of downloads'}</span>
          </div>
          {listRows.map((row: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: rowH, borderTop: `2px solid ${theme.border}`, fontSize: tall ? 28 : 26 }}>
              {listKind === 'apps' ? (
                <AppIcon src={row.iconData} size={rowH - 18} theme={theme} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 58, height: 36, borderRadius: 8, background: theme.secondary, fontSize: 19, fontWeight: 600 }}>{row.code}</div>
              )}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.name}</div>
              {listKind === 'markets' && <div style={{ display: 'flex', color: theme.muted }}>{fmtNumber(row.downloads)}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 120, fontWeight: 600 }}>
                {listKind === 'apps' ? fmtCompact(row.downloads) : `${(row.share * 100).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

