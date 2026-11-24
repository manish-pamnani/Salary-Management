import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/connection.js";
import { addPerson, createTestDb } from "./helpers.js";

const TODAY = "2026-06-15";

function setup(build: (db: Db) => void = () => {}) {
  const db = createTestDb();
  build(db);
  const app = buildApp({ db, today: () => TODAY });
  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.json() };
  };
  const post = async (url: string, payload: unknown) => {
    const res = await app.inject({ method: "POST", url, payload: payload as object });
    return { status: res.statusCode, body: res.json() };
  };
  return { db, app, get, post };
}

const names = (body: { items: { fullName: string }[] }) => body.items.map((e) => e.fullName);

describe("GET /api/employees: paging and filters", () => {
  const people = (db: Db) => {
    addPerson(db, "Carol Jones", { country: "US", department: "Sales", salaries: [["2020-01-01", 90_000_00, "USD"]] });
    addPerson(db, "Alice Smith", { country: "GB", department: "Engineering", salaries: [["2020-01-01", 70_000_00, "GBP"]] });
    addPerson(db, "Priya Patel", { country: "IN", department: "Engineering", salaries: [["2020-01-01", 3_000_000_00, "INR"]] });
    addPerson(db, "Bob Brown", { country: "US", department: "Engineering", salaries: [["2020-01-01", 120_000_00, "USD"]] });
  };

  it("sorts by name by default and paginates on the server", async () => {
    const { get } = setup(people);
    const first = await get("/api/employees?pageSize=2");
    expect(first.status).toBe(200);
    expect(names(first.body)).toEqual(["Alice Smith", "Bob Brown"]);
    expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });

    const second = await get("/api/employees?pageSize=2&page=2");
    expect(names(second.body)).toEqual(["Carol Jones", "Priya Patel"]);
  });

  it("filters by country and department together", async () => {
    const { get } = setup(people);
    const { body } = await get("/api/employees?country=US&department=Engineering");
    expect(names(body)).toEqual(["Bob Brown"]);
    expect(body.total).toBe(1);
  });

  it("searches by the start of any word in the name, case-insensitively", async () => {
    const { get } = setup(people);
    expect(names((await get("/api/employees?search=pat")).body)).toEqual(["Priya Patel"]);
    expect(names((await get("/api/employees?search=ALI")).body)).toEqual(["Alice Smith"]);
  });

  it("does not match in the middle of a word", async () => {
    const { get } = setup(people);
    expect((await get("/api/employees?search=atel")).body.total).toBe(0);
  });

  it("treats LIKE wildcards in the search text literally", async () => {
    const { get } = setup(people);
    expect((await get("/api/employees?search=%25")).body.total).toBe(0); // "%"
    expect((await get("/api/employees?search=_")).body.total).toBe(0);
  });

  it("rejects a page size above the cap and an unknown sort", async () => {
    const { get } = setup(people);
    expect((await get("/api/employees?pageSize=101")).status).toBe(400);
    const bad = await get("/api/employees?sort=email");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_request");
  });
});

describe("GET /api/employees: current salary", () => {
  it("is the latest record on or before today, ignoring future-dated ones", async () => {
    const { get } = setup((db) =>
      addPerson(db, "Ada Lovelace", {
        salaries: [
          ["2024-01-01", 100_000_00, "USD"],
          ["2026-04-01", 110_000_00, "USD"],
          ["2026-07-01", 125_000_00, "USD"], // scheduled raise
        ],
      }),
    );
    const { body } = await get("/api/employees");
    expect(body.items[0].currentSalary).toEqual({
      amountMinorUnits: 110_000_00,
      currency: "USD",
      minorUnitExponent: 2,
      effectiveDate: "2026-04-01",
    });
  });

  it("is null for someone whose first record starts in the future", async () => {
    const { get } = setup((db) =>
      addPerson(db, "New Starter", { startDate: "2026-07-01", salaries: [["2026-07-01", 80_000_00, "USD"]] }),
    );
    expect((await get("/api/employees")).body.items[0].currentSalary).toBeNull();
  });
});

