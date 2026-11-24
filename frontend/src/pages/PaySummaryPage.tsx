import { useSearchParams } from "react-router";
import type { PaySummary, PaySummaryRow } from "../api";
import { AsOf, ErrorBox, Loading } from "../components/Status";
import { countryName, formatMoney } from "../format";
import { useApi } from "../useApi";

/** Headcount and annual pay per country or department, one row per currency. */
export function PaySummaryPage() {
  const [params, setParams] = useSearchParams();
  const groupBy = params.get("groupBy") === "department" ? "department" : "country";
  const summary = useApi<PaySummary>(`/analytics/pay-summary?groupBy=${groupBy}`);

  const groups = new Map<string, PaySummaryRow[]>();
  for (const row of summary.data?.rows ?? []) {
    groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  }
  const label = (group: string) => (groupBy === "country" ? countryName(group) : group);

  return (
    <section>
      <div className="page-title">
        <h1>
          Pay by {groupBy} {summary.data && <AsOf date={summary.data.asOf} />}
        </h1>
        <div className="segmented" role="group" aria-label="Group by">
          {(["country", "department"] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={groupBy === g}
              onClick={() => setParams(g === "country" ? {} : { groupBy: g })}
            >
              By {g}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Current annual salaries. Each currency is its own row: totals are never added across currencies, because
        that needs exchange rates the tool deliberately does not have.
      </p>

      {summary.error ? (
        <ErrorBox error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <Loading slow={summary.slow} />
      ) : (
        <div className={`table-wrap${summary.loading ? " stale" : ""}`}>
          <table className="summary">
            <thead>
              <tr>
                <th>{groupBy === "country" ? "Country" : "Department"}</th>
                <th>Currency</th>
                <th className="numeric">Headcount</th>
                <th className="numeric">Total annual pay</th>
                <th className="numeric">Median</th>
                <th className="numeric">Lowest</th>
                <th className="numeric">Highest</th>
              </tr>
            </thead>
            {[...groups].map(([group, rows]) => (
              <tbody key={group}>
                {rows.map((r, i) => {
                  const fmt = (n: number) => formatMoney(n, r.currency, r.minorUnitExponent);
                  return (
                    <tr key={r.currency} className={i === 0 ? "group-start" : undefined}>
                      {i === 0 && (
                        <th scope="rowgroup" rowSpan={rows.length}>
                          {label(group)}
                        </th>
                      )}
                      <td>{r.currency}</td>
                      <td className="numeric">{r.headcount.toLocaleString("en")}</td>
                      <td className="numeric">{fmt(r.totalMinorUnits)}</td>
                      <td className="numeric">{fmt(r.medianMinorUnits)}</td>
                      <td className="numeric">{fmt(r.minMinorUnits)}</td>
                      <td className="numeric">{fmt(r.maxMinorUnits)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
