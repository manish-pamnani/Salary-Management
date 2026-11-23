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
