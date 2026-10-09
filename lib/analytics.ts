// App Store impressions and product page views, from the Analytics Reports API.
//
// Apple generates these reports per app once a "report request" exists: an ONGOING
// request yields new instances every day, a ONE_TIME_SNAPSHOT request yields the history
// (from 2024-01-01). Only an Admin key can create requests; any Sales key can read them.
// Each instance is downloaded once (analytics_instances); for a given app + date, the
// instance with the newest processing date wins, as Apple's completeness rules require.

import * as zlib from 'zlib';
import { getDb } from './db';
import { AscError, ascGetAll, ascPost } from './asc-client';
import { mapLimit } from './itunes-client';
import type { JobState } from './sync';

const REPORT_NAME = 'App Store Discovery and Engagement Standard';
const GRANULARITIES = ['DAILY', 'MONTHLY'] as const;
type Granularity = (typeof GRANULARITIES)[number];
type AccessType = 'ONGOING' | 'ONE_TIME_SNAPSHOT';

interface ReportRequest {
  id: string;
  accessType: AccessType;
  stopped: boolean;
}

interface Instance {
  id: string;
  appId: string;
  granularity: Granularity;
  processingDate: string;
}

async function reportRequests(appId: string): Promise<ReportRequest[]> {
  const { data } = await ascGetAll(`/v1/apps/${appId}/analyticsReportRequests?limit=200`);
  return data.map((d) => ({ id: d.id, accessType: d.attributes.accessType, stopped: !!d.attributes.stoppedDueToInactivity }));
}

