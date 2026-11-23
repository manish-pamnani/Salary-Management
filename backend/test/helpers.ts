import { openDatabase, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";

/** A fresh, fully migrated in-memory database. Each test gets its own. */
export function createTestDb(): Db {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

let employeeCounter = 0;

export function insertEmployee(db: Db, overrides: Partial<Record<string, unknown>> = {}): number {
  const row = {
    full_name: "Ada Lovelace",
    email: `employee${++employeeCounter}@acme.example`,
    country_code: "GB",
    department: "Engineering",
    job_title: "Software Engineer",
    start_date: "2020-01-15",
    ...overrides,
  };
  const result = db
    .prepare(
      `INSERT INTO employees (full_name, email, country_code, department, job_title, start_date)
       VALUES (@full_name, @email, @country_code, @department, @job_title, @start_date)`,
    )
    .run(row);
  return Number(result.lastInsertRowid);
}

export function insertSalary(db: Db, employeeId: number, overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    employee_id: employeeId,
    amount_minor_units: 5_000_000,
    currency: "GBP",
    effective_date: "2020-01-15",
    reason: "hire",
    ...overrides,
  };
  return db
    .prepare(
      `INSERT INTO salary_records (employee_id, amount_minor_units, currency, effective_date, reason)
       VALUES (@employee_id, @amount_minor_units, @currency, @effective_date, @reason)`,
    )
    .run(row);
}
