import { useState, type FormEvent } from "react";
import {
  addSalaryRecord,
  ApiError,
  CHANGE_REASONS,
  type ChangeReason,
  type EmployeeDetail,
  type SalaryHistoryEntry,
} from "../api";
import { formatDate, formatMoney, parseAmount, reasonLabel } from "../format";
import { exponentOf, useMeta } from "../meta";

/**
 * Appends an effective-dated salary record. It never edits an existing one:
 * a mistake is fixed with a new record whose reason is "correction".
 */
export function SalaryForm({ employee, onAdded }: { employee: EmployeeDetail; onAdded: () => void }) {
  const meta = useMeta();
  const current = employee.currentSalary;
  const latestCurrency = current?.currency ?? employee.salaryHistory[0]?.currency ?? "USD";

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(latestCurrency);
  const [effectiveDate, setEffectiveDate] = useState(employee.asOf);
  const [reason, setReason] = useState<ChangeReason>("annual_review");
  const [errors, setErrors] = useState<{ amount?: string; effectiveDate?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [added, setAdded] = useState<SalaryHistoryEntry>();

  const exponent = exponentOf(meta, currency);
  const parsed = amount.trim() ? parseAmount(amount, currency, exponent) : undefined;
  const isFuture = effectiveDate > employee.asOf;
  const clash = employee.salaryHistory.find((r) => r.effectiveDate === effectiveDate);

  const validate = () => {
    const next: typeof errors = {};
    const amountResult = parseAmount(amount, currency, exponent);
    if (!amountResult.ok) next.amount = amountResult.error;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) next.effectiveDate = "Choose the date the new salary takes effect.";
    else if (effectiveDate < employee.startDate)
      next.effectiveDate = `That is before ${employee.fullName} started (${formatDate(employee.startDate)}).`;
    else if (clash)
      next.effectiveDate = `There is already a record effective ${formatDate(effectiveDate)}. Each date holds one record; pick another date.`;
    return { next, amountResult };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { next, amountResult } = validate();
    setErrors(next);
    setAdded(undefined);
    if (Object.keys(next).length > 0 || !amountResult.ok) return;

    setSubmitting(true);
    try {
      const record = await addSalaryRecord(employee.id, {
        amountMinorUnits: amountResult.minorUnits,
        currency,
        effectiveDate,
        reason,
      });
      setAdded(record);
      setAmount("");
      onAdded();
    } catch (error) {
      // The server re-checks everything; show its reason against the right field.
      const message = (error as Error).message;
      if (error instanceof ApiError && ["duplicate_effective_date", "before_start_date"].includes(error.code)) {
        setErrors({ effectiveDate: message });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card salary-form" onSubmit={submit} noValidate aria-labelledby="salary-form-title">
      <h2 id="salary-form-title">Add a salary record</h2>
      <p className="muted small">
        Appends to the history. If the effective date is after today ({formatDate(employee.asOf)}), the record is
        scheduled and becomes current on that date.
      </p>

      <div className="form-grid">
        <label>
          <span>Annual amount</span>
          <input
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder={current ? String(current.amountMinorUnits / 10 ** current.minorUnitExponent) : "85000"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby="amount-hint"
          />
        </label>
        <label>
          <span>Currency</span>
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {meta.currencies.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Effective date</span>
          <input
            name="effectiveDate"
            type="date"
            value={effectiveDate}
            min={employee.startDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            aria-invalid={Boolean(errors.effectiveDate)}
            aria-describedby="date-hint"
          />
        </label>
        <label>
          <span>Reason</span>
          <select name="reason" value={reason} onChange={(e) => setReason(e.target.value as ChangeReason)}>
            {CHANGE_REASONS.map((r) => (
              <option key={r} value={r}>
                {reasonLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div id="amount-hint" className="hints">
        {errors.amount ? (
          <p className="field-error">{errors.amount}</p>
        ) : parsed?.ok ? (
          <p className="muted">
            {formatMoney(parsed.minorUnits, currency, exponent)} a year
            {current && current.currency === currency && (
              <> · {describeChange(parsed.minorUnits, current.amountMinorUnits)} on the current salary</>
            )}
          </p>
        ) : null}
        {current && currency !== current.currency && (
          <p className="warning">
            {employee.fullName} is currently paid in {current.currency}. A different currency is usually a
            relocation, and the history will not show a change across currencies.
          </p>
        )}
      </div>
      <div id="date-hint" className="hints">
        {errors.effectiveDate ? (
          <p className="field-error">{errors.effectiveDate}</p>
        ) : isFuture ? (
          <p className="warning">
            Scheduled: the current salary stays the same until {formatDate(effectiveDate)}.
          </p>
        ) : null}
      </div>

      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      {added && (
        <p className="success" role="status">
          Added {formatMoney(added.amountMinorUnits, added.currency, added.minorUnitExponent)} effective{" "}
          {formatDate(added.effectiveDate)}
          {added.effectiveDate > employee.asOf ? " (scheduled)" : ""}.
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Saving…" : "Add salary record"}
        </button>
        <span className="muted small">
          Demo server: records you add here last until it restarts (see the README).
        </span>
      </div>
    </form>
  );
}

function describeChange(next: number, previous: number): string {
  if (previous === 0) return "";
  const percent = ((next - previous) / previous) * 100;
  if (Math.abs(percent) < 0.05) return "No change";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}
