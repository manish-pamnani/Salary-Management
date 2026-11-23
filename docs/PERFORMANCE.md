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
