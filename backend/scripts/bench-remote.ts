/**
 * Latency of a deployed instance from this machine, over a kept-alive
 * connection (so TLS setup is paid once, as in a browser). Each response's
 * Server-Timing header gives the server's own time; total minus that is
 * network (round trip + transfer), so the two are reported separately.
 * Run: npm run bench:remote -- https://your-app.onrender.com
 */
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) throw new Error("Usage: npm run bench:remote -- <base-url>");
const RUNS = 30;

const paths = [
  "/api/health",
  "/api/employees",
  "/api/employees?page=200",
  "/api/employees?search=pat",
  "/api/employees?sort=salary&order=desc&currency=USD&page=60",
  "/api/employees/1234",
  "/api/analytics/pay-summary?groupBy=department",
  "/api/ask/department-cost?department=Engineering",
];

const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;

await fetch(`${base}/api/health`); // open the connection
const serverMs = (res: Response) => {
  const match = /app;dur=([\d.]+)/.exec(res.headers.get("server-timing") ?? "");
  if (!match) throw new Error("No Server-Timing header: is the deployed build current?");
  return Number(match[1]);
};

console.log("| Path | Total p50 | Total p95 | Server p50 | Server p95 | Network p50 |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const path of paths) {
  const total: number[] = [];
  const server: number[] = [];
  const network: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    const res = await fetch(`${base}${path}`);
    await res.json();
    const elapsed = performance.now() - t;
    const s = serverMs(res);
    total.push(elapsed);
    server.push(s);
    network.push(elapsed - s);
  }
  for (const list of [total, server, network]) list.sort((a, b) => a - b);
  const f = (n: number) => `${n < 10 ? n.toFixed(1) : n.toFixed(0)} ms`;
  console.log(
    `| \`${path}\` | ${f(pct(total, 50))} | ${f(pct(total, 95))} | ${f(pct(server, 50))} | ${f(pct(server, 95))} | ${f(pct(network, 50))} |`,
  );
}
