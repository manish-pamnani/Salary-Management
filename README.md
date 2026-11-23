# Salary Management

A web tool that lets ACME's HR manager manage salaries for 10,000 employees across countries, and answer how the org pays people. See [`docs/requirements.md`](docs/requirements.md).

## Status

- [x] Block 1: schema, migrations, deterministic 10,000-employee seed
- [ ] API
- [ ] UI
- [ ] Deploy and demo

## Run it

```bash
cd backend
npm install
npm run seed            # migrates, then seeds 10,000 employees into backend/data/salary.db
npm test                # unit tests (in-memory SQLite, ~1s)
```

Seed options: `npm run seed -- --count 10000 --seed 42 --as-of 2026-11-23`. The same options always produce the same data. Set `DATABASE_PATH` to put the database elsewhere.

## Docs

- [Requirements](docs/requirements.md): goal, scope, what's left out and why
- [Decision log](docs/decisions.md): stack, data model, indexes, trade-offs
- [Performance](docs/PERFORMANCE.md): measured numbers
- [AI workflow](docs/ai-workflow.md): prompts and where judgment was applied
