import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SalaryHistoryEntry } from "../src/api";
import { detail, mockApi, renderAt } from "./helpers";

const scheduled: SalaryHistoryEntry = {
  id: 3, employeeId: 1, amountMinorUnits: 85_000_00, currency: "GBP", minorUnitExponent: 2,
  effectiveDate: "2026-12-01", reason: "promotion", createdAt: "2026-11-20T00:00:00Z",
  status: "scheduled", change: { amountMinorUnits: 5_000_00, percent: 6.25 },
};

describe("employee page", () => {
  it("shows a future-dated record as scheduled, not as the current salary", async () => {
    const base = detail();
    mockApi(() => ({ body: { ...base, salaryHistory: [scheduled, ...base.salaryHistory] } }));
    renderAt("/employees/1");

    const card = (await screen.findByRole("heading", { name: /^Current salary/ })).parentElement!;
    expect(within(card).getByText("£80,000")).toBeInTheDocument();
    expect(within(card).getByText("as of 24 Nov 2026")).toBeInTheDocument();
    expect(card).toHaveTextContent("Scheduled: £85,000 from 1 Dec 2026");

    const rows = screen.getAllByRole("row").slice(1); // skip header
    expect(rows.map((r) => within(r).getAllByRole("cell")[4]!.textContent)).toEqual(["Scheduled", "Current", "Past"]);
    expect(within(rows[0]!).getByText("+£5,000")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("First record");
  });

  it("says when someone has not started yet", async () => {
    mockApi(() => ({ body: detail({ currentSalary: null, asOf: "2019-06-01" }) }));
    renderAt("/employees/1");
    expect(await screen.findByText("No salary yet")).toBeInTheDocument();
    expect(screen.getByText("Their first salary record starts after 1 Jun 2019.")).toBeInTheDocument();
  });

  it("shows not found for an unknown id", async () => {
    mockApi(() => ({ status: 404, body: { error: { code: "not_found", message: "Employee not found" } } }));
    renderAt("/employees/999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found.");
  });
});
