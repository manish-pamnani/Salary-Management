import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SalaryHistoryEntry } from "../src/api";
import { detail, mockApi, renderAt } from "./helpers";

const field = (name: string) => screen.getByLabelText(name);

async function openForm(onPost?: (body: Record<string, unknown>) => { status?: number; body: unknown }) {
  let current = detail();
  const api = mockApi((url, init) => {
    if (url.pathname === "/api/employees/1" && (init.method ?? "GET") === "GET") return { body: current };
    if (url.pathname === "/api/employees/1/salary-records" && init.method === "POST") {
      const body = JSON.parse(String(init.body));
      const reply = onPost?.(body) ?? { status: 201, body: { ...body, id: 99, minorUnitExponent: 2 } };
      if ((reply.status ?? 200) < 300) {
        const added = { ...(reply.body as SalaryHistoryEntry), status: "scheduled" as const, change: null };
        current = { ...current, salaryHistory: [added, ...current.salaryHistory] };
      }
      return reply;
    }
    return undefined;
  });
  renderAt("/employees/1");
  await screen.findByRole("heading", { name: "Emma Hall" });
  return api;
}

async function fill(amount: string, date?: string) {
  await userEvent.type(field("Annual amount"), amount);
  if (date) {
    await userEvent.clear(field("Effective date"));
    await userEvent.type(field("Effective date"), date);
  }
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Add salary record" }));

describe("add salary record form", () => {
  it("defaults to today's date and the current currency", async () => {
    await openForm();
    expect(field("Effective date")).toHaveValue("2026-11-24");
    expect(field("Currency")).toHaveValue("GBP");
    expect(field("Reason")).toHaveValue("annual_review");
  });

  it("posts integer minor units, then reloads the history", async () => {
    const api = await openForm();
    await fill("85,000.50", "2026-12-01");
    await userEvent.selectOptions(field("Reason"), "promotion");
    expect(screen.getByText(/£85,000.50 a year · \+6.3% on the current salary/)).toBeInTheDocument();
    await submit();

    expect(await screen.findByRole("status")).toHaveTextContent("Added £85,000.50 effective 1 Dec 2026 (scheduled).");
    expect(api.requests("/api/employees/1/salary-records", "POST").map((c) => c.body)).toEqual([
      { amountMinorUnits: 85_000_50, currency: "GBP", effectiveDate: "2026-12-01", reason: "promotion" },
    ]);
    await waitFor(() => expect(api.requests("/api/employees/1")).toHaveLength(2));
    expect(field("Annual amount")).toHaveValue("");
  });

  it("warns that a future date is scheduled and does not change today's salary", async () => {
    await openForm();
    await fill("90000", "2027-01-01");
    expect(screen.getByText("Scheduled: the current salary stays the same until 1 Jan 2027.")).toBeInTheDocument();
  });

  it("warns when the currency differs from what they are paid in now", async () => {
    await openForm();
    await userEvent.selectOptions(field("Currency"), "INR");
    expect(screen.getByText(/currently paid in GBP. A different currency is usually a relocation/)).toBeInTheDocument();
  });

  it("does not post an invalid amount", async () => {
    const api = await openForm();
    await fill("85k");
    await submit();
    expect(screen.getByText("Enter a number, like 85000 or 85000.50.")).toBeInTheDocument();
    expect(field("Annual amount")).toHaveAttribute("aria-invalid", "true");

    await userEvent.selectOptions(field("Currency"), "JPY");
    await userEvent.clear(field("Annual amount"));
    await fill("1000.5");
    await submit();
    expect(screen.getByText("JPY has no minor unit. Enter a whole number.")).toBeInTheDocument();
    expect(api.requests("/api/employees/1/salary-records", "POST")).toHaveLength(0);
  });

  it("refuses a second record on a date that already has one, before asking the server", async () => {
    const api = await openForm();
    await fill("90000", "2026-04-01");
    await submit();
    expect(screen.getByText(/already a record effective 1 Apr 2026/)).toBeInTheDocument();
    expect(api.requests("/api/employees/1/salary-records", "POST")).toHaveLength(0);
  });

  it("refuses a date before the employee started", async () => {
    await openForm();
    await fill("90000", "2019-12-31");
    await submit();
    expect(screen.getByText("That is before Emma Hall started (6 Jan 2020).")).toBeInTheDocument();
  });

  it("shows the server's reason when it rejects the record", async () => {
    await openForm(() => ({
      status: 409,
      body: { error: { code: "duplicate_effective_date", message: "Employee 1 already has a salary record effective 2026-12-01." } },
    }));
    await fill("90000", "2026-12-01");
    await submit();
    expect(await screen.findByText("Employee 1 already has a salary record effective 2026-12-01.")).toBeInTheDocument();
    expect(field("Effective date")).toHaveAttribute("aria-invalid", "true");
    expect(field("Annual amount")).toHaveValue("90000"); // nothing lost
  });
});
