import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, query, type EmployeeList } from "../api";
import { Money } from "../components/Money";
import { AsOf, ErrorBox, Loading } from "../components/Status";
import { countryName, formatDate } from "../format";
import { useMeta } from "../meta";
import { useApi, useDebounced } from "../useApi";

export const PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 300;

type SortKey = "name" | "start_date" | "salary";

/**
 * The employee directory. All state lives in the URL, so a filtered, sorted
 * page survives a reload, a shared link, and the back button from a detail page.
 */
export function DirectoryPage() {
  const meta = useMeta();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const country = params.get("country") ?? "";
  const department = params.get("department") ?? "";
  const currency = params.get("currency") ?? "";
  const sort = (params.get("sort") ?? "name") as SortKey;
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.get("page")) || 1);

  // Changing any filter goes back to page 1.
  const update = (changes: Record<string, string>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: "search" in changes },
    );
  };

  // The box updates immediately; the request waits until typing pauses.
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounced(searchInput, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (debouncedSearch.trim() !== search) update({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  // Keep the box in step when the URL changes from outside (back button, "Clear").
  useEffect(() => setSearchInput((current) => (current.trim() === search ? current : search)), [search]);

  const list = useApi<EmployeeList>(
    `/employees${query({ search, country, department, currency, sort, order, page, pageSize: PAGE_SIZE })}`,
  );

  // Which currencies are in play decides whether "sort by salary" means anything (D8).
  const currencyError =
    list.error instanceof ApiError && list.error.code === "currency_required" ? list.error : undefined;
  const currencies =
    list.data?.salaryCurrencies ?? (currencyError?.details.currencies as string[] | undefined) ?? [];
  const salarySortable = currencies.length === 1;

  const toggleSort = (key: SortKey) => {
    const nextOrder = sort === key && order === "asc" ? "desc" : key === "salary" && sort !== key ? "desc" : "asc";
    update({ sort: key === "name" ? "" : key, order: nextOrder === "asc" ? "" : "desc" });
  };

  const filtered = Boolean(search || country || department || currency);
  const total = list.data?.total;
  const lastPage = total === undefined ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <div className="page-title">
        <h1>Employees</h1>
        {total !== undefined && (
          <p className="muted">
            {total.toLocaleString("en")} {filtered ? "matching" : "in total"}
          </p>
        )}
      </div>

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="grow">
          <span>Search</span>
          <input
            type="search"
            placeholder="Name or email, e.g. “pat” finds Priya Patel"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          <span>Country</span>
          <select value={country} onChange={(e) => update({ country: e.target.value })}>
            <option value="">All countries</option>
            {meta.countries.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Department</span>
          <select value={department} onChange={(e) => update({ department: e.target.value })}>
            <option value="">All departments</option>
            {meta.departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Paid in</span>
          <select value={currency} onChange={(e) => update({ currency: e.target.value })}>
            <option value="">Any currency</option>
            {meta.currencies.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setSearchInput("");
              setParams(new URLSearchParams());
            }}
          >
            Clear
          </button>
        )}
      </form>

      <SalarySortNote currencies={currencies} total={total} sortingBySalary={sort === "salary"} />

      {currencyError ? (
        <div className="error" role="alert">
          <p>{currencyError.message}</p>
          <button type="button" onClick={() => update({ sort: "", order: "" })}>
            Sort by name instead
          </button>
        </div>
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading slow={list.slow} />
      ) : (
        <>
          <div className={`table-wrap${list.loading ? " stale" : ""}`} aria-busy={list.loading}>
            <table className="directory">
              <thead>
                <tr>
                  <SortHeader label="Name" sortKey="name" sort={sort} order={order} onSort={toggleSort} />
                  <th>Country</th>
                  <th>Department</th>
                  <th>Title</th>
                  <SortHeader label="Start date" sortKey="start_date" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader
                    label={
                      <>
                        Current salary <AsOf date={list.data.asOf} />
                      </>
                    }
                    sortKey="salary"
                    sort={sort}
                    order={order}
                    onSort={toggleSort}
                    disabled={!salarySortable}
                    describedBy="salary-sort-note"
                    numeric
                  />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/employees/${e.id}`}>{e.fullName}</Link>
                      <div className="muted small">{e.email}</div>
                    </td>
                    <td>{countryName(e.countryCode)}</td>
                    <td>{e.department}</td>
                    <td>{e.jobTitle}</td>
                    <td className="nowrap">{formatDate(e.startDate)}</td>
                    <td className="numeric">
                      <Money value={e.currentSalary} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data.items.length === 0 && <p className="empty">No employees match these filters.</p>}
          </div>
          <Pagination
            page={page}
            lastPage={lastPage}
            total={list.data.total}
            onPage={(p) => update({ page: p === 1 ? "" : String(p) })}
          />
        </>
      )}
    </section>
  );
}

/**
 * Always-visible line explaining the salary column. A disabled control with no
 * reason looks like a bug, so the reason is on the page, not only in a tooltip.
 */
function SalarySortNote({
  currencies,
  total,
  sortingBySalary,
}: {
  currencies: string[];
  total: number | undefined;
  sortingBySalary: boolean;
}) {
  let text: string;
  if (currencies.length > 1) {
    const who = total === undefined ? "Matching employees" : `These ${total.toLocaleString("en")} employees`;
    text =
      `Sorting by salary is off: ${who.charAt(0).toLowerCase() + who.slice(1)} are paid in ${currencies.length} ` +
      `currencies (${currencies.join(", ")}), and ranking rupees against dollars means nothing without ` +
      "exchange rates. Choose a currency under “Paid in” to sort by pay.";
  } else if (currencies.length === 1) {
    text = sortingBySalary
      ? `Sorted by current salary in ${currencies[0]}.`
      : `Everyone here is paid in ${currencies[0]}, so you can sort by salary.`;
  } else {
    text = "No one here has a current salary to sort by.";
  }
  return (
    <p id="salary-sort-note" className={`note${currencies.length > 1 ? " note-off" : ""}`}>
      {text}
    </p>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  order,
  onSort,
  disabled = false,
  describedBy,
  numeric = false,
}: {
  label: React.ReactNode;
  sortKey: SortKey;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (key: SortKey) => void;
  disabled?: boolean;
  describedBy?: string;
  numeric?: boolean;
}) {
  const active = sort === sortKey;
  return (
    <th
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={numeric ? "numeric" : undefined}
    >
      <button
        type="button"
        className="sort-button"
        onClick={() => onSort(sortKey)}
        disabled={disabled}
        aria-describedby={describedBy}
      >
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (order === "asc" ? "▲" : "▼") : disabled ? "" : "↕"}
        </span>
      </button>
    </th>
  );
}

function Pagination({
  page,
  lastPage,
  total,
  onPage,
}: {
  page: number;
  lastPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={() => onPage(1)} disabled={page <= 1}>
        « First
      </button>
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        ‹ Previous
      </button>
      <span>
        {from.toLocaleString("en")}–{to.toLocaleString("en")} of {total.toLocaleString("en")} · page {page} of{" "}
        {lastPage.toLocaleString("en")}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= lastPage}>
        Next ›
      </button>
      <button type="button" onClick={() => onPage(lastPage)} disabled={page >= lastPage}>
        Last »
      </button>
    </nav>
  );
}
