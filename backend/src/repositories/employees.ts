import type { Db } from "../db/connection.js";
import { ApiError, notFound } from "../http/errors.js";
import { CURRENT_SALARY_JOIN, type Money } from "./current-salary.js";

export type EmployeeSort = "name" | "salary" | "start_date";
export type SortOrder = "asc" | "desc";

export interface EmployeeListQuery {
  search?: string;
  country?: string;
  department?: string;
  currency?: string;
  sort: EmployeeSort;
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface Employee {
  id: number;
  fullName: string;
  email: string;
  countryCode: string;
  department: string;
  jobTitle: string;
  startDate: string;
}

export interface EmployeeSummary extends Employee {
  currentSalary: (Money & { effectiveDate: string }) | null;
}

export interface EmployeeListResult {
  items: EmployeeSummary[];
  page: number;
  pageSize: number;
  total: number;
  /** The date that decided "current salary" for every row. */
  asOf: string;
  /**
   * Currencies the matching employees are currently paid in. The UI enables the
   * salary sort only when this has exactly one entry (D8), and says why otherwise.
   */
  salaryCurrencies: string[];
  /** Set when sort=salary had no explicit currency and one was proven from the data (D8). */
  resolvedCurrency?: string;
}

const EMPLOYEE_COLUMNS = `
  e.id, e.full_name AS fullName, e.email, e.country_code AS countryCode,
  e.department, e.job_title AS jobTitle, e.start_date AS startDate`;

// Every sort ends in e.id so the order is total and offset paging is stable (D8).
const ORDER_BY: Record<EmployeeSort, (order: SortOrder) => string> = {
  name: (o) => `e.full_name COLLATE NOCASE ${o}, e.id ASC`,
  start_date: (o) => `e.start_date ${o}, e.id ASC`,
  salary: (o) => `cs.amount_minor_units ${o} NULLS LAST, e.id ASC`,
};

interface Where {
  clauses: string[];
  params: Record<string, string | number>;
}

/** Filters on the employee row itself (not on salary). */
function employeeFilters(query: EmployeeListQuery): Where {
  const where: Where = { clauses: [], params: {} };
  if (query.country) {
    where.clauses.push("e.country_code = @country");
    where.params.country = query.country;
  }
  if (query.department) {
    where.clauses.push("e.department = @department");
    where.params.department = query.department;
  }
  const search = query.search?.trim();
  if (search) {
    // Matches the start of any word in the name ("pat" finds "Priya Patel"), or the
    // start of the email. Wildcards typed by the user are escaped, not interpreted.
    const escaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    where.clauses.push(
      `(e.full_name LIKE @searchPrefix ESCAPE '\\' OR e.full_name LIKE @searchWord ESCAPE '\\'
        OR e.email LIKE @searchPrefix ESCAPE '\\')`,
    );
    where.params.searchPrefix = `${escaped}%`;
    where.params.searchWord = `% ${escaped}%`;
  }
  return where;
}

const whereSql = (clauses: string[]) => (clauses.length ? `WHERE ${clauses.join(" AND ")}` : "");

/**
 * Currencies that the current salaries of the matching employees are paid in.
 * Used to decide whether a salary sort is meaningful (D8).
 */
function currenciesInPlay(db: Db, filters: Where, asOf: string): string[] {
  const sql = `
    SELECT DISTINCT cs.currency FROM employees e ${CURRENT_SALARY_JOIN}
    ${whereSql([...filters.clauses, "cs.currency IS NOT NULL"])}
    ORDER BY cs.currency`;
  return db.prepare(sql).pluck().all({ ...filters.params, asOf }) as string[];
}

export function listEmployees(db: Db, query: EmployeeListQuery, asOf: string): EmployeeListResult {
  const filters = employeeFilters(query);
  const clauses = [...filters.clauses];
  const params: Record<string, string | number> = { ...filters.params, asOf };
  let resolvedCurrency: string | undefined;
  // With an explicit currency filter, every match is paid in it by definition.
  const currencies = query.currency ? undefined : currenciesInPlay(db, filters, asOf);

  if (query.currency) {
    clauses.push("cs.currency = @currency");
    params.currency = query.currency;
  } else if (query.sort === "salary" && currencies) {
    // Ranking rupees against dollars is meaningless. Without an explicit currency,
    // sort only if every matching employee is currently paid in the same one.
    if (currencies.length > 1) {
      throw new ApiError(
        400,
        "currency_required",
        `Sorting by salary needs a single currency, but matching employees are paid in ${currencies.join(", ")}. ` +
          "Add a currency filter.",
        { currencies },
      );
    }
    resolvedCurrency = currencies[0];
  }

  const where = whereSql(clauses);
  // The count only needs the salary join when filtering on currency.
  const countJoin = query.currency ? CURRENT_SALARY_JOIN : "";
  const total = db
    .prepare(`SELECT count(*) FROM employees e ${countJoin} ${where}`)
    .pluck()
    .get(params) as number;

  const rows = db
    .prepare(
      `SELECT ${EMPLOYEE_COLUMNS},
              cs.amount_minor_units AS amountMinorUnits, cs.currency,
              cs.effective_date AS salaryEffectiveDate, cur.minor_unit_exponent AS minorUnitExponent
       FROM employees e ${CURRENT_SALARY_JOIN}
       LEFT JOIN currencies cur ON cur.code = cs.currency
       ${where}
       ORDER BY ${ORDER_BY[query.sort](query.order)}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as SummaryRow[];

  return {
    items: rows.map(toSummary),
    page: query.page,
    pageSize: query.pageSize,
    total,
    asOf,
    salaryCurrencies: currencies ?? (total > 0 ? [query.currency!] : []),
    ...(resolvedCurrency ? { resolvedCurrency } : {}),
  };
}

export function getEmployee(db: Db, id: number, asOf: string): EmployeeSummary {
  const row = db
    .prepare(
      `SELECT ${EMPLOYEE_COLUMNS},
              cs.amount_minor_units AS amountMinorUnits, cs.currency,
              cs.effective_date AS salaryEffectiveDate, cur.minor_unit_exponent AS minorUnitExponent
       FROM employees e ${CURRENT_SALARY_JOIN}
       LEFT JOIN currencies cur ON cur.code = cs.currency
       WHERE e.id = @id`,
    )
    .get({ id, asOf }) as SummaryRow | undefined;
  if (!row) throw notFound("Employee");
  return toSummary(row);
}

interface SummaryRow extends Employee {
  amountMinorUnits: number | null;
  currency: string | null;
  salaryEffectiveDate: string | null;
  minorUnitExponent: number | null;
}

function toSummary(row: SummaryRow): EmployeeSummary {
  const { amountMinorUnits, currency, salaryEffectiveDate, minorUnitExponent, ...employee } = row;
  return {
    ...employee,
    currentSalary:
      amountMinorUnits === null
        ? null
        : {
            amountMinorUnits,
            currency: currency!,
            minorUnitExponent: minorUnitExponent!,
            effectiveDate: salaryEffectiveDate!,
          },
  };
}
