-- Reference table for currencies we accept. A foreign key to it is how the
-- database enforces "ISO-4217 currency": unknown codes simply cannot be stored.
-- minor_unit_exponent says how many minor units make a major one
-- (USD 2 -> cents, JPY 0 -> yen), so amounts are never stored as floats.
CREATE TABLE currencies (
  code                TEXT    PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),
  minor_unit_exponent INTEGER NOT NULL    CHECK (minor_unit_exponent BETWEEN 0 AND 3)
) STRICT;

CREATE TABLE employees (
  id           INTEGER PRIMARY KEY,
  full_name    TEXT    NOT NULL CHECK (length(trim(full_name)) > 0),
  email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  country_code TEXT    NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  department   TEXT    NOT NULL,
  job_title    TEXT    NOT NULL,
  start_date   TEXT    NOT NULL CHECK (date(start_date) IS start_date)
) STRICT;

-- Salary is a history, not a field: rows are appended, never updated.
-- The current salary is the row with the latest effective_date <= as-of date,
-- so future-dated rows (scheduled raises) can exist without being current.
-- Currency lives on the record, not the employee, so relocation keeps history.
CREATE TABLE salary_records (
  id                 INTEGER PRIMARY KEY,
  employee_id        INTEGER NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  currency           TEXT    NOT NULL REFERENCES currencies (code),
  effective_date     TEXT    NOT NULL CHECK (date(effective_date) IS effective_date),
  reason             TEXT    NOT NULL CHECK (reason IN (
                       'hire', 'annual_review', 'promotion',
                       'market_adjustment', 'relocation', 'correction')),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- One record per employee per day. This unique index is also the access path
  -- for "history of employee X ordered by date" and "latest record <= date";
  -- SQLite walks it backwards for DESC, so no separate DESC index is needed.
  UNIQUE (employee_id, effective_date)
) STRICT;

CREATE INDEX idx_employees_country    ON employees (country_code);
CREATE INDEX idx_employees_department ON employees (department);
-- NOCASE index lets case-insensitive prefix search (LIKE 'abc%') use the index.
CREATE INDEX idx_employees_full_name  ON employees (full_name COLLATE NOCASE);

INSERT INTO currencies (code, minor_unit_exponent) VALUES
  ('USD', 2), ('GBP', 2), ('EUR', 2), ('INR', 2),
  ('BRL', 2), ('JPY', 0), ('CAD', 2), ('SGD', 2);