describe("GET /api/employees: salaryCurrencies and asOf, for the UI's salary column", () => {
  const mixed = (db: Db) => {
    addPerson(db, "Yankee", { country: "US", salaries: [["2020-01-01", 100_000_00, "USD"]] });
    addPerson(db, "Rupee", { country: "IN", salaries: [["2020-01-01", 3_000_000_00, "INR"]] });
    addPerson(db, "Not Yet", { country: "IN", startDate: "2026-07-01", salaries: [["2026-07-01", 2_000_000_00, "INR"]] });
  };

  it("lists the currencies the matches are paid in today, and the date that decided it", async () => {
    const { get } = setup(mixed);
    const { body } = await get("/api/employees");
    expect(body.asOf).toBe(TODAY);
    expect(body.salaryCurrencies).toEqual(["INR", "USD"]);
  });

  it("narrows with the other filters, so one currency means the salary sort is allowed", async () => {
    const { get } = setup(mixed);
    expect((await get("/api/employees?country=US")).body.salaryCurrencies).toEqual(["USD"]);
    expect((await get("/api/employees?currency=INR")).body.salaryCurrencies).toEqual(["INR"]);
    expect((await get("/api/employees?search=zzz")).body.salaryCurrencies).toEqual([]);
    expect((await get("/api/employees?currency=GBP")).body.salaryCurrencies).toEqual([]);
  });

  it("ignores people with no current salary yet", async () => {
    const { get } = setup(mixed);
    expect((await get("/api/employees?search=not")).body.salaryCurrencies).toEqual([]);
  });
});

