import initSqlJs, { type Database } from 'sql.js';
import type { Row, SqlDriver, SqlValue } from '../../src/database/driver';
import { runMigrations } from '../../src/database/migrations';

/** In-memory SQLite (sql.js) implementing the same driver contract as the app. */
export class SqlJsDriver implements SqlDriver {
  private depth = 0;
  persistCount = 0;

  constructor(public readonly db: Database) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async query<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    this.db.run(sql, params);
    return { changes: this.db.getRowsModified() };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec('BEGIN');
    try {
      const value = await fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth--;
    }
  }

  async persist(): Promise<void> {
    this.persistCount++;
  }

  /** Serialises and reopens the database, simulating an app restart. */
  async reopen(): Promise<SqlJsDriver> {
    const SQL = await initSqlJs();
    const copy = new SQL.Database(this.db.export());
    return new SqlJsDriver(copy);
  }
}

export async function createTestDb(): Promise<SqlJsDriver> {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await runMigrations(driver);
  return driver;
}
