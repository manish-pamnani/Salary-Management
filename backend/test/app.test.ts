import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { addPerson, createTestDb } from "./helpers.js";

describe("app", () => {
  it("reports health", async () => {
    const app = buildApp({ db: createTestDb() });
    expect((await app.inject("/api/health")).json()).toEqual({ status: "ok" });
  });

  it("serves filter options from the data, plus the date it treats as today", async () => {
    const db = createTestDb();
    addPerson(db, "A", { country: "IN", department: "Sales", salaries: [["2020-01-01", 1_00, "INR"]] });
    addPerson(db, "B", { country: "GB", department: "Engineering", salaries: [["2020-01-01", 1_00, "GBP"]] });
    const body = (await buildApp({ db, today: () => "2026-06-15" }).inject("/api/meta")).json();
    expect(body).toMatchObject({ today: "2026-06-15", countries: ["GB", "IN"], departments: ["Engineering", "Sales"] });
    expect(body.currencies).toContainEqual({ code: "JPY", minorUnitExponent: 0 });
  });

  it("answers malformed JSON with 400, not 500", async () => {
    const db = createTestDb();
    addPerson(db, "A", { salaries: [["2020-01-01", 1_00, "USD"]] });
    const res = await buildApp({ db }).inject({
      method: "POST",
      url: "/api/employees/1/salary-records",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
  });

  it("hides internal errors behind a generic 500", async () => {
    const db = createTestDb();
    db.close(); // every query will now throw
    const res = await buildApp({ db }).inject("/api/employees");
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
  });
});

describe("landing page and timing", () => {
  it("serves an HTML page at / that names the as-of date, the persistence caveat, and links the API", async () => {
    const app = buildApp({ db: createTestDb(), timeZone: "Asia/Kolkata", today: () => "2026-11-23" });
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("current as of 2026-11-23 (Asia/Kolkata)");
    expect(res.body).toContain("not persistent");
    expect(res.body).toContain('href="/api/employees"');
  });

  it("reports server time on every response, including errors", async () => {
    const app = buildApp({ db: createTestDb() });
    for (const url of ["/api/health", "/api/employees/999"]) {
      const res = await app.inject(url);
      expect(res.headers["server-timing"]).toMatch(/^app;dur=\d+\.\d$/);
    }
  });
});
