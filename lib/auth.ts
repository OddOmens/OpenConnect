// Login for OpenConnect. One password protects everything except /api/health.
//
// - OPENCONNECT_PASSWORD_REQUIRED=false turns the password off entirely (for a dashboard
//   only this computer can reach). Cross-site and DNS-rebinding checks still apply.
// - The password comes from OPENCONNECT_PASSWORD (or a file named by
//   OPENCONNECT_PASSWORD_FILE, for Docker secrets), or is chosen in the browser on first
//   run. First-run setup needs a one-time code printed in the container log, so nobody
//   else on the network can claim a fresh install before you do.
// - Passwords are stored as salted scrypt hashes; sessions as SHA-256 hashes of a random
//   token kept in an HttpOnly, SameSite cookie.
// - Requests that change something are refused when the browser says they came from
//   another site (CSRF), and repeated wrong passwords are slowed down.

import * as crypto from 'crypto';
import * as fs from 'fs';
import { getDb } from './db';
import { getSetting, setSetting } from './config';

export const SESSION_COOKIE = 'oc_session';
const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 10;

const g = globalThis as unknown as {
  __setupCode?: string;
  __loginFailures?: Map<string, { count: number; until: number }>;
  __envPassword?: string | null;
};

// --- On / off ------------------------------------------------------------------------

/** False only when OPENCONNECT_PASSWORD_REQUIRED is explicitly false / 0 / no / off. */
export function authEnabled(): boolean {
  const v = (process.env.OPENCONNECT_PASSWORD_REQUIRED || '').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(v);
}

// --- Password ----------------------------------------------------------------------

/** OPENCONNECT_PASSWORD, or the contents of OPENCONNECT_PASSWORD_FILE. Read once. */
function envPassword(): string | null {
  if (g.__envPassword === undefined) {
    const file = process.env.OPENCONNECT_PASSWORD_FILE;
    let value = process.env.OPENCONNECT_PASSWORD || '';
    if (!value && file) {
      try {
        value = fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
      } catch (err: any) {
        console.error(`[auth] Could not read OPENCONNECT_PASSWORD_FILE (${file}): ${err.message}`);
      }
    }
    g.__envPassword = value || null;
  }
  return g.__envPassword;
}

// OWASP's recommended scrypt cost (64 MiB, ~0.2s). Hashes made with older, cheaper
// parameters still verify, and are upgraded the next time that password signs in.
const SCRYPT = { N: 65536, r: 8, p: 2 };
const SCRYPT_PREFIX = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$`;
const MAXMEM = 256 * 1024 * 1024;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32, { ...SCRYPT, maxmem: MAXMEM });
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return crypto.timingSafeEqual(expected, actual);
}

/** Where the password comes from; null until one has been set. */
export function passwordSource(): 'env' | 'settings' | null {
  if (envPassword()) return 'env';
  return getSetting('auth_password') ? 'settings' : null;
}

export function checkPassword(password: string): boolean {
  const env = envPassword();
  if (env) {
    const a = crypto.createHash('sha256').update(password).digest();
    const b = crypto.createHash('sha256').update(env).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const stored = getSetting('auth_password');
  if (!stored || !verifyHash(password, stored)) return false;
  if (!stored.startsWith(SCRYPT_PREFIX)) setSetting('auth_password', hashPassword(password));
  return true;
}

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 256) return 'That password is too long.';
  return null;
}

/** Set or change the password; signs out every other session. */
export function setPassword(password: string, keepSessionToken?: string) {
  if (passwordSource() === 'env') throw new Error('The password is set by OPENCONNECT_PASSWORD; change it there.');
  setSetting('auth_password', hashPassword(password));
  g.__setupCode = undefined;
  const keep = keepSessionToken ? tokenHash(keepSessionToken) : '';
  getDb().prepare(`DELETE FROM sessions WHERE id_hash != ?`).run(keep);
}

/** The one-time code that first-run setup asks for; logged so only the server's owner sees it. */
export function setupCode(): string | null {
  if (!authEnabled() || passwordSource()) return null;
  if (!g.__setupCode) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
    const pick = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join('');
    g.__setupCode = `${pick()}-${pick()}`;
    console.log(`[auth] No password set yet. Open OpenConnect and enter this setup code: ${g.__setupCode}`);
  }
  return g.__setupCode;
}

/** Startup messages: a warning when protection is off or weak, else the setup code if needed. */
export function logAuthStatus() {
  if (!authEnabled()) {
    console.warn(
      '[auth] WARNING: password protection is OFF (OPENCONNECT_PASSWORD_REQUIRED=false). ' +
        'Anyone who can reach this port sees your sales data and can change settings. ' +
        'Keep BIND_ADDRESS=127.0.0.1 unless every device on your network is trusted.'
    );
    return;
  }
  const env = envPassword();
  if (env && env.length < MIN_PASSWORD_LENGTH) {
    console.warn(`[auth] WARNING: OPENCONNECT_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters. Use a longer one.`);
  }
  setupCode();
}

export function checkSetupCode(code: unknown): boolean {
  const expected = setupCode();
  if (!expected || typeof code !== 'string') return false;
  const a = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// --- Sessions ----------------------------------------------------------------------

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userAgent: string | null): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now.toISOString());
  db.prepare(`INSERT INTO sessions (id_hash, created_at, expires_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)`)
    .run(tokenHash(token), now.toISOString(), expires.toISOString(), now.toISOString(), (userAgent || '').slice(0, 200));
  return token;
}

export function sessionValid(token: string | null | undefined): boolean {
  if (!token || token.length > 100) return false;
  const row = getDb().prepare(`SELECT expires_at FROM sessions WHERE id_hash = ?`).get(tokenHash(token)) as { expires_at: string } | undefined;
  return !!row && row.expires_at > new Date().toISOString();
}

export function deleteSession(token: string | null | undefined) {
  if (token) getDb().prepare(`DELETE FROM sessions WHERE id_hash = ?`).run(tokenHash(token));
}

export function deleteAllSessions() {
  getDb().prepare(`DELETE FROM sessions`).run();
}

// --- Requests ----------------------------------------------------------------------

export function tokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

function isHttps(req: Request) {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

export function sessionCookie(req: Request, token: string | null): string {
  const parts = [
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`,
  ];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

