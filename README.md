# Salary Management

**Live API:** https://salary-management-yguf.onrender.com (see [limits of the live demo](#limits-of-the-live-demo) before editing data).

A web tool that lets ACME's HR manager manage salaries for 10,000 employees across countries, and answer how the org pays people. See [`docs/requirements.md`](docs/requirements.md).

## Status

- [x] Block 1: schema, migrations, deterministic 10,000-employee seed
- [x] API: employees, salary history, append salary, analytics, Ask panel
- [ ] UI
- [x] Deploy API (Render, Docker, seeded on boot)
- [ ] Demo video

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

## Limits of the live demo

- **Edits don't persist across restarts.** The live instance is on Render's free plan, which has no persistent disk: Render offers disks only on paid instances. SQLite lives on the container's own disk and is reseeded with the same 10,000 employees whenever the container starts. A salary record you add stays until the next restart, sleep or redeploy, then reverts. This is a hosting limit, not a bug. A paid instance with the disk block in `render.yaml` uncommented keeps the same code and keeps data; seeding only happens when the database is empty.
- **The free instance sleeps after 15 idle minutes and takes about 17 s to wake** (measured; see [PERFORMANCE.md](docs/PERFORMANCE.md#cold-start)). A [GitHub Actions job](.github/workflows/keep-warm.yml) pings it every 10 minutes during the review window. GitHub runs schedules best-effort, so an occasional slow first load is still possible. An always-awake service uses about 744 of the 750 free instance-hours Render gives each month.
- **"Today" is a date on the org's calendar (`ORG_TIMEZONE`, set to Asia/Kolkata).** It decides which salary counts as current and which month counts as this month. The page at `/` and `/api/meta` show it.

## Docs

- [Requirements](docs/requirements.md): goal, scope, what's left out and why
- [Decision log](docs/decisions.md): stack, data model, indexes, trade-offs
- [Performance](docs/PERFORMANCE.md): measured numbers
- [AI workflow](docs/ai-workflow.md): prompts and where judgment was applied
