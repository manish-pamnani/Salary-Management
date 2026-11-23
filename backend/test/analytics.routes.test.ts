import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/connection.js";
import { addPerson, createTestDb } from "./helpers.js";

const TODAY = "2026-06-15";

function setup(build: (db: Db) => void) {
  const db = createTestDb();
  build(db);
  const app = buildApp({ db, today: () => TODAY });
  return async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.json() };
  };
}

/** Small company with totals worked out by hand in the comments. */
const company = (db: Db) => {
  // Engineering, USD: 100k, 120k, 200k -> total 420k, median 120k
  addPerson(db, "Eng One", { country: "US", department: "Engineering", salaries: [["2020-01-01", 100_000_00, "USD"]] });
  addPerson(db, "Eng Two", { country: "US", department: "Engineering", salaries: [["2020-01-01", 120_000_00, "USD"]] });
  addPerson(db, "Eng Three", {
    country: "US",
    department: "Engineering",
    salaries: [
      ["2020-01-01", 180_000_00, "USD"],
      ["2025-04-01", 200_000_00, "USD"],
      ["2026-09-01", 250_000_00, "USD"], // scheduled: must not count today
    ],
  });
  // Engineering, GBP: 40k, 60k -> total 100k, median 50k (mean of the two middle values)
  addPerson(db, "Eng UK One", { country: "GB", department: "Engineering", salaries: [["2020-01-01", 40_000_00, "GBP"]] });
  addPerson(db, "Eng UK Two", { country: "GB", department: "Engineering", salaries: [["2020-01-01", 60_000_00, "GBP"]] });
  // Sales, USD: 90k
  addPerson(db, "Sales One", { country: "US", department: "Sales", salaries: [["2020-01-01", 90_000_00, "USD"]] });
  // Not started yet: counted nowhere in current pay
  addPerson(db, "Starts Later", {
    country: "US",
    department: "Sales",
    startDate: "2026-08-01",
    salaries: [["2026-08-01", 95_000_00, "USD"]],
  });
};

describe("GET /api/analytics/pay-summary", () => {
  it("reports each currency separately within a department, with hand-checked totals and medians", async () => {
    const get = setup(company);
    const { status, body } = await get("/api/analytics/pay-summary?groupBy=department");
    expect(status).toBe(200);
    expect(body.rows).toEqual([
      {
        group: "Engineering", currency: "USD", minorUnitExponent: 2, headcount: 3,
        totalMinorUnits: 420_000_00, medianMinorUnits: 120_000_00, minMinorUnits: 100_000_00, maxMinorUnits: 200_000_00,
      },
      {
        group: "Engineering", currency: "GBP", minorUnitExponent: 2, headcount: 2,
        totalMinorUnits: 100_000_00, medianMinorUnits: 50_000_00, minMinorUnits: 40_000_00, maxMinorUnits: 60_000_00,
      },
      {
        group: "Sales", currency: "USD", minorUnitExponent: 2, headcount: 1,
        totalMinorUnits: 90_000_00, medianMinorUnits: 90_000_00, minMinorUnits: 90_000_00, maxMinorUnits: 90_000_00,
      },
    ]);
  });

  it("groups by country and can be narrowed to one department", async () => {
    const get = setup(company);
    const { body } = await get("/api/analytics/pay-summary?groupBy=country&department=Engineering");
    expect(body.rows.map((r: { group: string; currency: string; headcount: number }) => [r.group, r.currency, r.headcount]))
      .toEqual([["GB", "GBP", 2], ["US", "USD", 3]]);
  });

  it("rejects an unknown grouping", async () => {
    const get = setup(company);
    expect((await get("/api/analytics/pay-summary?groupBy=title")).status).toBe(400);
  });
});

describe("GET /api/ask/headcount-by-currency", () => {
  it("counts people by the currency of their current salary, with not-yet-started as null", async () => {
    const get = setup(company);
    const { body } = await get("/api/ask/headcount-by-currency");
    expect(body.rows).toEqual([
      { currency: "USD", headcount: 4 },
      { currency: "GBP", headcount: 2 },
      { currency: null, headcount: 1 },
    ]);
  });
});