/** Refuse state-changing requests that a browser marks as coming from another site. */
export function crossSite(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return true;
  }
}

/** For API routes: a Response to return when the request isn't allowed, otherwise null. */
export function guard(req: Request): Response | null {
  if (crossSite(req)) return Response.json({ error: 'Cross-site request refused.' }, { status: 403 });
  if (!authEnabled()) {
    if (!trustedHost(req.headers.get('host'))) return Response.json({ error: UNTRUSTED_HOST }, { status: 421 });
    return null;
  }
  if (!sessionValid(tokenFromRequest(req))) return Response.json({ error: 'Not signed in.' }, { status: 401 });
  return null;
}

// --- DNS rebinding (only matters with the password off) -------------------------------
//
// A web page can point its own domain at 127.0.0.1 and then read this dashboard as if it
// were "same site". With a password that gets it nothing (it has no session cookie); without
// one, the Host header is the only tell. Accept local names only, plus OPENCONNECT_ALLOWED_HOSTS.

export const UNTRUSTED_HOST =
  'This hostname is not allowed while password protection is off. Add it to OPENCONNECT_ALLOWED_HOSTS.';

export function trustedHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const extra = (process.env.OPENCONNECT_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(host)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return true; // IPv4 / IPv6 literal
  if (!host.includes('.')) return true; // localhost, single-label LAN names
  return /\.(localhost|local|lan|home\.arpa|internal|ts\.net)$/.test(host);
}

// --- Brute-force protection ----------------------------------------------------------

function clientKey(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'direct';
}

// The client address comes from a header that can be faked, so failures also count
// towards one global limit that a faked header can't escape.
const LIMITS: { key: (req: Request) => string; free: number }[] = [
  { key: clientKey, free: 5 },
  { key: () => '*', free: 20 },
];

/** Seconds to wait before another attempt is allowed (0 = go ahead). */
export function loginBlockedFor(req: Request): number {
  const failures = (g.__loginFailures ??= new Map());
  const until = Math.max(0, ...LIMITS.map((l) => failures.get(l.key(req))?.until || 0));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export function recordLoginResult(req: Request, ok: boolean) {
  const failures = (g.__loginFailures ??= new Map());
  for (const limit of LIMITS) {
    const key = limit.key(req);
    if (ok) {
      failures.delete(key);
      continue;
    }
    const count = (failures.get(key)?.count || 0) + 1;
    // A few free tries, then 30s, 60s, 120s ... up to 15 minutes between attempts.
    const wait = count < limit.free ? 0 : Math.min(15 * 60, 30 * 2 ** (count - limit.free)) * 1000;
    failures.set(key, { count, until: Date.now() + wait });
  }
}
