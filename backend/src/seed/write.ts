import type { Db } from "../db/connection.js";
import type { SeedData } from "./generate.js";

/**
 * Replaces all employees and salary records with `data`, atomically.
 * One transaction + prepared statements: 10,000 employees and ~60,000 salary
 * rows insert in well under a second, versus minutes with autocommit per row.
 */
export function writeSeedData(db: Db, data: SeedData): void {
  const insertEmployee = db.prepare(
    `INSERT INTO employees (id, full_name, email, country_code, department, job_title, start_date)
     VALUES (@id, @fullName, @email, @countryCode, @department, @jobTitle, @startDate)`,
  );
  const insertSalary = db.prepare(
    `INSERT INTO salary_records (employee_id, amount_minor_units, currency, effective_date, reason)
     VALUES (@employeeId, @amountMinorUnits, @currency, @effectiveDate, @reason)`,
  );

  db.transaction(() => {
    db.exec("DELETE FROM employees"); // cascades to salary_records
    for (const employee of data.employees) insertEmployee.run(employee);
    for (const record of data.salaryRecords) insertSalary.run(record);
  })();

  // Refresh planner statistics so index choices reflect 10k rows, not an empty table.
  db.exec("ANALYZE");
}
