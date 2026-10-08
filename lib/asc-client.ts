import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import * as zlib from 'zlib';
import { getCredentials } from './config';

const API = 'https://api.appstoreconnect.apple.com';

export class AscError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
  get isPermission() {
    return this.status === 401 || this.status === 403;
  }
}

let cachedToken: { token: string; exp: number; fingerprint: string } | null = null;

/** Folders searched for AuthKey_<KEY_ID>.p8 when no explicit path is configured. */
export function keyDirs(): string[] {
  return [
    process.env.ASC_KEYS_DIR,
    '/keys',
    path.join(process.cwd(), 'keys'),
    path.join(os.homedir(), '.appstoreconnect', 'private_keys'),
  ].filter(Boolean) as string[];
}

function loadPrivateKey(): string {
  const creds = getCredentials();
  if (creds.private_key) {
    return creds.private_key.replace(/\\n/g, '\n');
  }
  if (creds.private_key_path) {
    if (!fs.existsSync(creds.private_key_path)) {
      throw new AscError(0, `Private key file not found at: ${creds.private_key_path}`);
    }
    return fs.readFileSync(creds.private_key_path, 'utf8');
  }
  const file = `AuthKey_${creds.key_id}.p8`;
  for (const dir of keyDirs()) {
    const candidate = path.join(dir, file);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new AscError(0, `No private key found. Put ${file} in the keys/ folder, set its path, or paste it in Settings.`);
}

export function generateToken(): string {
  const { key_id, issuer_id } = getCredentials();
  if (!key_id || !issuer_id) {
    throw new AscError(0, 'Missing App Store Connect Key ID or Issuer ID. Please check Settings.');
  }
  const fingerprint = `${key_id}:${issuer_id}`;
  if (cachedToken && cachedToken.fingerprint === fingerprint && Date.now() < cachedToken.exp) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 1140; // 19 minutes (max is 20)
  const token = jwt.sign({ iss: issuer_id, iat: now, exp, aud: 'appstoreconnect-v1' }, loadPrivateKey(), {
    algorithm: 'ES256',
    keyid: key_id,
    header: { alg: 'ES256', kid: key_id, typ: 'JWT' },
  });
  cachedToken = { token, exp: (exp - 60) * 1000, fingerprint };
  return token;
}

export function resetTokenCache() {
  cachedToken = null;
}

async function errorFrom(res: Response): Promise<AscError> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    const e = body?.errors?.[0];
    if (e) detail = e.detail || e.title || detail;
  } catch {
    // non-JSON body
  }
  if (res.status === 403 || res.status === 401) {
    detail = `${detail} (HTTP ${res.status}). The API key needs the right role in App Store Connect → Users and Access → Integrations.`;
  }
  return new AscError(res.status, detail);
}

async function ascFetch(url: string, accept = 'application/json', attempt = 0): Promise<Response> {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    headers: { Authorization: `Bearer ${generateToken()}`, Accept: accept },
    cache: 'no-store',
  });
  // Rate limited or transient server error: back off and retry a few times.
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    return ascFetch(url, accept, attempt + 1);
  }
  return res;
}

async function ascGetAll(path: string): Promise<{ data: any[]; included: any[] }> {
  const data: any[] = [];
  const included: any[] = [];
  let next: string | null = path;
  while (next) {
    const res = await ascFetch(next);
    if (!res.ok) throw await errorFrom(res);
    const body = await res.json();
    data.push(...(body.data || []));
    included.push(...(body.included || []));
    next = body.links?.next || null;
  }
  return { data, included };
}

export interface AscApp {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
}

export async function fetchApps(): Promise<AscApp[]> {
  const { data } = await ascGetAll('/v1/apps?limit=200&fields[apps]=name,bundleId,sku,primaryLocale');
  return data.map((app) => ({
    id: app.id,
    name: app.attributes.name,
    bundleId: app.attributes.bundleId,
    sku: app.attributes.sku,
  }));
}

export type ReportType = 'SALES' | 'SUBSCRIPTION' | 'SUBSCRIPTION_EVENT';

const REPORT_VERSIONS: Record<ReportType, string[]> = {
  SALES: ['1_0'],
  SUBSCRIPTION: ['1_3', '1_4'],
  SUBSCRIPTION_EVENT: ['1_3', '1_4'],
};

export type ReportResult = { status: 'ok'; rows: Record<string, string>[] } | { status: 'empty' };

