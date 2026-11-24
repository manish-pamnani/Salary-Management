import type { Money as MoneyValue } from "../api";
import { formatMoney } from "../format";

export function Money({ value }: { value: MoneyValue | null | undefined }) {
  if (!value) return <span className="muted">No salary yet</span>;
  return <span className="money">{formatMoney(value.amountMinorUnits, value.currency, value.minorUnitExponent)}</span>;
}
