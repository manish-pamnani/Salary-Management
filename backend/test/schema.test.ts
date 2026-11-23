import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { createTestDb, insertEmployee, insertSalary } from "./helpers.js";

describe("migrations", () => {
  it("are idempotent: a second run applies nothing", () => {
    const db = createTestDb();
    expect(migrate(db)).toEqual([]);
  });

  it("enable foreign keys on every connection", () => {
    const db = createTestDb();
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});

describe("salary_records constraints", () => {
  it("accepts a valid record", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    expect(() => insertSalary(db, id)).not.toThrow();
  });

  it.each([0, -100])("rejects a non-positive amount (%i)", (amount) => {
    const db = createTestDb();
    const id = insertEmployee(db);
    expect(() => insertSalary(db, id, { amount_minor_units: amount })).toThrow(/CHECK/);
  });

  it("rejects a fractional amount, because money is stored in integer minor units", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    expect(() => insertSalary(db, id, { amount_minor_units: 100.5 })).toThrow();
  });

  it("rejects a currency that is not in the currencies table", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    expect(() => insertSalary(db, id, { currency: "XYZ" })).toThrow(/FOREIGN KEY/);
  });

  it.each(["2024-13-01", "2024-02-30", "15/01/2024", "2024-1-5"])(
    "rejects a malformed or impossible effective date (%s)",
    (date) => {
      const db = createTestDb();
      const id = insertEmployee(db);
      expect(() => insertSalary(db, id, { effective_date: date })).toThrow(/CHECK/);
    },
  );

  it("rejects two records for one employee on the same effective date", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    insertSalary(db, id, { effective_date: "2023-04-01" });
    expect(() => insertSalary(db, id, { effective_date: "2023-04-01", reason: "correction" })).toThrow(/UNIQUE/);
  });

  it("allows the same effective date for different employees", () => {
    const db = createTestDb();
    const a = insertEmployee(db);
    const b = insertEmployee(db);
    insertSalary(db, a, { effective_date: "2023-04-01" });
    expect(() => insertSalary(db, b, { effective_date: "2023-04-01" })).not.toThrow();
  });

  it("rejects an unknown change reason", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    expect(() => insertSalary(db, id, { reason: "because" })).toThrow(/CHECK/);
  });

  it("rejects a record for an employee that does not exist", () => {
    const db = createTestDb();
    expect(() => insertSalary(db, 999)).toThrow(/FOREIGN KEY/);
  });

  it("deletes an employee's history when the employee is deleted", () => {
    const db = createTestDb();
    const id = insertEmployee(db);
    insertSalary(db, id, { effective_date: "2021-01-01" });
    insertSalary(db, id, { effective_date: "2022-01-01", reason: "annual_review" });
    db.prepare("DELETE FROM employees WHERE id = ?").run(id);
    expect(db.prepare("SELECT count(*) FROM salary_records").pluck().get()).toBe(0);
  });
});

describe("employees constraints", () => {
  it("treats emails as unique regardless of case", () => {
    const db = createTestDb();
    insertEmployee(db, { email: "Ada@acme.example" });
    expect(() => insertEmployee(db, { email: "ada@ACME.example" })).toThrow(/UNIQUE/);
  });

  it.each(["gb", "GBR", "G"])("rejects a country code that is not two upper-case letters (%s)", (code) => {
    const db = createTestDb();
    expect(() => insertEmployee(db, { country_code: code })).toThrow(/CHECK/);
  });
});

describe("query plans", () => {
  // Guards the performance assumptions in the requirements: these lookups must
  // hit an index, not scan 10,000 rows.
  const planFor = (sql: string) => {
    const db = createTestDb();
    return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[])
      .map((row) => row.detail)
      .join(" | ");
  };

  it("uses the (employee_id, effective_date) index for the latest record as of a date", () => {
    const plan = planFor(
      `SELECT * FROM salary_records WHERE employee_id = 1 AND effective_date <= '2024-01-01'
       ORDER BY effective_date DESC LIMIT 1`,
    );
    expect(plan).toMatch(/SEARCH salary_records USING INDEX sqlite_autoindex_salary_records/);
    expect(plan).not.toMatch(/TEMP B-TREE/);
  });

  it("uses an index for filtering employees by country and by department", () => {
    expect(planFor("SELECT id FROM employees WHERE country_code = 'IN'")).toMatch(/SEARCH employees USING .*idx_employees_country/);
    expect(planFor("SELECT id FROM employees WHERE department = 'Sales'")).toMatch(/SEARCH employees USING .*idx_employees_department/);
  });

  it("uses the NOCASE name index for case-insensitive prefix search", () => {
    expect(planFor("SELECT id FROM employees WHERE full_name LIKE 'ada%'")).toMatch(/SEARCH employees USING .*idx_employees_full_name \(full_name>\? AND full_name<\?\)/);
  });
});
