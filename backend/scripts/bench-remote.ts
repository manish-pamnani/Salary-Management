/**
 * Latency of a deployed instance from this machine, over a kept-alive
 * connection (so TLS setup is paid once, as in a browser). Subtract the
 * /api/health row to estimate server time vs network round trip.
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
console.log("| Path | p50 ms | p95 ms |\n| --- | --- | --- |");
for (const path of paths) {
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    const res = await fetch(`${base}${path}`);
    await res.json();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  console.log(`| \`${path}\` | ${pct(samples, 50).toFixed(0)} | ${pct(samples, 95).toFixed(0)} |`);
}
