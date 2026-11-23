import { describe, expect, it } from "vitest";
import { generateSeedData } from "../src/seed/generate.js";
import { MINOR_UNIT_EXPONENT } from "../src/seed/reference-data.js";
import { writeSeedData } from "../src/seed/write.js";
import { createTestDb } from "./helpers.js";

const AS_OF = "2026-11-23";

describe("writeSeedData", () => {
  it("persists every generated employee and salary record", () => {
    const db = createTestDb();
    const data = generateSeedData({ count: 300, seed: 1, asOf: AS_OF });
    writeSeedData(db, data);

    expect(db.prepare("SELECT count(*) FROM employees").pluck().get()).toBe(300);
    expect(db.prepare("SELECT count(*) FROM salary_records").pluck().get()).toBe(data.salaryRecords.length);
  });

  it("replaces existing data instead of appending when run twice", () => {
    const db = createTestDb();
    writeSeedData(db, generateSeedData({ count: 300, seed: 1, asOf: AS_OF }));
    const second = generateSeedData({ count: 100, seed: 2, asOf: AS_OF });
    writeSeedData(db, second);

    expect(db.prepare("SELECT count(*) FROM employees").pluck().get()).toBe(100);
    expect(db.prepare("SELECT count(*) FROM salary_records").pluck().get()).toBe(second.salaryRecords.length);
  });

  it("leaves the existing data untouched if any row is rejected", () => {
    const db = createTestDb();
    writeSeedData(db, generateSeedData({ count: 10, seed: 1, asOf: AS_OF }));
    const bad = generateSeedData({ count: 10, seed: 2, asOf: AS_OF });
    bad.salaryRecords[5] = { ...bad.salaryRecords[5]!, currency: "XYZ" };

    expect(() => writeSeedData(db, bad)).toThrow(/FOREIGN KEY/);
    expect(db.prepare("SELECT count(*) FROM employees").pluck().get()).toBe(10);
  });

  it("agrees with the database on every currency's minor-unit exponent", () => {
    // The generator and the schema each list currencies; this keeps them in sync.
    const db = createTestDb();
    const rows = db.prepare("SELECT code, minor_unit_exponent FROM currencies").all() as
      { code: string; minor_unit_exponent: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.code, r.minor_unit_exponent]))).toEqual(MINOR_UNIT_EXPONENT);
  });
});
