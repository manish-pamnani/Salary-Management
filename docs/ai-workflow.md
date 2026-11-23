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
