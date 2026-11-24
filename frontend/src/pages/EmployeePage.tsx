import { useLocation, useNavigate, useParams } from "react-router";
import type { EmployeeDetail, SalaryHistoryEntry } from "../api";
import { Money } from "../components/Money";
import { SalaryForm } from "../components/SalaryForm";
import { AsOf, ErrorBox, Loading } from "../components/Status";
import { countryName, formatDate, formatSignedMoney, reasonLabel } from "../format";
import { useApi } from "../useApi";

export function EmployeePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useApi<EmployeeDetail>(`/employees/${encodeURIComponent(id ?? "")}`);

  if (detail.error) return <ErrorBox error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading slow={detail.slow} />;

  const employee = detail.data;
  const scheduled = employee.salaryHistory.filter((r) => r.status === "scheduled");

  return (
    <section className="employee">
      <p className="breadcrumb">
        {/* Going back keeps the directory's filters, sort and page, which live in its URL. */}
        <button
          type="button"
          className="link-button"
          onClick={() => (location.key === "default" ? navigate("/") : navigate(-1))}
        >
          ← Employees
        </button>
      </p>
      <div className="page-title">
        <h1>{employee.fullName}</h1>
        <p className="muted">
          {employee.jobTitle} · {employee.department} · {countryName(employee.countryCode)}
        </p>
      </div>

      <div className="cards">
        <div className="card">
          <h2>
            Current salary <AsOf date={employee.asOf} />
          </h2>
          <p className="big">
            <Money value={employee.currentSalary} />
          </p>
          {employee.currentSalary ? (
            <p className="muted">Since {formatDate(employee.currentSalary.effectiveDate)}</p>
          ) : (
            <p className="muted">Their first salary record starts after {formatDate(employee.asOf)}.</p>
          )}
          {scheduled.length > 0 && (
            <p className="scheduled-note">
              Scheduled:{" "}
              {scheduled
                .slice()
                .reverse()
                .map((r) => (
                  <span key={r.id}>
                    <Money value={r} /> from {formatDate(r.effectiveDate)}
                  </span>
                ))}
            </p>
          )}
        </div>
        <dl className="card profile">
          <dt>Email</dt>
          <dd>{employee.email}</dd>
          <dt>Started</dt>
          <dd>{formatDate(employee.startDate)}</dd>
          <dt>Employee ID</dt>
          <dd>{employee.id}</dd>
        </dl>
      </div>

      <h2>
        Salary history <AsOf date={employee.asOf} />
      </h2>
      <p className="muted small">
        Newest first. Records are never edited: a change, or a fix to a mistake, is a new record.
      </p>
      <div className={`table-wrap${detail.loading ? " stale" : ""}`}>
        <HistoryTable history={employee.salaryHistory} />
      </div>

      <SalaryForm employee={employee} onAdded={detail.reload} />
    </section>
  );
}

const STATUS_LABEL: Record<SalaryHistoryEntry["status"], string> = {
  current: "Current",
  scheduled: "Scheduled",
  past: "Past",
};

function HistoryTable({ history }: { history: SalaryHistoryEntry[] }) {
  return (
    <table className="history">
      <thead>
        <tr>
          <th>Effective</th>
          <th className="numeric">Annual salary</th>
          <th className="numeric">Change</th>
          <th>Reason</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {history.map((r, i) => (
          <tr key={r.id} className={`status-${r.status}`}>
            <td className="nowrap">{formatDate(r.effectiveDate)}</td>
            <td className="numeric">
              <Money value={r} />
            </td>
            <td className="numeric">
              {r.change ? (
                <span className={r.change.amountMinorUnits < 0 ? "down" : "up"}>
                  {formatSignedMoney(r.change.amountMinorUnits, r.currency, r.minorUnitExponent)}{" "}
                  <span className="muted">
                    ({r.change.percent > 0 ? "+" : ""}
                    {r.change.percent.toFixed(1)}%)
                  </span>
                </span>
              ) : i === history.length - 1 ? (
                <span className="muted">First record</span>
              ) : (
                <span className="muted">Currency changed</span>
              )}
            </td>
            <td>{reasonLabel(r.reason)}</td>
            <td>
              <span className={`badge badge-${r.status}`}>{STATUS_LABEL[r.status]}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
