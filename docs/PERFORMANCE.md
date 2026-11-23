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

The plan for each hot query is pinned by tests (`backend/test/schema.test.ts`, "query plans"). API latency numbers for list and search will be added in the API block.

## Salary sort (decision D8)

Sorted page of 50 by current salary, at offset 5,000, warm cache, median of 3 runs:

| Query | Time |
| --- | --- |
| Correlated as-of subquery, all 10,000 employees | ~10 ms |
| Same, `WHERE country_code = 'US'` | ~1–2 ms |
| Window function (`row_number()` per employee) | ~39 ms |
