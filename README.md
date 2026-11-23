# Salary Management

A web tool that lets ACME's HR manager manage salaries for 10,000 employees across countries, and answer how the org pays people. See [`docs/requirements.md`](docs/requirements.md).

## Status

- [x] Block 1: schema, migrations, deterministic 10,000-employee seed
- [x] API: employees, salary history, append salary, analytics, Ask panel
- [ ] UI
- [ ] Deploy and demo

## Run it

```bash
cd backend
npm install
npm run seed            # migrates, then seeds 10,000 employees into backend/data/salary.db
npm test                # unit and route tests (in-memory SQLite, ~1s)
npm run dev             # API on http://localhost:3000
npm run bench           # route latency at 10,000 employees -> docs/PERFORMANCE.md
```

## API

| Method & path | Purpose |
| --- | --- |
| `GET /api/employees` | Paged list. `search`, `country`, `department`, `currency`, `sort=name\|start_date\|salary`, `order`, `page`, `pageSize` (max 100). `sort=salary` needs a single currency (D8). |
| `GET /api/employees/:id` | Profile, current salary, history newest first with status and change |
| `POST /api/employees/:id/salary-records` | Append `{ amountMinorUnits, currency, effectiveDate, reason }`. Never overwrites. |
| `GET /api/analytics/pay-summary` | Headcount, total, median, min, max per country or department, per currency |
| `GET /api/ask/current-salary?q=` | Current salary by name |
| `GET /api/ask/department-cost?department=&month=` | Prorated monthly cost, per currency |
| `GET /api/ask/headcount-by-currency` | Headcount by current pay currency |
| `GET /api/meta` | Filter options and the date treated as today |

Money is always `amountMinorUnits` plus `currency` plus `minorUnitExponent`, never a float.

Seed options: `npm run seed -- --count 10000 --seed 42 --as-of 2026-11-23`. The same options always produce the same data. Set `DATABASE_PATH` to put the database elsewhere.

## Docs

- [Requirements](docs/requirements.md): goal, scope, what's left out and why
- [Decision log](docs/decisions.md): stack, data model, indexes, trade-offs
- [Performance](docs/PERFORMANCE.md): measured numbers
- [AI workflow](docs/ai-workflow.md): prompts and where judgment was applied
