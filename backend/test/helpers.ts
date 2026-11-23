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

type SalaryTuple = [effectiveDate: string, amountMinorUnits: number, currency: string, reason?: string];

/**
 * Inserts one employee with a salary history, readable at a glance:
 *   addPerson(db, "Priya Patel", { country: "IN", salaries: [["2020-01-01", 2_000_000_00, "INR"]] })
 * The first salary defaults to reason 'hire' on the start date.
 */
export function addPerson(
  db: Db,
  fullName: string,
  opts: { country?: string; department?: string; startDate?: string; salaries?: SalaryTuple[] } = {},
): number {
  const salaries = opts.salaries ?? [];
  const startDate = opts.startDate ?? salaries[0]?.[0] ?? "2020-01-01";
  const id = insertEmployee(db, {
    full_name: fullName,
    email: `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@acme.example`,
    country_code: opts.country ?? "US",
    department: opts.department ?? "Engineering",
    start_date: startDate,
  });
  salaries.forEach(([effective_date, amount_minor_units, currency, reason], index) => {
    insertSalary(db, id, {
      effective_date,
      amount_minor_units,
      currency,
      reason: reason ?? (index === 0 ? "hire" : "annual_review"),
    });
  });
  return id;
}
