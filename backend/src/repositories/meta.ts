import type { Db } from "../db/connection.js";

export interface Currency {
  code: string;
  minorUnitExponent: number;
}

export function listCurrencies(db: Db): Currency[] {
  return db
    .prepare("SELECT code, minor_unit_exponent AS minorUnitExponent FROM currencies ORDER BY code")
    .all() as Currency[];
}

export function currencyExists(db: Db, code: string): boolean {
  return db.prepare("SELECT 1 FROM currencies WHERE code = ?").get(code) !== undefined;
}

/** Filter options for the UI, taken from the data rather than hard-coded. */
export function listFilterOptions(db: Db) {
  return {
    countries: db.prepare("SELECT DISTINCT country_code FROM employees ORDER BY 1").pluck().all() as string[],
    departments: db.prepare("SELECT DISTINCT department FROM employees ORDER BY 1").pluck().all() as string[],
    currencies: listCurrencies(db),
  };
}
