/**
 * Route-level latency at full seed size: real HTTP over localhost, timed from
 * request start to fully parsed JSON. Run: npm run bench
 *
 * Seeds a fresh 10,000-employee database in a temp dir (seed 42, fixed date),
 * so numbers are comparable between runs and machines.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { generateSeedData } from "../src/seed/generate.js";
import { writeSeedData } from "../src/seed/write.js";

const AS_OF = "2026-11-23";
const WARMUP = 20;
const RUNS = 200;

const dir = mkdtempSync(join(tmpdir(), "salary-bench-"));
const db = openDatabase(join(dir, "bench.db"));
migrate(db);
writeSeedData(db, generateSeedData({ count: 10_000, seed: 42, asOf: AS_OF }));

const app = buildApp({ db, today: () => AS_OF });
const address = await app.listen({ port: 0, host: "127.0.0.1" });

const count = (filter: string) =>
  db.prepare(`SELECT count(*) FROM employees e WHERE ${filter}`).pluck().get() as number;
const lastPage = (total: number, size = 50) => Math.ceil(total / size);
const usdTotal = 2_989; // seed 42: employees currently paid in USD (asserted below)

const scenarios: [string, string][] = [
  ["List, page 1 (sort by name)", "/api/employees"],
  ["List, last page (offset 9,950)", `/api/employees?page=${lastPage(count("1"))}`],
  ["List, last page, 100 per page", `/api/employees?pageSize=100&page=${lastPage(count("1"), 100)}`],
  ["Search 'pat' (word prefix)", "/api/employees?search=pat"],
  ["Search + country + department", "/api/employees?search=a&country=IN&department=Engineering"],
  ["Sort by salary, USD, page 1", "/api/employees?sort=salary&order=desc&currency=USD"],
  ["Sort by salary, USD, last page", `/api/employees?sort=salary&order=desc&currency=USD&page=${lastPage(usdTotal)}`],
  ["Sort by salary, country=GB (currency resolved)", "/api/employees?sort=salary&order=desc&country=GB"],
  ["Sort by salary, no filter -> 400", "/api/employees?sort=salary"],
  ["Employee detail with history", "/api/employees/1234"],
  ["Pay summary by country", "/api/analytics/pay-summary?groupBy=country"],
  ["Pay summary by department", "/api/analytics/pay-summary?groupBy=department"],
  ["Ask: department cost this month", "/api/ask/department-cost?department=Engineering"],
  ["Ask: headcount by currency", "/api/ask/headcount-by-currency"],
  ["Ask: current salary 'priya'", "/api/ask/current-salary?q=priya"],
];

async function time(url: string): Promise<{ ms: number; bytes: number; status: number }> {
  const started = performance.now();
  const res = await fetch(`${address}${url}`);
  const text = await res.text();
  JSON.parse(text);
  return { ms: performance.now() - started, bytes: text.length, status: res.status };
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

const check = await (await fetch(`${address}/api/employees?currency=USD&pageSize=1`)).json() as { total: number };
if (check.total !== usdTotal) throw new Error(`Expected ${usdTotal} USD employees, got ${check.total}`);

console.log(`Route latency, 10,000 employees, ${RUNS} sequential requests each after ${WARMUP} warm-up\n`);
console.log("| Scenario | Status | p50 ms | p95 ms | max ms | Response |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const [name, url] of scenarios) {
  for (let i = 0; i < WARMUP; i++) await time(url);
  const samples: number[] = [];
  let last = { bytes: 0, status: 0 };
  for (let i = 0; i < RUNS; i++) {
    const result = await time(url);
    samples.push(result.ms);
    last = result;
  }
  samples.sort((a, b) => a - b);
  const fmt = (n: number) => n.toFixed(1);
  console.log(
    `| ${name} | ${last.status} | ${fmt(percentile(samples, 50))} | ${fmt(percentile(samples, 95))} | ` +
      `${fmt(samples.at(-1)!)} | ${(last.bytes / 1024).toFixed(1)} KB |`,
  );
}

await app.close();
db.close();
rmSync(dir, { recursive: true, force: true });
