import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { addKeywords, addNote, asoOverview, checkKeyword, removeKeyword, removeNote, syncListing } from '@/lib/aso';
import { AscError } from '@/lib/asc-client';
import { getDb } from '@/lib/db';
import { TERRITORY_BY_CODE } from '@/lib/territories';

export const dynamic = 'force-dynamic';

const isApp = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v);
const isCountry = (v: unknown): v is string => typeof v === 'string' && v in TERRITORY_BY_CODE;

/**
 * Everything the ASO page shows for one app: GET /api/aso?app=<id>&country=US&days=30.
 * Also open to API tokens with the Marketing scope.
 */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: 'marketing' });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const app = q.get('app');
  if (!isApp(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  const country = isCountry(q.get('country')) ? q.get('country')! : 'US';
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  try {
    const data = asoOverview(app, country, days);
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'No such app.' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Body: { action: 'refresh', app } fetches the listing from App Store Connect and checks the
 * app's keywords now; 'add-keywords' { app, country, keywords: string[] }; 'remove-keyword'
 * { app, country, keyword }; 'add-note' { app, date, note }; 'remove-note' { id }.
 */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  try {
    switch (body?.action) {
      case 'refresh': {
        if (!isApp(body.app)) break;
        let listingError: string | null = null;
        try {
          await syncListing(body.app);
        } catch (err: any) {
          listingError = err instanceof AscError && err.isPermission
            ? 'Reading App Store listings needs an API key with the App Manager, Developer or Marketing role, or Admin.'
            : err.message;
        }
        const pairs = getDb().prepare(`SELECT country, keyword FROM aso_keywords WHERE apple_id = ?`).all(body.app) as { country: string; keyword: string }[];
        for (const p of pairs) await checkKeyword(p.country, p.keyword).catch(() => {});
        return NextResponse.json({ success: !listingError, error: listingError });
      }
      case 'add-keywords': {
        if (!isApp(body.app) || !isCountry(body.country)) break;
        const list: string[] = (Array.isArray(body.keywords) ? body.keywords : String(body.keywords || '').split(','))
          .filter((k: unknown) => typeof k === 'string')
          .slice(0, 30);
        return NextResponse.json({ success: true, ...(await addKeywords(body.app, body.country, list)) });
      }
      case 'remove-keyword':
        if (!isApp(body.app) || !isCountry(body.country) || typeof body.keyword !== 'string') break;
        removeKeyword(body.app, body.country, body.keyword);
        return NextResponse.json({ success: true });
      case 'add-note':
        if (!isApp(body.app) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || typeof body.note !== 'string' || !body.note.trim()) break;
        addNote(body.app, body.date, body.note);
        return NextResponse.json({ success: true });
      case 'remove-note':
        if (!Number.isInteger(body.id)) break;
        removeNote(body.id);
        return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
