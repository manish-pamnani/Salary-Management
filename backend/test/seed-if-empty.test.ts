import { describe, expect, it } from "vitest";
import { seedIfEmpty } from "../src/seed/seed-if-empty.js";
import { addPerson, createTestDb } from "./helpers.js";

describe("seedIfEmpty", () => {
  it("seeds an empty database", () => {
    const db = createTestDb();
    expect(seedIfEmpty(db, "2026-11-23", { count: 25 })).toMatchObject({ seeded: true, employees: 25 });
    expect(db.prepare("SELECT count(*) FROM employees").pluck().get()).toBe(25);
  });

  it("never touches a database that already has employees", () => {
    const db = createTestDb();
    addPerson(db, "Existing", { salaries: [["2020-01-01", 1_00, "USD"]] });
    expect(seedIfEmpty(db, "2026-11-23", { count: 25 })).toMatchObject({ seeded: false, employees: 1 });
    expect(db.prepare("SELECT full_name FROM employees").pluck().all()).toEqual(["Existing"]);
  });
});