/**
 * Fetch one SUMMARY report. `reportDate` is YYYY-MM-DD for DAILY, YYYY-MM for MONTHLY.
 * Apple answers 404 when there is no data for that date (or it isn't published yet).
 */
export async function fetchReport(
  vendorNumber: string,
  reportType: ReportType,
  frequency: 'DAILY' | 'MONTHLY',
  reportDate: string
): Promise<ReportResult> {
  let lastErr: AscError | null = null;
  for (const version of REPORT_VERSIONS[reportType]) {
    const params = new URLSearchParams({
      'filter[frequency]': frequency,
      'filter[reportDate]': reportDate,
      'filter[reportSubType]': 'SUMMARY',
      'filter[reportType]': reportType,
      'filter[vendorNumber]': vendorNumber,
      'filter[version]': version,
    });
    const res = await ascFetch(`/v1/salesReports?${params}`, 'application/a-gzip, application/json');
    if (res.status === 404) return { status: 'empty' };
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return { status: 'ok', rows: parseTsvReport(buffer) };
    }
    lastErr = await errorFrom(res);
    // An unsupported report version is a 400 mentioning the version; try the next one.
    if (!(res.status === 400 && /version/i.test(lastErr.message))) break;
  }
  throw lastErr!;
}

export function parseTsvReport(buffer: Buffer): Record<string, string>[] {
  let text: string;
  try {
    text = zlib.gunzipSync(buffer).toString('utf8');
  } catch {
    text = buffer.toString('utf8');
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    // Apple appends a "Total_Rows" style trailer to some reports; skip short lines.
    if (values.length < Math.min(headers.length, 3)) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }
  return rows;
}

export interface AscReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewer: string;
  createdDate: string;
  territory: string; // alpha-3
  responseBody: string | null;
  responseDate: string | null;
}

/**
 * Newest-first customer reviews. Stops paging once it reaches a review we already
 * have, so routine syncs only download what is new.
 */
export async function fetchCustomerReviews(appId: string, knownIds: Set<string>): Promise<AscReview[]> {
  const out: AscReview[] = [];
  let next: string | null =
    `/v1/apps/${appId}/customerReviews?limit=200&sort=-createdDate&include=response` +
    `&fields[customerReviews]=rating,title,body,reviewerNickname,createdDate,territory,response` +
    `&fields[customerReviewResponses]=responseBody,lastModifiedDate`;

  while (next) {
    const res = await ascFetch(next);
    if (!res.ok) throw await errorFrom(res);
    const body = await res.json();
    const responses = new Map<string, any>(
      (body.included || []).filter((i: any) => i.type === 'customerReviewResponses').map((i: any) => [i.id, i])
    );
    let reachedKnown = false;
    for (const r of body.data || []) {
      if (knownIds.has(r.id)) {
        reachedKnown = true;
        continue;
      }
      const respId = r.relationships?.response?.data?.id;
      const resp = respId ? responses.get(respId) : null;
      out.push({
        id: r.id,
        rating: r.attributes.rating,
        title: r.attributes.title || '',
        body: r.attributes.body || '',
        reviewer: r.attributes.reviewerNickname || '',
        createdDate: r.attributes.createdDate,
        territory: r.attributes.territory,
        responseBody: resp?.attributes?.responseBody ?? null,
        responseDate: resp?.attributes?.lastModifiedDate ?? null,
      });
    }
    next = reachedKnown ? null : body.links?.next || null;
  }
  return out;
}

/** Cheap call used by the Settings "Test connection" button. */
export async function testConnection(vendorNumber: string) {
  const result = { apps: false, sales: false, reviews: false, message: '' };
  try {
    const apps = await fetchApps();
    result.apps = true;
    if (apps[0]) {
      try {
        await fetchCustomerReviews(apps[0].id, new Set(['__stop__']));
        result.reviews = true;
      } catch (e: any) {
        result.message = `Reviews: ${e.message}`;
      }
    }
  } catch (e: any) {
    result.message = e.message;
    return result;
  }
  if (!vendorNumber) {
    result.message = 'Vendor number is not set.';
    return result;
  }
  try {
    const d = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
    await fetchReport(vendorNumber, 'SALES', 'DAILY', d);
    result.sales = true;
  } catch (e: any) {
    result.message = `Sales reports: ${e.message}`;
  }
  return result;
}
