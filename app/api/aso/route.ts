import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { addKeywords, addNote, asoOverview, asoPortfolio, editListing, rankAppKeywords, removeKeyword, removeNote, syncListing, type ListingEdit } from '@/lib/aso';
import { AscError } from '@/lib/asc-client';
import { TERRITORY_BY_CODE } from '@/lib/territories';

export const dynamic = 'force-dynamic';

const isApp = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v);
const isCountry = (v: unknown): v is string => typeof v === 'string' && v in TERRITORY_BY_CODE;

/**
 * Everything the ASO page shows for one app: GET /api/aso?app=<id>&country=US&days=30. Without
 * an app (or app=all), one summary row per visible app. Also open to API tokens with the
 * Marketing or ASO changes scope.
 */
export function GET(request: Request) {
  const denied = guard(request, { apiToken: ['marketing', 'aso'] });
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const app = q.get('app');
  const country = isCountry(q.get('country')) ? q.get('country')! : 'US';
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  if (!app || app === 'all') {
    try {
      return NextResponse.json({ days, apps: asoPortfolio(days) });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (!isApp(app)) return NextResponse.json({ error: 'Which app?' }, { status: 400 });
  try {
    const data = asoOverview(app, country, days);
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'No such app.' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Body: { action: 'refresh', app, country } fetches the listing from App Store Connect (which
 * also updates the keywords tracked from its keyword fields) and ranks the app's keywords: the
 * country's before responding, the other storefronts' in the background; 'add-keywords'
 * { app, country, keywords: string[] }; 'remove-keyword' { app, country, keyword } (added by hand
 * only); 'add-note' { app, date, note }; 'remove-note' { id }; 'update-listing' { app, locale,
 * changes: { keywords?, subtitle?, … }, apply? } plans a change in App Store Connect, and makes it
 * with apply: true. Also open to API tokens with the ASO changes scope.
 */
export async function POST(request: Request) {
  const denied = guard(request, { apiToken: 'aso' });
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
        const ranks = await rankAppKeywords(body.app, isCountry(body.country) ? body.country : 'US');
        return NextResponse.json({ success: !listingError, error: listingError, ...ranks });
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
        if (!removeKeyword(body.app, body.country, body.keyword)) {
          return NextResponse.json({ error: 'That keyword is in the listing’s keyword field. It stops being tracked when you take it out there.' }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      case 'add-note':
        if (!isApp(body.app) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || typeof body.note !== 'string' || !body.note.trim()) break;
        addNote(body.app, body.date, body.note);
        return NextResponse.json({ success: true });
      case 'update-listing': {
        if (!isApp(body.app) || typeof body.locale !== 'string' || !/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/.test(body.locale) || typeof body.changes !== 'object' || !body.changes) break;
        try {
          return NextResponse.json(await editListing(body.app, body.locale, body.changes as ListingEdit, body.apply === true));
        } catch (err: any) {
          const error = err instanceof AscError && err.isPermission
            ? 'Changing App Store listings needs an API key with the App Manager role, or Admin.'
            : err.message;
          return NextResponse.json({ error }, { status: err instanceof AscError ? 502 : 400 });
        }
      }
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
