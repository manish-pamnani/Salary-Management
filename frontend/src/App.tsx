import { NavLink, Outlet } from "react-router";
import type { Meta } from "./api";
import { ErrorBox, Loading } from "./components/Status";
import { formatDate } from "./format";
import { MetaContext } from "./meta";
import { useApi } from "./useApi";

export function App() {
  const meta = useApi<Meta>("/meta");

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ◆
          </span>{" "}
          ACME Salaries
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Employees
          </NavLink>
          <NavLink to="/pay-summary">Pay summary</NavLink>
          <NavLink to="/ask">Ask</NavLink>
        </nav>
        {meta.data && (
          <p className="asof-header" data-testid="asof-header">
            Salaries as of <strong>{formatDate(meta.data.today)}</strong>
            <span className="muted"> · {meta.data.timeZone} calendar</span>
          </p>
        )}
      </header>
      <main>
        {meta.data ? (
          <MetaContext.Provider value={meta.data}>
            <Outlet />
          </MetaContext.Provider>
        ) : meta.error ? (
          <ErrorBox error={meta.error} onRetry={meta.reload} />
        ) : (
          <Loading slow={meta.slow} label="Connecting to the server…" />
        )}
      </main>
    </div>
  );
}
