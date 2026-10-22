export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

/**
 * Minimal SQL surface the repositories depend on. The app uses the Capacitor
 * SQLite plugin (native SQLite on Android/iOS, sql.js + IndexedDB in a browser);
 * tests use an in-memory sql.js database through the same interface.
 */
export interface SqlDriver {
  /** Runs one or more statements without parameters (schema changes). */
  exec(sql: string): Promise<void>;
  query<T extends Row = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Runs `fn` atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Flushes to durable storage when the backend needs it (web store). */
  persist(): Promise<void>;
}
