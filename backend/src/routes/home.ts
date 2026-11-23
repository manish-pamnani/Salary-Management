import type { FastifyPluginAsync } from "fastify";
import type { RouteContext } from "../app.js";

const REPO_URL = "https://github.com/manish-pamnani/Salary-Management";

const EXAMPLES: [path: string, description: string][] = [
  ["/api/employees", "Employees, 50 per page, sorted by name, each with current salary"],
  ["/api/employees?search=pat&country=IN", "Search by the start of any word in the name, filtered by country"],
  ["/api/employees?sort=salary&order=desc&currency=USD", "Highest paid in USD (salary sort needs one currency)"],
  ["/api/employees?sort=salary", "…and the 400 you get without one, naming the currencies"],
  ["/api/employees/1356", "One employee with full salary history, statuses and changes"],
  ["/api/analytics/pay-summary?groupBy=country", "Headcount, total, median, min, max per country and currency"],
  ["/api/analytics/pay-summary?groupBy=department", "The same, per department"],
  ["/api/ask/current-salary?q=priya%20patel", "Current salary by name: every match, to disambiguate"],
  ["/api/ask/department-cost?department=Engineering", "This month's prorated cost of a department, per currency"],
  ["/api/ask/headcount-by-currency", "Headcount by the currency people are paid in"],
  ["/api/meta", "Filter options, today's date and the time zone deciding it"],
];

/** Landing page at / so the deployed URL explains itself instead of returning a 404. */
export const homeRoutes =
  ({ today, timeZone }: RouteContext): FastifyPluginAsync =>
  async (app) => {
    const page = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salary Management API</title>
<style>
  :root { color-scheme: light dark; --muted: #667; --line: #ddd; --accent: #2457c5; --note: #fff7e0; }
  @media (prefers-color-scheme: dark) { :root { --muted: #99a; --line: #333; --accent: #7aa2ff; --note: #2c2615; } }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: .25rem; } .sub { color: var(--muted); margin-top: 0; }
  .asof { display: inline-block; border: 1px solid var(--line); border-radius: 6px; padding: .25rem .6rem; font-weight: 600; }
  .note { background: var(--note); border-radius: 6px; padding: .75rem 1rem; }
  table { border-collapse: collapse; width: 100%; } td { border-top: 1px solid var(--line); padding: .5rem .25rem; vertical-align: top; }
  code, a { font-family: ui-monospace, monospace; font-size: .9em; word-break: break-all; } a { color: var(--accent); }
</style>
</head>
<body>
<h1>Salary Management API</h1>
<p class="sub">Salary history and pay analytics for ACME's 10,000 employees across 8 countries. Backend for an HR manager's web tool.</p>
<p class="asof">Salaries are current as of ${today()} (${timeZone})</p>
<p>A salary is stored as an effective-dated history, not a single number: "current" means the latest record on or before that date. Records dated later are scheduled, not current. Amounts are integers in minor units (<code>amountMinorUnits</code> with <code>minorUnitExponent</code>), and different currencies are never added together.</p>
<div class="note"><strong>Demo instance, read before editing:</strong> this runs on a free plan. The database lives on the container's disk and is reseeded with the same 10,000 employees whenever the container restarts. Salary records you add through the API are <strong>not persistent</strong>. They last until the next restart or redeploy. If the instance has been idle, the first request can take about 17 seconds while it wakes up.</div>
<h2>Try it</h2>
<table>
${EXAMPLES.map(([path, description]) => `<tr><td><a href="${path}">${path}</a></td><td>${description}</td></tr>`).join("\n")}
<tr><td><code>POST /api/employees/:id/salary-records</code></td><td>Append <code>{ amountMinorUnits, currency, effectiveDate, reason }</code>. Records are never overwritten: 409 if one exists on that date.</td></tr>
</table>
<p>Code, requirements, decision log and performance notes: <a href="${REPO_URL}">${REPO_URL}</a></p>
</body>
</html>`;

    app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(page()));
    app.get("/api", async (_request, reply) => reply.type("text/html; charset=utf-8").send(page()));
  };
