import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const SCHEMA_VERSION = 2;

const g = globalThis as unknown as { __dashboardDb?: Database.Database };

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function initDb(): Database.Database {
  const dir = dataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path.join(dir, 'dashboard.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`);
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'schema_version'`).get() as { value: string } | undefined;
  const version = row ? Number(row.value) : 1;

  if (version < 2) {
    // v1 tables only ever held failed-sync markers (every row "skipped"), and the
    // sales/subscription tables keyed rows too coarsely to be reused. Start clean.
    db.exec(`
      DROP TABLE IF EXISTS daily_sales;
      DROP TABLE IF EXISTS subscriptions;
      DROP TABLE IF EXISTS sync_log;
      DROP TABLE IF EXISTS sync_errors;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      apple_id TEXT PRIMARY KEY,
      name TEXT,
      bundle_id TEXT,
      sku TEXT,
      platform TEXT,
      icon_url TEXT,
      store_url TEXT,
      primary_genre_id TEXT,
      primary_genre TEXT,
      price REAL,
      current_version TEXT,
      release_date TEXT,
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- One row per line of an Apple SALES SUMMARY report. A report date is always
    -- replaced wholesale, so re-syncing a date can never double count.
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      granularity TEXT NOT NULL,          -- 'D' daily report, 'M' monthly report
      date TEXT NOT NULL,                 -- YYYY-MM-DD (first of month for 'M')
      apple_id TEXT,                      -- parent app (IAPs resolved via parent SKU)
      product_apple_id TEXT,
      sku TEXT,
      parent_sku TEXT,
      title TEXT,
      product_type TEXT,
      category TEXT,                      -- download | redownload | update | iap | other
      units INTEGER DEFAULT 0,
      proceeds_per_unit REAL DEFAULT 0,
      proceeds_currency TEXT,
      customer_price REAL DEFAULT 0,
      customer_currency TEXT,
      country_code TEXT,
      device TEXT,
      app_version TEXT,
      promo_code TEXT,
      subscription TEXT,
      period TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sales_app_date ON sales(apple_id, date);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(granularity, date);

    CREATE TABLE IF NOT EXISTS sub_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      apple_id TEXT,
      subscription_name TEXT,
      subscription_id TEXT,
      event TEXT,
      offer_type TEXT,
      country_code TEXT,
      device TEXT,
      quantity INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sub_events ON sub_events(apple_id, date);

    CREATE TABLE IF NOT EXISTS sub_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      apple_id TEXT,
      subscription_name TEXT,
      subscription_id TEXT,
      country_code TEXT,
      proceeds_per_unit REAL DEFAULT 0,
      proceeds_currency TEXT,
      active_standard INTEGER DEFAULT 0,
      active_trial INTEGER DEFAULT 0,
      active_intro INTEGER DEFAULT 0,
      active_promo INTEGER DEFAULT 0,
      billing_retry INTEGER DEFAULT 0,
      grace_period INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sub_snapshot ON sub_snapshot(apple_id, date);

    -- Which report dates we already hold. Only dates missing here (or that
    -- errored) are requested from Apple on the next sync.
    CREATE TABLE IF NOT EXISTS sync_state (
      report_type TEXT NOT NULL,
      granularity TEXT NOT NULL,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,               -- ok | empty | error
      rows INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (report_type, granularity, report_date)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      apple_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      date TEXT NOT NULL,
      avg_rating REAL,
      rating_count INTEGER DEFAULT 0,
      current_avg_rating REAL,
      current_rating_count INTEGER DEFAULT 0,
      version TEXT,
      price REAL,
      PRIMARY KEY (apple_id, country_code, date)
    );

    CREATE TABLE IF NOT EXISTS rankings (
      apple_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      date TEXT NOT NULL,
      chart TEXT NOT NULL,                -- topfree | toppaid | topgrossing
      genre_id TEXT NOT NULL,             -- '0' = all apps
      rank INTEGER NOT NULL,
      PRIMARY KEY (apple_id, country_code, date, chart, genre_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      apple_id TEXT,
      country_code TEXT,
      rating INTEGER,
      title TEXT,
      body TEXT,
      reviewer TEXT,
      created_date TEXT,
      response_body TEXT,
      response_date TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_app ON reviews(apple_id, created_date);

    CREATE TABLE IF NOT EXISTS fx_rates (
      currency TEXT PRIMARY KEY,
      per_usd REAL NOT NULL,              -- units of currency per 1 USD
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job TEXT,
      trigger TEXT,
      started_at TEXT,
      finished_at TEXT,
      status TEXT,
      message TEXT
    );
  `);

  // Columns added to tables that may already exist from an older install.
  const addColumns: Record<string, Record<string, string>> = {
    apps: {
      sku: 'TEXT',
      icon_url: 'TEXT',
      store_url: 'TEXT',
      primary_genre_id: 'TEXT',
      primary_genre: 'TEXT',
      price: 'REAL',
      current_version: 'TEXT',
      release_date: 'TEXT',
    },
  };
  for (const [table, columns] of Object.entries(addColumns)) {
    const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    for (const [name, type] of Object.entries(columns)) {
      if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }

  db.prepare(`INSERT INTO settings (key, value) VALUES ('schema_version', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(SCHEMA_VERSION));

  return db;
}

export function getDb(): Database.Database {
  if (!g.__dashboardDb) {
    g.__dashboardDb = initDb();
  }
  return g.__dashboardDb;
}