describe("GET /api/employees: sort by salary (decision D8)", () => {
  it("refuses to rank across currencies and names the currencies present", async () => {
    const { get } = setup((db) => {
      addPerson(db, "A", { country: "US", salaries: [["2020-01-01", 100_000_00, "USD"]] });
      addPerson(db, "B", { country: "IN", salaries: [["2020-01-01", 3_000_000_00, "INR"]] });
    });
    const res = await get("/api/employees?sort=salary&order=desc");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "currency_required", currencies: ["INR", "USD"] });
  });

  it("sorts within an explicit currency and leaves other currencies out", async () => {
    const { get } = setup((db) => {
      addPerson(db, "Low", { salaries: [["2020-01-01", 50_000_00, "USD"]] });
      addPerson(db, "High", { salaries: [["2020-01-01", 150_000_00, "USD"]] });
      addPerson(db, "Rupees", { country: "IN", salaries: [["2020-01-01", 9_000_000_00, "INR"]] });
    });
    const { status, body } = await get("/api/employees?sort=salary&order=desc&currency=USD");
    expect(status).toBe(200);
    expect(names(body)).toEqual(["High", "Low"]);
    expect(body.total).toBe(2);
    expect(body.resolvedCurrency).toBeUndefined();
  });

  it("resolves the currency from a filter when every match shares one", async () => {
    const { get } = setup((db) => {
      addPerson(db, "Low", { country: "GB", salaries: [["2020-01-01", 40_000_00, "GBP"]] });
      addPerson(db, "High", { country: "GB", salaries: [["2020-01-01", 90_000_00, "GBP"]] });
      addPerson(db, "Elsewhere", { country: "US", salaries: [["2020-01-01", 999_000_00, "USD"]] });
    });
    const { status, body } = await get("/api/employees?sort=salary&order=desc&country=GB");
    expect(status).toBe(200);
    expect(body.resolvedCurrency).toBe("GBP");
    expect(names(body)).toEqual(["High", "Low"]);
  });

  it("does not assume a country implies a currency: a future-dated transfer still pays in the old one", async () => {
    // Moving India -> UK on 1 July. Their country is already GB, but until
    // then they are still paid in INR, so GB contains two currencies today.
    const build = (db: Db) => {
      addPerson(db, "Already Here", { country: "GB", salaries: [["2020-01-01", 60_000_00, "GBP"]] });
      addPerson(db, "Moving Soon", {
        country: "GB",
        salaries: [
          ["2020-01-01", 2_500_000_00, "INR"],
          ["2026-07-01", 55_000_00, "GBP", "relocation"],
        ],
      });
    };
    const before = await setup(build).get("/api/employees?sort=salary&country=GB");
    expect(before.status).toBe(400);
    expect(before.body.error.currencies).toEqual(["GBP", "INR"]);

    // Once the transfer is effective, GB is single-currency again.
    const db = createTestDb();
    build(db);
    const after = buildApp({ db, today: () => "2026-07-01" });
    const res = await after.inject({ method: "GET", url: "/api/employees?sort=salary&order=desc&country=GB" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((e: { fullName: string }) => e.fullName)).toEqual(["Already Here", "Moving Soon"]);
  });

  // Pins the contract: ties come back in ascending id order on every page.
  // Caveat, found by mutation: today SQLite happens to emit ties in rowid order
  // even without the tie-breaker, so deleting `e.id ASC` would not fail this
  // test. The explicit ORDER BY is what keeps it true if the query plan
  // changes (e.g. a new index that is not in rowid order); this test catches
  // the tie-breaker being wrong (e.g. id DESC) rather than missing.
  it("breaks ties by employee id, so paging never repeats or drops anyone", async () => {
    const { get } = setup((db) => {
      // Ten people on the same salary, inserted in shuffled name order.
      for (const name of ["J", "C", "H", "A", "F", "B", "I", "E", "G", "D"]) {
        addPerson(db, name, { salaries: [["2020-01-01", 100_000_00, "USD"]] });
      }
      addPerson(db, "Top", { salaries: [["2020-01-01", 200_000_00, "USD"]] });
    });
    const seen: number[] = [];
    for (let page = 1; page <= 4; page++) {
      const { body } = await get(`/api/employees?sort=salary&order=desc&currency=USD&pageSize=3&page=${page}`);
      seen.push(...body.items.map((e: { id: number }) => e.id));
    }
    // "Top" (id 11) first, then the ten ties in ascending id order, each exactly once.
    expect(seen).toEqual([11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("puts people with no current salary last when the currency was resolved", async () => {
    const { get } = setup((db) => {
      addPerson(db, "Not Started", { country: "GB", startDate: "2026-09-01", salaries: [["2026-09-01", 99_000_00, "GBP"]] });
      addPerson(db, "Paid", { country: "GB", salaries: [["2020-01-01", 50_000_00, "GBP"]] });
    });
    const { body } = await get("/api/employees?sort=salary&order=desc&country=GB");
    expect(names(body)).toEqual(["Paid", "Not Started"]);
  });
});

describe("GET /api/employees/:id", () => {
  it("returns the profile with history newest first, statuses and changes", async () => {
    const { get } = setup((db) =>
      addPerson(db, "Mover", {
        country: "GB",
        salaries: [
          ["2021-01-01", 2_000_000_00, "INR"],
          ["2022-04-01", 2_200_000_00, "INR"],
          ["2023-07-01", 50_000_00, "GBP", "relocation"],
          ["2024-04-01", 52_000_00, "GBP"],
          ["2026-09-01", 55_000_00, "GBP"],
        ],
      }),
    );
    const { status, body } = await get("/api/employees/1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ fullName: "Mover", asOf: TODAY, currentSalary: { amountMinorUnits: 52_000_00 } });
    expect(
      body.salaryHistory.map((r: { effectiveDate: string; status: string; change: unknown }) => [
        r.effectiveDate,
        r.status,
        r.change,
      ]),
    ).toEqual([
      ["2026-09-01", "scheduled", { amountMinorUnits: 3_000_00, percent: 5.77 }],
      ["2024-04-01", "current", { amountMinorUnits: 2_000_00, percent: 4 }],
      ["2023-07-01", "past", null], // currency changed: no meaningful delta
      ["2022-04-01", "past", { amountMinorUnits: 200_000_00, percent: 10 }],
      ["2021-01-01", "past", null],
    ]);
  });

  it("returns 404 for an unknown employee and 400 for a non-numeric id", async () => {
    const { get } = setup();
    expect((await get("/api/employees/999")).status).toBe(404);
    expect((await get("/api/employees/abc")).status).toBe(400);
  });
});

describe("POST /api/employees/:id/salary-records", () => {
  const withAda = (db: Db) =>
    addPerson(db, "Ada", { startDate: "2022-01-10", salaries: [["2022-01-10", 100_000_00, "USD"]] });
  const raise = { amountMinorUnits: 110_000_00, currency: "USD", effectiveDate: "2026-04-01", reason: "annual_review" };

  it("appends a record that becomes current, leaving earlier ones untouched", async () => {
    const { get, post } = setup(withAda);
    const created = await post("/api/employees/1/salary-records", raise);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...raise, employeeId: 1, minorUnitExponent: 2 });

    const { body } = await get("/api/employees/1");
    expect(body.currentSalary.amountMinorUnits).toBe(110_000_00);
    expect(body.salaryHistory.map((r: { amountMinorUnits: number }) => r.amountMinorUnits)).toEqual([
      110_000_00, 100_000_00,
    ]);
  });

  it("re-orders history by effective date when a record is back-dated", async () => {
    const { get, post } = setup(withAda);
    await post("/api/employees/1/salary-records", raise);
    await post("/api/employees/1/salary-records", { ...raise, amountMinorUnits: 105_000_00, effectiveDate: "2024-04-01" });
    const { body } = await get("/api/employees/1");
    expect(body.salaryHistory.map((r: { effectiveDate: string }) => r.effectiveDate)).toEqual([
      "2026-04-01", "2024-04-01", "2022-01-10",
    ]);
    expect(body.currentSalary.amountMinorUnits).toBe(110_000_00);
  });

  it("accepts a future-dated raise without making it current", async () => {
    const { get, post } = setup(withAda);
    const res = await post("/api/employees/1/salary-records", { ...raise, effectiveDate: "2026-12-01" });
    expect(res.status).toBe(201);
    const { body } = await get("/api/employees/1");
    expect(body.currentSalary.amountMinorUnits).toBe(100_000_00);
    expect(body.salaryHistory[0].status).toBe("scheduled");
  });

  it("refuses a second record on the same date with 409 rather than overwriting", async () => {
    const { post } = setup(withAda);
    await post("/api/employees/1/salary-records", raise);
    const res = await post("/api/employees/1/salary-records", { ...raise, amountMinorUnits: 1, reason: "correction" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("duplicate_effective_date");
  });

  it.each([
    ["a zero amount", { amountMinorUnits: 0 }, "invalid_request"],
    ["a fractional amount", { amountMinorUnits: 100.5 }, "invalid_request"],
    ["a malformed currency", { currency: "usd" }, "invalid_request"],
    ["an unsupported currency", { currency: "XYZ" }, "unknown_currency"],
    ["an impossible date", { effectiveDate: "2026-02-30" }, "invalid_request"],
    ["a date before the start date", { effectiveDate: "2021-12-31" }, "before_start_date"],
    ["a second 'hire' record", { reason: "hire" }, "invalid_request"],
  ])("rejects %s with 400", async (_label, override, code) => {
    const { post } = setup(withAda);
    const res = await post("/api/employees/1/salary-records", { ...raise, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it("returns 404 for an unknown employee", async () => {
    const { post } = setup();
    expect((await post("/api/employees/42/salary-records", raise)).status).toBe(404);
  });
});
