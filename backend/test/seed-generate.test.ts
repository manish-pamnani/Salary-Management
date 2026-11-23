import { describe, expect, it } from "vitest";
import { generateSeedData, toMinorUnits, type SeedSalaryRecord } from "../src/seed/generate.js";
import { COUNTRIES, DEPARTMENTS } from "../src/seed/reference-data.js";

const AS_OF = "2026-11-23";
// Generated once and shared: generation is pure, and 2,000 people is enough
// for every rare branch (relocation, scheduled raise) to occur.
const data = generateSeedData({ count: 2_000, seed: 42, asOf: AS_OF });

function historyOf(employeeId: number): SeedSalaryRecord[] {
  return data.salaryRecords.filter((r) => r.employeeId === employeeId);
}

function historiesByEmployee(): Map<number, SeedSalaryRecord[]> {
  const map = new Map<number, SeedSalaryRecord[]>();
  for (const record of data.salaryRecords) {
    const list = map.get(record.employeeId) ?? [];
    list.push(record);
    map.set(record.employeeId, list);
  }
  return map;
}

describe("generateSeedData", () => {
  it("is deterministic for the same seed and as-of date", () => {
    const a = generateSeedData({ count: 50, seed: 7, asOf: AS_OF });
    const b = generateSeedData({ count: 50, seed: 7, asOf: AS_OF });
    expect(a).toEqual(b);
  });

  it("produces a different company for a different seed", () => {
    const a = generateSeedData({ count: 50, seed: 7, asOf: AS_OF });
    const b = generateSeedData({ count: 50, seed: 8, asOf: AS_OF });
    expect(a.employees).not.toEqual(b.employees);
  });

  it("creates the requested number of employees with sequential ids and unique emails", () => {
    expect(data.employees).toHaveLength(2_000);
    expect(data.employees.map((e) => e.id)).toEqual(Array.from({ length: 2_000 }, (_, i) => i + 1));
    expect(new Set(data.employees.map((e) => e.email.toLowerCase())).size).toBe(2_000);
  });

  it("spreads employees across every country and department", () => {
    expect(new Set(data.employees.map((e) => e.countryCode))).toEqual(new Set(COUNTRIES.map((c) => c.code)));
    expect(new Set(data.employees.map((e) => e.department))).toEqual(new Set(DEPARTMENTS.map((d) => d.name)));
  });

  it("starts every history with a single 'hire' record on the start date", () => {
    for (const employee of data.employees) {
      const history = historyOf(employee.id);
      expect(history[0]).toMatchObject({ reason: "hire", effectiveDate: employee.startDate });
      expect(history.filter((r) => r.reason === "hire")).toHaveLength(1);
    }
  });

  it("never starts anyone after the as-of date", () => {
    expect(data.employees.every((e) => e.startDate <= AS_OF)).toBe(true);
  });

  it("orders each history by strictly increasing effective date (so no duplicate dates)", () => {
    for (const history of historiesByEmployee().values()) {
      const dates = history.map((r) => r.effectiveDate);
      expect(dates).toEqual([...new Set(dates)].sort());
    }
  });

  it("stores positive integer amounts in minor units", () => {
    expect(data.salaryRecords.every((r) => Number.isInteger(r.amountMinorUnits) && r.amountMinorUnits > 0)).toBe(true);
  });

  it("only ever raises pay within a currency (no accidental pay cuts)", () => {
    for (const history of historiesByEmployee().values()) {
      for (let i = 1; i < history.length; i++) {
        const [prev, curr] = [history[i - 1]!, history[i]!];
        if (curr.reason !== "relocation") {
          expect(curr.currency).toBe(prev.currency);
          expect(curr.amountMinorUnits).toBeGreaterThan(prev.amountMinorUnits);
        }
      }
    }
  });

  it("pays the latest non-future record in the currency of the employee's country", () => {
    const currencyOf = new Map(COUNTRIES.map((c) => [c.code, c.currency]));
    for (const employee of data.employees) {
      const current = historyOf(employee.id).filter((r) => r.effectiveDate <= AS_OF).at(-1)!;
      expect(current.currency).toBe(currencyOf.get(employee.countryCode));
    }
  });

  it("includes relocations that switch currency mid-history", () => {
    const relocations = data.salaryRecords.filter((r) => r.reason === "relocation");
    expect(relocations.length).toBeGreaterThan(0);
    for (const relocation of relocations) {
      const history = historyOf(relocation.employeeId);
      const before = history[history.indexOf(relocation) - 1]!;
      expect(before.currency).not.toBe(relocation.currency);
    }
  });

  it("includes some scheduled future raises, each the last record in its history", () => {
    const future = data.salaryRecords.filter((r) => r.effectiveDate > AS_OF);
    expect(future.length).toBeGreaterThan(0);
    for (const record of future) {
      expect(historyOf(record.employeeId).at(-1)).toBe(record);
    }
  });

  it("rejects an invalid as-of date or count", () => {
    expect(() => generateSeedData({ count: 1, seed: 1, asOf: "2026-02-30" })).toThrow(/Invalid date/);
    expect(() => generateSeedData({ count: -1, seed: 1, asOf: AS_OF })).toThrow(/count/);
  });
});

describe("toMinorUnits", () => {
  it("rounds to the nearest 100 and scales by the currency's exponent", () => {
    expect(toMinorUnits(54_321.99, "USD")).toBe(5_430_000); // $54,300.00 in cents
    expect(toMinorUnits(8_765_432, "JPY")).toBe(8_765_400); // yen have no minor unit
  });

  it("rejects a currency it does not know", () => {
    expect(() => toMinorUnits(1_000, "XYZ")).toThrow(/Unknown currency/);
  });
});
