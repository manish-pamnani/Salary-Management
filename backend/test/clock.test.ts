import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { assertValidTimeZone, todayInTimeZone } from "../src/clock.js";
import { createTestDb } from "./helpers.js";

describe("todayInTimeZone (decision D10)", () => {
  // 20:00 UTC on 30 November is 01:30 on 1 December in Delhi (UTC+5:30).
  const evening = new Date("2026-11-30T20:00:00Z");

  it("uses the org's calendar, not the server's", () => {
    expect(todayInTimeZone("UTC", evening)).toBe("2026-11-30");
    expect(todayInTimeZone("Asia/Kolkata", evening)).toBe("2026-12-01");
  });

  it("moves 'this month' across a month boundary in the org's zone", () => {
    expect(todayInTimeZone("Asia/Kolkata", evening).slice(0, 7)).toBe("2026-12");
    expect(todayInTimeZone("America/Los_Angeles", new Date("2026-12-01T05:00:00Z")).slice(0, 7)).toBe("2026-11");
  });

  it("rejects an invalid zone at startup", () => {
    expect(() => assertValidTimeZone("Asia/Delhi")).toThrow(/Invalid ORG_TIMEZONE/);
    expect(() => buildApp({ db: createTestDb(), timeZone: "Mars/Olympus" })).toThrow(/Invalid ORG_TIMEZONE/);
  });

  it("is reported by /api/meta so the UI can show which calendar 'today' comes from", async () => {
    const app = buildApp({ db: createTestDb(), timeZone: "Asia/Kolkata", today: () => "2026-12-01" });
    expect((await app.inject("/api/meta")).json()).toMatchObject({ today: "2026-12-01", timeZone: "Asia/Kolkata" });
  });
});
