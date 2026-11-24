import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  query,
  type CurrentSalaryAnswer,
  type DepartmentCostAnswer,
  type HeadcountByCurrencyAnswer,
} from "../api";
import { Money } from "../components/Money";
import { AsOf, ErrorBox, Loading } from "../components/Status";
import { countryName, formatDate, formatMoney, formatMonth } from "../format";
import { useMeta } from "../meta";
import { useApi } from "../useApi";

/** The three fixed questions from the requirements, each answered by one SQL-backed endpoint. */
export function AskPage() {
  return (
    <section className="ask">
      <div className="page-title">
        <h1>Ask</h1>
        <p className="muted">Three questions, answered from the database rather than a spreadsheet.</p>
      </div>
      <CurrentSalaryQuestion />
      <DepartmentCostQuestion />
      <HeadcountQuestion />
    </section>
  );
}

function CurrentSalaryQuestion() {
  const meta = useMeta();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const answer = useApi<CurrentSalaryAnswer>(asked);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAsked(`/ask/current-salary${query({ q: name.trim(), country, department })}`);
  };

  return (
    <article className="card question" aria-labelledby="q1">
      <h2 id="q1">What is this person paid now?</h2>
      <form className="filters" onSubmit={submit}>
        <label className="grow">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Patel" required />
        </label>
        <label>
          <span>Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Any</option>
            {meta.countries.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Department</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Any</option>
            {meta.departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          Ask
        </button>
      </form>

      {answer.error && <ErrorBox error={answer.error} onRetry={answer.reload} />}
      {asked && !answer.data && !answer.error && <Loading slow={answer.slow} />}
      {answer.data && (
        <div className={answer.loading ? "stale" : undefined}>
          <h3>
            {answer.data.totalMatches === 0
              ? "No one matches that name."
              : answer.data.totalMatches === 1
                ? "1 match"
                : `${answer.data.totalMatches.toLocaleString("en")} people match. Names repeat, so check which one you mean.`}{" "}
            {answer.data.totalMatches > 0 && <AsOf date={answer.data.asOf} />}
          </h3>
          {answer.data.truncated && (
            <p className="warning">
              Showing the first {answer.data.matches.length}. Narrow it down by country or department.
            </p>
          )}
          {answer.data.matches.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Department</th>
                    <th>Country</th>
                    <th>Started</th>
                    <th className="numeric">Current salary</th>
                  </tr>
                </thead>
                <tbody>
                  {answer.data.matches.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link to={`/employees/${e.id}`}>{e.fullName}</Link>
                        <div className="muted small">{e.email}</div>
                      </td>
                      <td>{e.jobTitle}</td>
                      <td>{e.department}</td>
                      <td>{countryName(e.countryCode)}</td>
                      <td className="nowrap">{formatDate(e.startDate)}</td>
                      <td className="numeric">
                        <Money value={e.currentSalary} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function DepartmentCostQuestion() {
  const meta = useMeta();
  const thisMonth = meta.today.slice(0, 7);
  const [department, setDepartment] = useState(meta.departments[0] ?? "");
  const [month, setMonth] = useState(thisMonth);
  const [asked, setAsked] = useState<string | null>(null);
  const answer = useApi<DepartmentCostAnswer>(asked);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAsked(`/ask/department-cost${query({ department, month: month || thisMonth })}`);
  };

  return (
    <article className="card question" aria-labelledby="q2">
      <h2 id="q2">What does a department cost this month?</h2>
      <form className="filters" onSubmit={submit}>
        <label>
          <span>Department</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            {meta.departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Month</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="submit" className="primary">
          Ask
        </button>
      </form>

      {answer.error && <ErrorBox error={answer.error} onRetry={answer.reload} />}
      {asked && !answer.data && !answer.error && <Loading slow={answer.slow} />}
      {answer.data && (
        <div className={answer.loading ? "stale" : undefined}>
          <h3>
            {answer.data.department}, {formatMonth(answer.data.month)} <AsOf date={answer.data.asOf} />
          </h3>
          {answer.data.byCurrency.length === 0 ? (
            <p>No one in {answer.data.department} was paid in that month.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Currency</th>
                  <th className="numeric">People paid</th>
                  <th className="numeric">Cost for the month</th>
                </tr>
              </thead>
              <tbody>
                {answer.data.byCurrency.map((r) => (
                  <tr key={r.currency}>
                    <td>{r.currency}</td>
                    <td className="numeric">{r.headcount.toLocaleString("en")}</td>
                    <td className="numeric">{formatMoney(r.costMinorUnits, r.currency, r.minorUnitExponent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">
            Annual salary ÷ 12, prorated by calendar days when pay changes mid-month. One total per currency, never
            converted.
            {answer.data.includesScheduledChanges &&
              " This is a projection for the whole month: it includes raises scheduled for later in the month."}
          </p>
        </div>
      )}
    </article>
  );
}

function HeadcountQuestion() {
  const answer = useApi<HeadcountByCurrencyAnswer>("/ask/headcount-by-currency");
  const total = answer.data?.rows.reduce((sum, r) => sum + r.headcount, 0) ?? 0;

  return (
    <article className="card question" aria-labelledby="q3">
      <h2 id="q3">
        How many people are paid in each currency? {answer.data && <AsOf date={answer.data.asOf} />}
      </h2>
      {answer.error ? (
        <ErrorBox error={answer.error} onRetry={answer.reload} />
      ) : !answer.data ? (
        <Loading slow={answer.slow} />
      ) : (
        <table className="headcount">
          <thead>
            <tr>
              <th>Currency</th>
              <th className="numeric">People</th>
              <th className="bar-cell" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {answer.data.rows.map((r) => (
              <tr key={r.currency ?? "none"}>
                <td>{r.currency ?? <span className="muted">Not started yet</span>}</td>
                <td className="numeric">{r.headcount.toLocaleString("en")}</td>
                <td className="bar-cell" aria-hidden="true">
                  <span className="bar" style={{ width: `${(r.headcount / Math.max(total, 1)) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