async function createRequest(appId: string, accessType: AccessType) {
  await ascPost('/v1/analyticsReportRequests', {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
}

/** New (not yet imported) instances of the engagement report, across all of an app's requests. */
async function newInstances(appId: string, requests: ReportRequest[]): Promise<Instance[]> {
  const known = new Set(
    (getDb().prepare(`SELECT id FROM analytics_instances WHERE apple_id = ?`).all(appId) as { id: string }[]).map((r) => r.id)
  );
  const out: Instance[] = [];
  for (const req of requests) {
    const { data: reports } = await ascGetAll(
      `/v1/analyticsReportRequests/${req.id}/reports?filter[category]=APP_STORE_ENGAGEMENT&limit=200`
    );
    const report = reports.find((r) => r.attributes?.name === REPORT_NAME);
    if (!report) continue; // not generated yet (takes 1-2 days after the request)
    for (const granularity of GRANULARITIES) {
      const { data } = await ascGetAll(`/v1/analyticsReports/${report.id}/instances?filter[granularity]=${granularity}&limit=200`);
      for (const i of data) {
        if (!known.has(i.id)) out.push({ id: i.id, appId, granularity, processingDate: i.attributes.processingDate });
      }
    }
  }
  return out.sort((a, b) => a.processingDate.localeCompare(b.processingDate));
}

/** Tab- or comma-separated text with a header row; handles quoted fields. */
export function parseDelimited(text: string): Record<string, string>[] {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((values) => Object.fromEntries(keys.map((k, j) => [k, (values[j] ?? '').trim()])));
}

async function downloadInstance(instanceId: string): Promise<Record<string, string>[]> {
  const { data: segments } = await ascGetAll(`/v1/analyticsReportInstances/${instanceId}/segments?limit=200`);
  const rows: Record<string, string>[] = [];
  for (const seg of segments) {
    // Pre-signed URL: no Authorization header.
    const res = await fetch(seg.attributes.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Analytics segment download failed (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    let text: string;
    try {
      text = zlib.gunzipSync(buffer).toString('utf8');
    } catch {
      text = buffer.toString('utf8');
    }
    rows.push(...parseDelimited(text));
  }
  return rows;
}

interface EngagementRow {
  date: string;
  territory: string;
  event: string;
  page_type: string;
  source_type: string;
  engagement_type: string;
  counts: number;
}

/** Store one instance: per date, replace what we hold unless it came from a newer instance. */
function importInstance(inst: Instance, rows: Record<string, string>[]) {
  const db = getDb();
  // Sum over device and OS version, which the dashboard doesn't use.
  const sums = new Map<string, EngagementRow>();
  for (const r of rows) {
    const date = (r['Date'] || '').slice(0, 10);
    if (!date) continue;
    const key = [date, r['Territory'], r['Event'], r['Page Type'], r['Source Type'], r['Engagement Type']].join('\u0001');
    const entry = sums.get(key) || {
      date,
      territory: r['Territory'] || '',
      event: r['Event'] || '',
      page_type: r['Page Type'] || '',
      source_type: r['Source Type'] || '',
      engagement_type: r['Engagement Type'] || '',
      counts: 0,
    };
    entry.counts += parseInt((r['Counts'] || '0').replace(/,/g, ''), 10) || 0;
    sums.set(key, entry);
  }
  const byDate = new Map<string, EngagementRow[]>();
  sums.forEach((v) => byDate.set(v.date, [...(byDate.get(v.date) || []), v]));

  const newest = db.prepare(`SELECT MAX(processing_date) AS p FROM engagement_raw WHERE apple_id = ? AND granularity = ? AND date = ?`);
  const remove = db.prepare(`DELETE FROM engagement_raw WHERE apple_id = ? AND granularity = ? AND date = ?`);
  const insert = db.prepare(`
    INSERT INTO engagement_raw (granularity, date, apple_id, territory, event, page_type, source_type, engagement_type, counts, processing_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    byDate.forEach((list, date) => {
      const held = (newest.get(inst.appId, inst.granularity, date) as { p: string | null }).p;
      if (held && held > inst.processingDate) return;
      remove.run(inst.appId, inst.granularity, date);
      for (const v of list) {
        insert.run(inst.granularity, date, inst.appId, v.territory, v.event, v.page_type, v.source_type, v.engagement_type, v.counts, inst.processingDate);
      }
    });
    db.prepare(`INSERT OR REPLACE INTO analytics_instances (id, apple_id, granularity, processing_date, rows) VALUES (?, ?, ?, ?, ?)`)
      .run(inst.id, inst.appId, inst.granularity, inst.processingDate, rows.length);
  })();
}

/**
 * Daily rows from the first whole month we hold them (per app), monthly rows before
 * that; daily rows also fill any month that has no monthly row. Never both for a month.
 */
export function rebuildEngagement() {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM engagement`).run();
    db.prepare(`
      WITH first_daily AS (
        SELECT apple_id, MIN(date) AS d FROM engagement_raw WHERE granularity = 'DAILY' GROUP BY apple_id
      ),
      full_from AS (
        SELECT apple_id, CASE WHEN substr(d, 9, 2) = '01' THEN substr(d, 1, 7)
                              ELSE substr(date(d, 'start of month', '+1 month'), 1, 7) END AS month
        FROM first_daily
      )
      INSERT INTO engagement (granularity, date, apple_id, territory, event, page_type, source_type, engagement_type, counts)
      SELECT CASE r.granularity WHEN 'DAILY' THEN 'D' ELSE 'M' END, r.date, r.apple_id, r.territory, r.event,
             r.page_type, r.source_type, r.engagement_type, r.counts
      FROM engagement_raw r LEFT JOIN full_from f ON f.apple_id = r.apple_id
      WHERE (r.granularity = 'DAILY' AND (
               substr(r.date, 1, 7) >= f.month
               OR NOT EXISTS (SELECT 1 FROM engagement_raw m WHERE m.granularity = 'MONTHLY' AND m.apple_id = r.apple_id
                              AND substr(m.date, 1, 7) = substr(r.date, 1, 7))))
         OR (r.granularity = 'MONTHLY' AND (f.month IS NULL OR substr(r.date, 1, 7) < f.month))`).run();
  })();
}

export async function syncEngagement(state: JobState, appIds: string[]) {
  state.phase = 'Fetching App Store impressions & page views';
  state.total = appIds.length;
  state.done = 0;
  let imported = 0;
  let pending = 0;
  let needsAdmin = false;

  for (const appId of appIds) {
    try {
      let requests = await reportRequests(appId);
      const wanted: AccessType[] = [];
      if (!requests.some((r) => r.accessType === 'ONGOING' && !r.stopped)) wanted.push('ONGOING');
      if (!requests.some((r) => r.accessType === 'ONE_TIME_SNAPSHOT')) wanted.push('ONE_TIME_SNAPSHOT');
      for (const accessType of wanted) {
        try {
          await createRequest(appId, accessType);
          pending++;
        } catch (err) {
          if (err instanceof AscError && err.isPermission) needsAdmin = true;
          else if (!(err instanceof AscError && err.status === 409)) throw err; // 409: already requested
        }
      }
      if (wanted.length) requests = await reportRequests(appId);

      // Stored as each download finishes: "newest processing date wins" doesn't depend on order.
      const instances = await newInstances(appId, requests);
      await mapLimit(instances, 6, async (inst) => {
        importInstance(inst, await downloadInstance(inst.id));
        imported++;
      });
    } catch (err: any) {
      state.errors.push(`Impressions for app ${appId}: ${err.message}`);
      if (err instanceof AscError && err.isPermission) break;
    }
    state.done++;
  }

  rebuildEngagement();
  if (needsAdmin) {
    state.errors.push(
      'Impressions and page views need a one-time setup: only an Admin API key can ask Apple to start generating ' +
        'analytics reports. Enter an Admin key in Settings and sync once; afterwards your Sales key can download them.'
    );
  }
  return { imported, pending };
}
