import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * Opens a SQLite database with the pragmas this app relies on.
 * Pass ":memory:" for an isolated, throwaway database (used by tests).
 */
export function openDatabase(path: string): Db {
  const db = new Database(path);
  // SQLite ships with foreign keys off; cascades and the currency FK need them.
  db.pragma("foreign_keys = ON");
  if (path !== ":memory:") {
    // WAL lets the API read while a write (e.g. a reseed) is in progress.
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }
  return db;
}
