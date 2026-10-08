import { NextResponse } from 'next/server';
import {
  credentialSources,
  getCredentials,
  getSyncConfig,
  getUiPrefs,
  setSetting,
  setSyncConfig,
  setUiPrefs,
} from '@/lib/config';
import { resetTokenCache } from '@/lib/asc-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const creds = getCredentials();
    return NextResponse.json({
      credentials: {
        key_id: creds.key_id,
        issuer_id: creds.issuer_id,
        private_key_path: creds.private_key_path,
        vendor_number: creds.vendor_number,
        // Never send the key itself back to the browser.
        has_private_key: !!creds.private_key,
      },
      sources: credentialSources(),
      sync: getSyncConfig(),
      prefs: getUiPrefs(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Body may contain any of: { credentials: {...}, sync: {...}, prefs: {...} } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const c = body.credentials;
    if (c && typeof c === 'object') {
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
    const sync = body.sync ? setSyncConfig(body.sync) : getSyncConfig();
    const prefs = body.prefs ? setUiPrefs(body.prefs) : getUiPrefs();
    return NextResponse.json({ success: true, sync, prefs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
