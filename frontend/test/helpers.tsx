import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import type { Employee, EmployeeDetail, EmployeeList, Meta } from "../src/api";
import { routes } from "../src/routes";

export const META: Meta = {
  today: "2026-11-24",
  timeZone: "Asia/Kolkata",
  countries: ["GB", "IN", "US"],
  departments: ["Engineering", "Sales"],
  currencies: [
    { code: "GBP", minorUnitExponent: 2 },
    { code: "INR", minorUnitExponent: 2 },
    { code: "JPY", minorUnitExponent: 0 },
    { code: "USD", minorUnitExponent: 2 },
  ],
};

export function employee(id: number, fullName: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    fullName,
    email: `${fullName.toLowerCase().replace(/ /g, ".")}.${id}@acme.example`,
    countryCode: "GB",
    department: "Engineering",
    jobTitle: "Software Engineer",
    startDate: "2020-01-06",
    currentSalary: { amountMinorUnits: 80_000_00, currency: "GBP", minorUnitExponent: 2, effectiveDate: "2026-04-01" },
    ...overrides,
  };
}

export function list(items: Employee[], overrides: Partial<EmployeeList> = {}): EmployeeList {
  return {
    items,
    page: 1,
    pageSize: 50,
    total: items.length,
    asOf: META.today,
    salaryCurrencies: [...new Set(items.flatMap((e) => (e.currentSalary ? [e.currentSalary.currency] : [])))].sort(),
    ...overrides,
  };
}

export function detail(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    ...employee(1, "Emma Hall"),
    asOf: META.today,
    salaryHistory: [
      {
        id: 2, employeeId: 1, amountMinorUnits: 80_000_00, currency: "GBP", minorUnitExponent: 2,
        effectiveDate: "2026-04-01", reason: "annual_review", createdAt: "2026-04-01T00:00:00Z",
        status: "current", change: { amountMinorUnits: 5_000_00, percent: 6.67 },
      },
      {
        id: 1, employeeId: 1, amountMinorUnits: 75_000_00, currency: "GBP", minorUnitExponent: 2,
        effectiveDate: "2020-01-06", reason: "hire", createdAt: "2020-01-06T00:00:00Z",
        status: "past", change: null,
      },
    ],
    ...overrides,
  };
}

type Reply = { status?: number; body: unknown };
export type Handler = (url: URL, init: RequestInit) => Reply | undefined;

export interface Call {
  method: string;
  url: URL;
  body: unknown;
}

/**
 * Stubs fetch. `/api/meta` is answered automatically; everything else goes to
 * `handler`. Every request is recorded so tests can assert what the UI asked for.
 */
export function mockApi(handler: Handler) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, "http://localhost");
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const reply: Reply | undefined = url.pathname === "/api/meta" ? { body: META } : handler(url, init);
      if (!reply) throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`);
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const requests = (pathname: string, method = "GET") =>
    calls.filter((c) => c.url.pathname === pathname && c.method === method);
  return { calls, requests };
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
