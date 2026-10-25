import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import {
  getNotifyConfig,
  getSyncConfig,
  getUiPrefs,
  setNotifyConfig,
  setSetting,
  setSyncConfig,
  setUiPrefs,
} from '@/lib/config';
import { resetTokenCache } from '@/lib/asc-client';
import { settingsResponse } from '@/lib/data';
import { syncListingKeywords } from '@/lib/aso';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return NextResponse.json(settingsResponse());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Body may contain any of: { credentials: {...}, sync: {...}, prefs: {...}, notify: {...} } */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const c = body.credentials;
    if (c && typeof c === 'object') {
      // The key path is read as a file, so only accept .p8 files (not any file on the server).
      if (typeof c.private_key_path === 'string' && c.private_key_path.trim() && !/\.p8$/i.test(c.private_key_path.trim())) {
        return NextResponse.json({ error: 'The private key path must point to an AuthKey_….p8 file.' }, { status: 400 });
      }
      for (const key of ['vendor_number', 'key_id', 'issuer_id', 'private_key_path'] as const) {
        if (typeof c[key] === 'string') setSetting(key, c[key].trim());
      }
      if (typeof c.private_key === 'string' && c.private_key.trim()) {
        const pem = c.private_key.trim();
        if (!pem.includes('BEGIN PRIVATE KEY')) {
          return NextResponse.json({ error: 'That does not look like a .p8 private key.' }, { status: 400 });
        }
        setSetting('private_key', pem);
      }
      if (c.clear_private_key === true) setSetting('private_key', null);
      resetTokenCache();
    }
    const tracking = getSyncConfig().trackListingKeywords;
    const sync = body.sync ? setSyncConfig(body.sync) : getSyncConfig();
    // Turning keyword-field tracking on or off applies to the listings already fetched.
    if (sync.trackListingKeywords !== tracking) {
      const apps = getDb().prepare(`SELECT DISTINCT apple_id FROM aso_listings`).all() as { apple_id: string }[];
      apps.forEach((a) => syncListingKeywords(a.apple_id));
    }
    const prefs = body.prefs ? setUiPrefs(body.prefs) : getUiPrefs();
    let notify;
    try {
      notify = body.notify ? setNotifyConfig(body.notify) : getNotifyConfig();
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, sync, prefs, notify });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
