/**
 * The one definition of "current salary" used everywhere: the record with the
 * latest effective_date on or before @asOf. Future-dated records never match.
 *
 * Joined as alias `cs` onto `employees e`. LEFT JOIN, because someone whose
 * only record is in the future (hired next month) has no current salary yet.
 * Each lookup is one index seek on UNIQUE(employee_id, effective_date): see
 * decision D8 for why this is computed per request rather than cached.
 */
export const CURRENT_SALARY_JOIN = `
  LEFT JOIN salary_records cs ON cs.id = (
    SELECT id FROM salary_records
    WHERE employee_id = e.id AND effective_date <= @asOf
    ORDER BY effective_date DESC
    LIMIT 1
  )`;

export interface Money {
  amountMinorUnits: number;
  currency: string;
  minorUnitExponent: number;
}
