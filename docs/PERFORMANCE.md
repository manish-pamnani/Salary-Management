# Performance

Numbers are measured, not estimated. Machine: Apple Silicon Mac, Node 24, SQLite 3.53 (bundled with better-sqlite3).

## Seed (10,000 employees)

| Step | Result |
| --- | --- |
| Rows | 10,000 employees, 61,084 salary records (seed 42, as of 2026-11-23) |
| Generate (pure JS) | ~39 ms |
| Write (one transaction, prepared statements, then `ANALYZE`) | ~184 ms |

A single transaction is what makes this fast. With autocommit, each insert is its own fsync, which takes minutes for 70k rows.

## Queries at full seed size

| Query | Time |
| --- | --- |
| Current salary for every employee (correlated "latest record ≤ as-of" subquery), grouped by currency | 16 ms (`sqlite3 .timer`) |

The plan for each hot query is pinned by tests (`backend/test/schema.test.ts`, "query plans").

## Salary sort (decision D8)

Sorted page of 50 by current salary, at offset 5,000, warm cache, median of 3 runs:

| Query | Time |
| --- | --- |
| Correlated as-of subquery, all 10,000 employees | ~10 ms |
| Same, `WHERE country_code = 'US'` | ~1–2 ms |
| Window function (`row_number()` per employee) | ~39 ms |

## Route latency (what the 300 ms budget is about)

`npm run bench` (in `backend/`) seeds a fresh 10,000-employee database (seed 42, as of 2026-11-23), starts the real Fastify server, and times each request over localhost HTTP, from send to fully parsed JSON. 200 sequential requests per scenario after 20 warm-up requests. Single user, which matches a single-manager tool; concurrency is not measured.

| Scenario | Status | p50 ms | p95 ms | max ms | Response |
| --- | --- | --- | --- | --- | --- |
| List, page 1 (sort by name) | 200 | 0.3 | 0.4 | 1.4 | 14.7 KB |
| List, last page (offset 9,950) | 200 | 4.6 | 4.8 | 5.6 | 14.6 KB |
| List, last page, 100 per page | 200 | 4.7 | 5.0 | 5.8 | 29.1 KB |
| Search 'pat' (word prefix) | 200 | 2.1 | 2.2 | 2.6 | 14.6 KB |
| Search + country + department | 200 | 0.8 | 1.0 | 1.9 | 14.7 KB |
| Sort by salary, USD, page 1 | 200 | 8.7 | 9.2 | 21.9 | 14.8 KB |
| Sort by salary, USD, last page | 200 | 10.8 | 12.0 | 19.5 | 11.8 KB |
| Sort by salary, country=GB (currency resolved) | 200 | 1.1 | 1.2 | 1.9 | 14.8 KB |
| Sort by salary, no filter -> 400 | 400 | 4.8 | 5.0 | 6.5 | 0.2 KB |
| Employee detail with history | 200 | 0.1 | 0.1 | 0.3 | 1.5 KB |
| Pay summary by country | 200 | 16.7 | 17.2 | 24.0 | 1.4 KB |
| Pay summary by department | 200 | 18.5 | 19.0 | 23.1 | 12.8 KB |
| Ask: department cost this month | 200 | 19.1 | 19.7 | 19.8 | 0.7 KB |
| Ask: headcount by currency | 200 | 4.9 | 5.0 | 5.3 | 0.3 KB |
| Ask: current salary 'priya' | 200 | 2.3 | 2.4 | 2.4 | 1.5 KB |

Measured on an Apple Silicon Mac, Node 24. The worst p95 is about 20 ms, roughly 15× inside the 300 ms target.

### Where the limits are

- **Offset pagination degrades with depth.** Sorted by name, page 1 takes 0.3 ms and the last page (offset 9,950) takes 4.6 ms: about 15× slower, because SQLite builds and discards every skipped row, and here each of those includes a current-salary lookup. It is linear in the offset, so at 100k employees the deepest page would be roughly 50 ms. Still fine, but the curve is visible. **The fix, if it ever matters, is keyset pagination:** `WHERE (sort_key, id) > (:lastKey, :lastId) ORDER BY sort_key, id LIMIT 50`, which costs the same on every page. It is not done in v1 because it makes "jump to page N" awkward and the numbers don't call for it.
- **Salary sort has to rank every candidate before paging,** so page 1 and the last page cost about the same (~9–12 ms for the ~3,000 USD earners). That cost grows with the number of people in one currency, not with the offset. The fallback is in D8: a resolved current-salary table with `next_change_date`.
- **The 400 for an unsupported salary sort costs ~5 ms,** because proving "more than one currency" means checking the current currency of every matching row. `SELECT DISTINCT` cannot stop early once it has seen two currencies. That is acceptable, and it's the price of not assuming a country implies a currency.
- **Aggregates (~17–20 ms) are the slowest routes:** they compute the current salary for all 10,000 people, then window over them for medians. They run on demand, not per keystroke, so nothing is cached.
- **Search is a scan, on purpose.** See D9.

