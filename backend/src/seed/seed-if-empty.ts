import type { Db } from "../db/connection.js";
import { generateSeedData } from "./generate.js";
import { writeSeedData } from "./write.js";

export const DEFAULT_SEED = 42;
export const DEFAULT_EMPLOYEE_COUNT = 10_000;

/**
 * Seeds the standard 10,000-employee company if the database has no
 * employees, and does nothing otherwise. Used at boot on hosts whose disk
 * is ephemeral (Render free tier), where every cold start begins empty.
 * Never overwrites existing data.
 */
export function seedIfEmpty(
  db: Db,
  asOf: string,
  { count = DEFAULT_EMPLOYEE_COUNT, seed = DEFAULT_SEED } = {},
): { seeded: boolean; employees: number; ms: number } {
  const started = performance.now();
  const existing = db.prepare("SELECT count(*) FROM employees").pluck().get() as number;
  if (existing > 0) return { seeded: false, employees: existing, ms: 0 };
  writeSeedData(db, generateSeedData({ count, seed, asOf }));
  return { seeded: true, employees: count, ms: Math.round(performance.now() - started) };
}
