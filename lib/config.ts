import { getDb } from './db';
import { DEFAULT_NOTIFY_CONFIG, DEFAULT_SYNC_CONFIG, NotifyConfig, SyncConfig, UiPrefs, mergePrefs } from './prefs';

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string | null) {
  const db = getDb();
  if (value === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return;
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getJson<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Credentials: environment variables win (that is how a container is configured);
// anything not set in the environment can be filled in from the Settings dialog.
const CREDENTIAL_ENV = {
  key_id: 'ASC_KEY_ID',
  issuer_id: 'ASC_ISSUER_ID',
  private_key_path: 'ASC_PRIVATE_KEY_PATH',
  vendor_number: 'ASC_VENDOR_NUMBER',
} as const;
export type CredentialKey = keyof typeof CREDENTIAL_ENV;

export interface Credentials {
  key_id: string;
  issuer_id: string;
  private_key_path: string;
  private_key: string; // pasted .p8 contents, alternative to a path
  vendor_number: string;
}

export function getCredentials(): Credentials {
  const pick = (k: CredentialKey) => (process.env[CREDENTIAL_ENV[k]] || '').trim() || getSetting(k) || '';
  return {
    key_id: pick('key_id'),
    issuer_id: pick('issuer_id'),
    private_key_path: pick('private_key_path'),
    private_key: (process.env.ASC_PRIVATE_KEY || '').trim() || getSetting('private_key') || '',
    vendor_number: pick('vendor_number'),
  };
}

export function credentialSources(): Record<CredentialKey | 'private_key', 'env' | 'settings' | 'unset'> {
  const src = (envName: string, key: string) =>
    (process.env[envName] || '').trim() ? 'env' : getSetting(key) ? 'settings' : 'unset';
  return {
    key_id: src(CREDENTIAL_ENV.key_id, 'key_id'),
    issuer_id: src(CREDENTIAL_ENV.issuer_id, 'issuer_id'),
    private_key_path: src(CREDENTIAL_ENV.private_key_path, 'private_key_path'),
    private_key: src('ASC_PRIVATE_KEY', 'private_key'),
    vendor_number: src(CREDENTIAL_ENV.vendor_number, 'vendor_number'),
  };
}

export function getSyncConfig(): SyncConfig {
  return { ...DEFAULT_SYNC_CONFIG, ...(getJson<Partial<SyncConfig>>('sync_config') || {}) };
}

export function setSyncConfig(patch: Partial<SyncConfig>) {
  const next = { ...getSyncConfig(), ...patch };
  next.autoSyncHours = Math.max(0, Number(next.autoSyncHours) || 0);
  next.storeSyncHours = Math.max(0, Number(next.storeSyncHours) || 0);
  setSetting('sync_config', JSON.stringify(next));
  return next;
}

export function getNotifyConfig(): NotifyConfig {
  return { ...DEFAULT_NOTIFY_CONFIG, ...(getJson<Partial<NotifyConfig>>('notify_config') || {}) };
}

export function setNotifyConfig(patch: Partial<NotifyConfig>) {
  const next = { ...getNotifyConfig(), ...patch };
  for (const k of ['signalUrl', 'signalNumber', 'signalTo'] as const) next[k] = String(next[k] || '').trim();
  while (next.signalUrl.endsWith('/')) next.signalUrl = next.signalUrl.slice(0, -1);
  if (next.signalUrl && !/^https?:\/\/[^/]+/i.test(next.signalUrl)) throw new Error('The Signal API address must start with http:// or https://.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.recapTime)) next.recapTime = DEFAULT_NOTIFY_CONFIG.recapTime;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: next.timezone });
  } catch {
    throw new Error(`Unknown time zone “${next.timezone}”.`);
  }
  next.chartEntries = !!next.chartEntries;
  next.recap = !!next.recap;
  setSetting('notify_config', JSON.stringify(next));
  return next;
}

export function getUiPrefs(): UiPrefs {
  return mergePrefs(getJson<Partial<UiPrefs>>('ui_prefs'));
}

export function setUiPrefs(prefs: Partial<UiPrefs>) {
  const next = mergePrefs({ ...getUiPrefs(), ...prefs });
  setSetting('ui_prefs', JSON.stringify(next));
  return next;
}
