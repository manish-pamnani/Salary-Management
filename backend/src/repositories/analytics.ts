import type { Db } from "../db/connection.js";
import { CURRENT_SALARY_JOIN } from "./current-salary.js";

/** Whitelisted grouping columns: never interpolate user input into SQL. */
const GROUP_COLUMNS = { country: "e.country_code", department: "e.department" } as const;
export type GroupBy = keyof typeof GROUP_COLUMNS;

export interface PaySummaryRow {
  group: string;
  currency: string;
  minorUnitExponent: number;
  headcount: number;
  totalMinorUnits: number;
  medianMinorUnits: number;
  minMinorUnits: number;
  maxMinorUnits: number;
}

/**
 * Headcount and current pay per group, one row per (group, currency): amounts
 * in different currencies are never added together. Median alongside total,
 * because one outlier moves an average but not a median. All in SQL.
 */
export function paySummary(
  db: Db,
  { groupBy, country, department }: { groupBy: GroupBy; country?: string; department?: string },
  asOf: string,
): PaySummaryRow[] {
  const groupColumn = GROUP_COLUMNS[groupBy];
  const filters = ["cs.id IS NOT NULL"];
  if (country) filters.push("e.country_code = @country");
  if (department) filters.push("e.department = @department");

  return db
    .prepare(
      `WITH current AS (
         SELECT ${groupColumn} AS grp, cs.currency, cs.amount_minor_units AS amount
         FROM employees e ${CURRENT_SALARY_JOIN}
         WHERE ${filters.join(" AND ")}
       ),
       ranked AS (
         SELECT grp, currency, amount,
                row_number() OVER (PARTITION BY grp, currency ORDER BY amount) AS rn,
                count(*)     OVER (PARTITION BY grp, currency)                 AS n
         FROM current
       )
       SELECT r.grp AS "group", r.currency, c.minor_unit_exponent AS minorUnitExponent,
              count(*) AS headcount,
              sum(r.amount) AS totalMinorUnits,
              -- middle row, or the mean of the two middle rows for an even count
              CAST(round(avg(CASE WHEN r.rn IN ((r.n + 1) / 2, (r.n + 2) / 2) THEN r.amount END)) AS INTEGER)
                AS medianMinorUnits,
              min(r.amount) AS minMinorUnits,
              max(r.amount) AS maxMinorUnits
       FROM ranked r JOIN currencies c ON c.code = r.currency
       GROUP BY r.grp, r.currency
       ORDER BY r.grp, headcount DESC, r.currency`,
    )
    .all({ asOf, country, department }) as PaySummaryRow[];
}

export interface CurrencyHeadcount {
  currency: string | null;
  headcount: number;
}

/** How many people are currently paid in each currency; null = no salary in effect yet. */
export function headcountByCurrency(db: Db, asOf: string): CurrencyHeadcount[] {
  return db
    .prepare(
      `SELECT cs.currency, count(*) AS headcount
       FROM employees e ${CURRENT_SALARY_JOIN}
       GROUP BY cs.currency
       ORDER BY headcount DESC, cs.currency`,
    )
    .all({ asOf }) as CurrencyHeadcount[];
}

export interface DepartmentCostRow {
  currency: string;
  minorUnitExponent: number;
  headcount: number;
  costMinorUnits: number;
}

/**
 * What a department's salaries cost in one calendar month, per currency.
 * Annual salary / 12, prorated by the days each record was in effect that
 * month, so a raise on the 15th or a hire on the 21st counts only for the
 * days it applies. A future month includes scheduled raises.
 */
export function departmentMonthlyCost(db: Db, department: string, month: string): DepartmentCostRow[] {
  const monthStart = `${month}-01`;
  return db
    .prepare(
      `WITH bounds AS (
         SELECT @monthStart AS start_date, date(@monthStart, '+1 month') AS end_date
       ),
       periods AS (
         SELECT s.employee_id, s.currency, s.amount_minor_units AS annual,
                s.effective_date AS from_date,
                lead(s.effective_date) OVER (PARTITION BY s.employee_id ORDER BY s.effective_date) AS to_date
         FROM salary_records s JOIN employees e ON e.id = s.employee_id, bounds b
         WHERE e.department = @department AND s.effective_date < b.end_date
       ),
       overlap AS (
         SELECT p.employee_id, p.currency, p.annual,
                julianday(min(coalesce(p.to_date, b.end_date), b.end_date))
                  - julianday(max(p.from_date, b.start_date)) AS days,
                julianday(b.end_date) - julianday(b.start_date) AS days_in_month
         FROM periods p, bounds b
       )
       SELECT o.currency, c.minor_unit_exponent AS minorUnitExponent,
              count(DISTINCT o.employee_id) AS headcount,
              CAST(round(sum(o.annual / 12.0 * o.days / o.days_in_month)) AS INTEGER) AS costMinorUnits
       FROM overlap o JOIN currencies c ON c.code = o.currency
       WHERE o.days > 0
       GROUP BY o.currency
       ORDER BY headcount DESC, o.currency`,
    )
    .all({ department, monthStart }) as DepartmentCostRow[];
}
