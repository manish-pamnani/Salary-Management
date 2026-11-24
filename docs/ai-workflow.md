# How AI tools were used

Built with Claude Code (agentic CLI). The requirements in `docs/requirements.md` were written first, by me, before any code. The agent was then given the brief and worked in time-boxed blocks, one instruction each, committing as it went.

## Block 1: schema and seed

**Prompt:** "We already have the requirements in docs/requirements.md. Block one today: schema and seed, uninterrupted, and commit as you go."

What the agent did, and where judgment was applied:

- Read the requirements and **found a contradiction**: future dates were both rejected and required to be excluded from "current". It resolved this in favour of scheduled raises and recorded the change (decisions D4).
- **Dropped a redundant index** the requirements asked for, after reasoning that the UNIQUE constraint already covers it. Tests on `EXPLAIN QUERY PLAN` prove the queries still seek.
- **Caught its own weak test:** the first name-search plan assertion only checked that the index was mentioned, which a full index scan would also satisfy. It inspected the real plan and tightened the test to require `SEARCH` with a range.
- **Caught its own bug:** the promotion cap counted from level 0, not the employee's hire level, so a Lead could be promoted past Principal. It was fixed before commit.
- Replaced `Math.random()` in a test helper with a counter to keep tests deterministic.

Human review checklist for this block: the schema, the decision log, and the seed distributions. The agent's own check found that headcount per currency equals headcount per country, and that average pay per currency is plausible.

## Block 2: the salary-sort decision, then the API

**Prompt 1:** "Decide now between computing current salary into a resolved table or view refreshed on write, a window function in SQLite to rank within one query, or simply not offering salary as a sort column in v1."

The agent measured all three before deciding. Speed turned out not to be the problem (the correlated subquery took ~10 ms). The benchmark output showed the real one: an unfiltered sort ranked ¥14.6M between $146,200 and R$146,000. It also rejected refresh-on-write, because a scheduled raise becomes current without any write happening (D8).

**Prompt 2 (my review of D8):** a total-order tie-breaker; "a country does not imply a currency" under future-dated transfers; measure at the HTTP route, not only the SQL, including deep offsets.

What the agent did, and where judgment was applied:

- Wrote the future-dated-transfer case as a test before relying on the rule: an employee in GB still paid in INR until the 1st of next month. The test asserts the 400 today and success on the effective date.
- **Mutation-tested its own tie-breaker test** and found that SQLite emits ties in rowid order even without `e.id ASC`, so deleting the tie-breaker would not fail the test. It recorded that caveat in the test instead of claiming coverage it doesn't have, and confirmed the test does catch a wrong direction (`id DESC`).
- Prorated department cost by day, not "annual ÷ 12", so mid-month raises, hires and relocations count only for their days.
- **Got a test wrong and kept the code:** the test rounded each person's cost before summing, while the SQL rounds once at the end. It fixed the test's arithmetic and documented the drift in the test.
- Deviated from the requirements' "search against an indexed column" with numbers (D9).

## Block 3: the UI

**Prompt:** "The UI, working against the API you already deployed. The list with server-side pagination, the country and department filters plus the search box, the salary column disabled until a single currency is in play with the reason visible, the detail page with history and the append form, and the Ask panel with the three questions." An earlier instruction set the one non-obvious requirement: label the as-of date everywhere money appears, in the header, not a footnote.

What the agent did, and where judgment was applied:

- **Changed the API before building the column.** To disable the salary sort "until a single currency is in play", the UI has to know which currencies are in play. Rather than trying the sort and waiting for a 400, the list now returns `salaryCurrencies` and `asOf`. It re-ran the benchmark and wrote down the cost (~5 ms on the unfiltered list).
- **Took the as-of date from each response, not the browser clock,** so labels stay true when the org's calendar and the viewer's disagree (D10, D11).
- **Chose Vite over Next** and recorded why (D11). Also recorded why there is no virtualised list, instead of adding one to tick the box.
- **Drove the app in a real browser** (local API, then the production Docker image): the salary column enabling under a currency filter, a scheduled record appended and shown as scheduled while the current salary stayed put, the Ask answers, and a reload on a deep link.
- **Mutation-tested the UI tests:** with the debounce removed, the search test fails; with the salary column always enabled, two tests fail.
- **Caught a flaky test** that only failed under parallel load: it read the column header before the list had loaded. It now waits for the rows.
- **Fixed a real bug found while debugging something else:** a request aborted while its body was being read returned `null` as if it were data. The client now checks the signal after reading.
