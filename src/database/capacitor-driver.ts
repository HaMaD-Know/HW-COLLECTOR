import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Row, SqlDriver, SqlValue } from './driver';

export const DB_NAME = 'hw_collector';

/**
 * SqlDriver backed by @capacitor-community/sqlite.
 * Android/iOS: a native SQLite file in app-private storage.
 * Browser (development only): sql.js in a <jeep-sqlite> element, persisted to IndexedDB.
 */
export class CapacitorSqliteDriver implements SqlDriver {
  private depth = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly sqlite: SQLiteConnection,
    private readonly db: SQLiteDBConnection,
    private readonly isWeb: boolean,
  ) {}

  static async open(): Promise<CapacitorSqliteDriver> {
    const isWeb = Capacitor.getPlatform() === 'web';
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    if (isWeb) await setUpWebStore(sqlite);

    await sqlite.checkConnectionsConsistency().catch(() => undefined);
    const existing = (await sqlite.isConnection(DB_NAME, false)).result;
    const db = existing
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await db.execute('PRAGMA foreign_keys = ON;', false).catch(() => undefined);
    const driver = new CapacitorSqliteDriver(sqlite, db, isWeb);
    if (isWeb) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void driver.persist();
      });
    }
    return driver;
  }

  async exec(sql: string): Promise<void> {
    await this.db.execute(sql, false);
    this.afterWrite();
  }

  async query<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const result = await this.db.query(sql, params);
    // Older iOS builds prepend a column-name descriptor row; drop it.
    return ((result.values ?? []) as T[]).filter((row) => !('ios_columns' in row));
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const result = await this.db.run(sql, params, false);
    this.afterWrite();
    return { changes: result.changes?.changes ?? 0 };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn();
    this.depth++;
    await this.db.beginTransaction();
    try {
      const value = await fn();
      await this.db.commitTransaction();
      return value;
    } catch (error) {
      await this.db.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      this.depth--;
      this.afterWrite();
    }
  }

  async persist(): Promise<void> {
    if (!this.isWeb) return; // native writes are already durable
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.sqlite.saveToStore(DB_NAME);
  }

  private afterWrite(): void {
    if (!this.isWeb || this.depth > 0) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 250);
  }
}

async function setUpWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElement } = await import('jeep-sqlite/dist/components/jeep-sqlite');
  defineCustomElement();
  if (!document.querySelector('jeep-sqlite')) {
    const el = document.createElement('jeep-sqlite');
    // Stencil component props; sql-wasm.wasm is copied to public/assets by scripts/copy-wasm.mjs.
    Object.assign(el, { autoSave: true, wasmPath: 'assets' });
    document.body.appendChild(el);
  }
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}
