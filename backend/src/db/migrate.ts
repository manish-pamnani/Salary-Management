import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./connection.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Applies every *.sql file in the migrations directory that has not run yet,
 * in filename order, each inside its own transaction. Returns the names applied.
 * Deliberately tiny: plain SQL files keep the schema readable in review.
 */
export function migrate(db: Db, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT`);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").pluck().all() as string[],
  );
  const pending = readdirSync(dir)
    .filter((file) => file.endsWith(".sql") && !applied.has(file))
    .sort();

  const record = db.prepare("INSERT INTO schema_migrations (name) VALUES (?)");
  for (const file of pending) {
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
  }
  return pending;
}
