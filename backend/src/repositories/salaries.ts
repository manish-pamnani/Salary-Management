import type { Db } from "../db/connection.js";
import { ApiError, notFound } from "../http/errors.js";
import { currencyExists } from "./meta.js";

export const SALARY_REASONS = ["hire", "annual_review", "promotion", "market_adjustment", "relocation", "correction"] as const;
export type SalaryReason = (typeof SALARY_REASONS)[number];
/** 'hire' is written once, by onboarding/seed; every later change is one of these. */
export const CHANGE_REASONS = SALARY_REASONS.filter((r) => r !== "hire") as Exclude<SalaryReason, "hire">[];

export type SalaryRecordStatus = "past" | "current" | "scheduled";

export interface SalaryRecord {
  id: number;
  employeeId: number;
  amountMinorUnits: number;
  currency: string;
  minorUnitExponent: number;
  effectiveDate: string;
  reason: SalaryReason;
  createdAt: string;
}

export interface SalaryHistoryEntry extends SalaryRecord {
  status: SalaryRecordStatus;
  /** Change from the previous record by date; null for the first record or across a currency change. */
  change: { amountMinorUnits: number; percent: number } | null;
}

const RECORD_COLUMNS = `
  s.id, s.employee_id AS employeeId, s.amount_minor_units AS amountMinorUnits, s.currency,
  c.minor_unit_exponent AS minorUnitExponent, s.effective_date AS effectiveDate, s.reason,
  s.created_at AS createdAt`;

/**
 * Full history, newest first. Each entry knows whether it is past, current
 * (latest on or before asOf) or scheduled (after asOf), and how it changed pay.
 */
export function getSalaryHistory(db: Db, employeeId: number, asOf: string): SalaryHistoryEntry[] {
  const chronological = db
    .prepare(
      `SELECT ${RECORD_COLUMNS} FROM salary_records s JOIN currencies c ON c.code = s.currency
       WHERE s.employee_id = ? ORDER BY s.effective_date ASC`,
    )
    .all(employeeId) as SalaryRecord[];

  const currentIndex = chronological.findLastIndex((r) => r.effectiveDate <= asOf);

  return chronological
    .map((record, index): SalaryHistoryEntry => {
      const previous = chronological[index - 1];
      const status: SalaryRecordStatus =
        index === currentIndex ? "current" : record.effectiveDate > asOf ? "scheduled" : "past";
      return { ...record, status, change: changeBetween(previous, record) };
    })
    .reverse();
}

export function changeBetween(
  previous: Pick<SalaryRecord, "amountMinorUnits" | "currency"> | undefined,
  next: Pick<SalaryRecord, "amountMinorUnits" | "currency">,
): SalaryHistoryEntry["change"] {
  if (!previous || previous.currency !== next.currency) return null;
  const amountMinorUnits = next.amountMinorUnits - previous.amountMinorUnits;
  const percent = Math.round((amountMinorUnits / previous.amountMinorUnits) * 10_000) / 100;
  return { amountMinorUnits, percent };
}

export interface NewSalaryRecord {
  amountMinorUnits: number;
  currency: string;
  effectiveDate: string;
  reason: Exclude<SalaryReason, "hire">;
}

/**
 * Appends a salary record. Never updates or deletes: a mistake is fixed by a
 * later 'correction' record, so the history always shows what was believed when.
 */
export function addSalaryRecord(db: Db, employeeId: number, input: NewSalaryRecord): SalaryRecord {
  return db.transaction(() => {
    const employee = db.prepare("SELECT start_date AS startDate FROM employees WHERE id = ?").get(employeeId) as
      | { startDate: string }
      | undefined;
    if (!employee) throw notFound("Employee");

    if (!currencyExists(db, input.currency)) {
      throw new ApiError(400, "unknown_currency", `Currency ${input.currency} is not supported`);
    }
    if (input.effectiveDate < employee.startDate) {
      throw new ApiError(
        400,
        "before_start_date",
        `Effective date ${input.effectiveDate} is before the employee's start date ${employee.startDate}`,
      );
    }
    const clash = db
      .prepare("SELECT 1 FROM salary_records WHERE employee_id = ? AND effective_date = ?")
      .get(employeeId, input.effectiveDate);
    if (clash) {
      throw new ApiError(
        409,
        "duplicate_effective_date",
        `This employee already has a salary record effective ${input.effectiveDate}. ` +
          "Records are never overwritten; choose another date.",
      );
    }

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO salary_records (employee_id, amount_minor_units, currency, effective_date, reason)
         VALUES (@employeeId, @amountMinorUnits, @currency, @effectiveDate, @reason)`,
      )
      .run({ employeeId, ...input });

    return db
      .prepare(`SELECT ${RECORD_COLUMNS} FROM salary_records s JOIN currencies c ON c.code = s.currency WHERE s.id = ?`)
      .get(lastInsertRowid) as SalaryRecord;
  })();
}
