# Salary Management: Requirements (v1)

## Goal

Give one HR manager at ACME, with 10,000 employees across multiple countries, a web tool that replaces the salary spreadsheet and answers "how do we pay people" without exporting to Excel.

## The user, and the question underneath the request

The persona is the HR manager. Their real question is rarely "what is this person paid". It's "what were we paying them in March", "what does the India engineering band look like now", "what did that department cost us last quarter". A salary is a history, not a field. A single editable number column throws away the only information the manager actually needs: when pay changed, and why.

## In scope

- Employee directory: 10,000 seeded employees, searchable, paginated on the server. Name, country, department, current salary in local currency.
- Employee detail: profile, plus salary history ordered by effective date, with the change between consecutive records.
- Add and edit salary: an effective-dated record carrying amount, currency, effective date and reason. Never overwrites, always appends. The record with the latest effective date that isn't in the future is the current salary.
- Aggregates: headcount and total pay by country and by department, computed in SQL, each currency reported separately.
- Ask: one small panel answering three fixed questions from SQL. Current salary for an employee. Total department cost this month. Headcount by currency.

## Deliberately out of scope
Auth, roles and SSO: single-tenant internal tool, and access control would eat the whole budget without touching the interesting problem.
Payroll runs, tax and statutory deductions: that's a payroll product with jurisdiction rules. The brief is management and questions, not paying people.
Approvals and workflow: adds state without changing the core question.
CSV import: the seed script covers the demo, and import needs its own error handling to be worth anything.
Currency conversion: it forces an FX rate source and a reporting-currency decision, and it hides the more honest answer, which is to keep currencies apart rather than add rupees to dollars.
Internationalisation, notifications, mobile app.

## Data model

employees: id, name, email, country, department, title, startdate. salaryrecords: id, employeeid, amountminorunits, currency, effectivedate, reason, createdat. Indexes on (employeeid, effective_date desc), (country), (department).
Money stored as integers in minor units, never floats. Currency stored per record, so a person can change country without losing history.
Validation: amount greater than zero, ISO-4217 currency, a real calendar date, and no two records for one employee on the same effective date. Future effective dates are allowed (an approved raise that starts next month) but never count as current; see docs/decisions.md, D4.

## Performance

Ten thousand rows is not much data, but the naive version renders all of them in one table and dies. So: server-side pagination at 50 per page, search against an indexed column, aggregates computed with GROUP BY rather than in the browser, and a virtualised list anywhere a long list is unavoidable. Target: list and search responses under 300ms locally at 10,000 rows, with the measured numbers written into PERFORMANCE.md rather than claimed here.

## How I'd know it works

Every list view responds within the target at full seed size. Editing a salary appends a record and the detail page re-orders correctly. A future-dated record does not show as current. One department's aggregate matches a total I computed by hand. Tests cover history ordering, current-salary selection and future-dated exclusion, plus UI tests on search and the edit form.

## If this were v2

Currency conversion with rates as of a date, CSV import with validation and a dry-run preview, an approvals trail on each change, and a band-versus-actual view so the manager can see outliers rather than only totals.