describe("GET /api/ask/current-salary", () => {
  it("finds people by name and returns their current salary", async () => {
    const get = setup(company);
    const { body } = await get("/api/ask/current-salary?q=three");
    expect(body.totalMatches).toBe(1);
    expect(body.matches[0]).toMatchObject({ fullName: "Eng Three", currentSalary: { amountMinorUnits: 200_000_00 } });
  });

  it("requires a question", async () => {
    const get = setup(company);
    expect((await get("/api/ask/current-salary?q=%20")).status).toBe(400);
  });
});

describe("GET /api/ask/department-cost", () => {
  it("is annual / 12 for a full month, per currency", async () => {
    const get = setup((db) => {
      addPerson(db, "A", { department: "Ops", salaries: [["2020-01-01", 120_000_00, "USD"]] }); // 10,000.00 / month
      addPerson(db, "B", { department: "Ops", salaries: [["2020-01-01", 60_000_00, "GBP"]] }); // 5,000.00 / month
      addPerson(db, "C", { department: "Other", salaries: [["2020-01-01", 999_000_00, "USD"]] });
    });
    const { body } = await get("/api/ask/department-cost?department=Ops&month=2026-05");
    expect(body.byCurrency).toEqual([
      { currency: "GBP", minorUnitExponent: 2, headcount: 1, costMinorUnits: 5_000_00 },
      { currency: "USD", minorUnitExponent: 2, headcount: 1, costMinorUnits: 10_000_00 },
    ]);
  });

  it("prorates a mid-month raise and a mid-month hire by days in effect", async () => {
    const get = setup((db) => {
      // June has 30 days. 120k for 14 days, then 240k for 16 days:
      // 10,000 * 14/30 + 20,000 * 16/30 = 4,666.67 + 10,666.67 = 15,333.33
      addPerson(db, "Raised", {
        department: "Ops",
        salaries: [["2020-01-01", 120_000_00, "USD"], ["2026-06-15", 240_000_00, "USD", "promotion"]],
      });
      // Hired 21 June on 120k: 10 days -> 10,000 * 10/30 = 3,333.33
      addPerson(db, "Joiner", { department: "Ops", startDate: "2026-06-21", salaries: [["2026-06-21", 120_000_00, "USD"]] });
    });
    const { body } = await get("/api/ask/department-cost?department=Ops&month=2026-06");
    expect(body.byCurrency).toEqual([
      // Summed exactly, rounded once: 15,333.333... + 3,333.333... = 18,666.67
      // (rounding each person first would give 18,666.66; that drift is why we sum first)
      { currency: "USD", minorUnitExponent: 2, headcount: 2, costMinorUnits: 1_866_667 },
    ]);
  });

  it("defaults to the current month and includes scheduled raises when asked about a future one", async () => {
    const get = setup((db) =>
      addPerson(db, "A", {
        department: "Ops",
        salaries: [["2020-01-01", 120_000_00, "USD"], ["2026-07-01", 180_000_00, "USD"]],
      }),
    );
    const thisMonth = await get("/api/ask/department-cost?department=Ops");
    expect(thisMonth.body.month).toBe("2026-06");
    expect(thisMonth.body.byCurrency[0].costMinorUnits).toBe(10_000_00);

    const nextMonth = await get("/api/ask/department-cost?department=Ops&month=2026-07");
    expect(nextMonth.body.byCurrency[0].costMinorUnits).toBe(15_000_00);
  });

  it("splits a month across currencies when someone relocates mid-month", async () => {
    const get = setup((db) =>
      // April has 30 days: 10 days in INR, 20 days in GBP.
      addPerson(db, "Mover", {
        department: "Ops",
        salaries: [["2020-01-01", 3_000_000_00, "INR"], ["2026-04-11", 60_000_00, "GBP", "relocation"]],
      }),
    );
    const { body } = await get("/api/ask/department-cost?department=Ops&month=2026-04");
    // INR: 250,000/month * 10/30 = 83,333.33; GBP: 5,000/month * 20/30 = 3,333.33
    expect(body.byCurrency).toEqual([
      { currency: "GBP", minorUnitExponent: 2, headcount: 1, costMinorUnits: 333_333 },
      { currency: "INR", minorUnitExponent: 2, headcount: 1, costMinorUnits: 8_333_333 },
    ]);
  });

  it("validates the month", async () => {
    const get = setup(() => {});
    expect((await get("/api/ask/department-cost?department=Ops&month=2026-13")).status).toBe(400);
  });
});