## Deployed (Render free plan)

Live at https://salary-management-yguf.onrender.com. It runs one Docker container with SQLite on the container's own disk, seeded on boot when empty.

### Warm latency, measured from the developer's machine (India)

`npm run bench:remote -- <url>`: 30 requests per path over one kept-alive connection (TLS paid once, as in a browser), measured on 2026-11-23. **Server** is the app's own time, from the `Server-Timing: app;dur=` header on every response: request in to response body serialized. **Network** is total minus server: the round trip from India to Render's region, plus transfer.

| Path | Total p50 | Total p95 | Server p50 | Server p95 | Network p50 |
| --- | --- | --- | --- | --- | --- |
| `/api/health` | 283 ms | 364 ms | 0.1 ms | 0.2 ms | 283 ms |
| `/api/employees` | 286 ms | 359 ms | 1.3 ms | 4.5 ms | 285 ms |
| `/api/employees?page=200` | 293 ms | 399 ms | 15 ms | 105 ms | 268 ms |
| `/api/employees?search=pat` | 282 ms | 384 ms | 6.3 ms | 7.5 ms | 275 ms |
| `/api/employees?sort=salary&order=desc&currency=USD&page=60` | 385 ms | 511 ms | 49 ms | 240 ms | 266 ms |
| `/api/employees/1234` | 268 ms | 364 ms | 0.8 ms | 1.1 ms | 267 ms |
| `/api/analytics/pay-summary?groupBy=department` | 417 ms | 666 ms | 142 ms | 316 ms | 267 ms |
| `/api/ask/department-cost?department=Engineering` | 487 ms | 592 ms | 151 ms | 242 ms | 280 ms |

**How to read this:**
- **The list route is ~1 ms of server time and ~285 ms of network.** Every row pays the same 265–285 ms round trip, including `/api/health`, which does no work. That depends on where the viewer is, not on the code. A host region closer to the users (e.g. Singapore for a Delhi-based manager) would cut it; Render fixes a service's region when it's created, so moving means a new service.
- **Server time on the free plan is ~3–10× the laptop numbers** for CPU-bound routes: about 150 ms vs 17–20 ms for the aggregates, and 49 ms vs 9–12 ms for the salary sort. The free instance gets a fraction of a CPU.
- **Server p95 is much higher than p50 on the heavier routes** (salary sort 49 → 240 ms, deep page 15 → 105 ms). The median stays low, which points to CPU throttling under bursts of back-to-back requests rather than slow queries.
- **Against the requirements' 300 ms target (set for local):** every route's *server* time is within it, worst p95 316 ms for pay summary under throttling, and is met ~15× over locally. If the aggregates' server time ever matters on real hardware, D8's resolved current-salary table is the next step.

### Cold start

Render's free plan puts the service to sleep after 15 minutes without traffic. Measured on 2026-11-23, after more than 25 idle minutes:

| Request | Time |
| --- | --- |
| First `/api/employees` after sleep | **17.4 s** (HTTP 200) |
| Next three requests | 0.33 s, 0.32 s, 0.81 s |

**Where the 17 s goes:** almost all of it is Render waking the container (scheduling it and starting the image), not this app. Started from an empty disk, the app reaches "listening" in ~0.33 s natively, ~0.25 s of which is the 10k reseed. Under amd64 emulation it takes ~0.96 s (`bootMs` in the logs). So seeding on boot adds about a second at most to a cold start, and is not what makes it slow.

**What it means in practice:** the first visitor after a quiet period waits about 17 s; everyone after that gets normal speed. Before recording the demo, open the URL once to wake it. A paid instance doesn't sleep and has no cold start. It would also keep data between restarts once a disk is attached (see `render.yaml`).

*Measurement note:* two earlier attempts used a background "wait 16 minutes, then request" job. The laptop slept and paused both timers, so neither fired on schedule. One eventually resumed and sent its request three minutes after the direct measurement had woken the service, so it recorded a warm 0.37 s; that result is discarded. The number above comes from a direct request after a verified 25+ minute idle period.
