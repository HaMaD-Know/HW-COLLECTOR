import type { SqlDriver } from './driver';

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

/**
 * Append-only list. Never edit a shipped migration; add a new one instead.
 * Money is stored as integer minor units (cents) to avoid float rounding.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema: cars and wishlist',
    sql: `
      CREATE TABLE IF NOT EXISTS cars (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        image_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        manufacturer TEXT,
        model TEXT,
        series TEXT,
        color TEXT,
        release_year INTEGER,
        purchase_year INTEGER,
        condition TEXT,
        packaging TEXT,
        purchase_price_cents INTEGER,
        estimated_value_cents INTEGER,
        purchase_location TEXT,
        notes TEXT,
        ai_suggested_name TEXT,
        name_source TEXT NOT NULL DEFAULT 'manual',
        is_wishlisted INTEGER NOT NULL DEFAULT 0,
        is_sample INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cars_name ON cars (name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_cars_created ON cars (created_at);
      CREATE INDEX IF NOT EXISTS idx_cars_series ON cars (series);
      CREATE INDEX IF NOT EXISTS idx_cars_image ON cars (image_path);

      CREATE TABLE IF NOT EXISTS wishlist (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        image_path TEXT,
        notes TEXT,
        series TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        acquired_at INTEGER,
        acquired_car_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_wishlist_image ON wishlist (image_path);
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(db: SqlDriver): Promise<number> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);');
  const rows = await db.query<{ version: number }>('SELECT MAX(version) AS version FROM schema_version');
  return Number(rows[0]?.version ?? 0);
}

/** Applies every pending migration in order, each inside its own transaction. */
export async function runMigrations(db: SqlDriver, migrations: Migration[] = MIGRATIONS): Promise<number> {
  let current = await getSchemaVersion(db);
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.run('INSERT INTO schema_version (version) VALUES (?)', [migration.version]);
    });
    current = migration.version;
  }
  await db.persist();
  return current;
}
