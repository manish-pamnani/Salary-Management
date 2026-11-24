// Types mirror the API responses. Money is always integer minor units plus the
// currency's exponent; the UI never adds amounts in different currencies.

export interface Money {
  amountMinorUnits: number;
  currency: string;
  minorUnitExponent: number;
}

export interface Currency {
  code: string;
  minorUnitExponent: number;
}

export interface Meta {
  today: string;
  timeZone: string;
  countries: string[];
  departments: string[];
  currencies: Currency[];
}

export interface Employee {
  id: number;
  fullName: string;
  email: string;
  countryCode: string;
  department: string;
  jobTitle: string;
  startDate: string;
  currentSalary: (Money & { effectiveDate: string }) | null;
}

export interface EmployeeList {
  items: Employee[];
  page: number;
  pageSize: number;
  total: number;
  asOf: string;
  salaryCurrencies: string[];
  resolvedCurrency?: string;
}

export const CHANGE_REASONS = ["annual_review", "promotion", "market_adjustment", "relocation", "correction"] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];
export type SalaryReason = "hire" | ChangeReason;

export interface SalaryHistoryEntry extends Money {
  id: number;
  employeeId: number;
  effectiveDate: string;
  reason: SalaryReason;
  createdAt: string;
  status: "past" | "current" | "scheduled";
  change: { amountMinorUnits: number; percent: number } | null;
}

export interface EmployeeDetail extends Employee {
  asOf: string;
  salaryHistory: SalaryHistoryEntry[];
}

export interface NewSalaryRecord {
  amountMinorUnits: number;
  currency: string;
  effectiveDate: string;
  reason: ChangeReason;
}

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

export interface PaySummary {
  asOf: string;
  groupBy: "country" | "department";
  rows: PaySummaryRow[];
}

export interface CurrentSalaryAnswer {
  asOf: string;
  matches: Employee[];
  totalMatches: number;
  truncated: boolean;
}

export interface DepartmentCostAnswer {
  department: string;
  month: string;
  asOf: string;
  byCurrency: { currency: string; minorUnitExponent: number; headcount: number; costMinorUnits: number }[];
  includesScheduledChanges: boolean;
}

export interface HeadcountByCurrencyAnswer {
  asOf: string;
  rows: { currency: string | null; headcount: number }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Fetches `/api{path}`. Errors carry the API's `{ error: { code, message } }`. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  // Aborted while reading the body: don't hand back a half-read null as data.
  init.signal?.throwIfAborted();
  if (!res.ok) {
    const err = (body?.error ?? {}) as Record<string, unknown>;
    throw new ApiError(
      res.status,
      typeof err.code === "string" ? err.code : "http_error",
      typeof err.message === "string" ? err.message : `Request failed (${res.status})`,
      err,
    );
  }
  return body as T;
}

export const addSalaryRecord = (employeeId: number, record: NewSalaryRecord) =>
  api<SalaryHistoryEntry>(`/employees/${employeeId}/salary-records`, {
    method: "POST",
    body: JSON.stringify(record),
  });

/** Builds a query string from defined, non-empty values. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
