import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { employee, list, mockApi, renderAt } from "./helpers";

const gbp = employee(1, "Alice Smith");
const inr = employee(2, "Priya Patel", {
  countryCode: "IN",
  currentSalary: { amountMinorUnits: 30_00_000_00, currency: "INR", minorUnitExponent: 2, effectiveDate: "2026-04-01" },
});

const salaryButton = () => screen.getByRole("button", { name: /current salary/i });

describe("as-of date", () => {
  it("is in the app header and in the salary column header, not a footnote", async () => {
    mockApi(() => ({ body: list([gbp]) }));
    renderAt("/");
    await screen.findByText("Alice Smith");
    expect(screen.getByTestId("asof-header")).toHaveTextContent("Salaries as of 24 Nov 2026 · Asia/Kolkata calendar");
    expect(within(salaryButton()).getByText("as of 24 Nov 2026")).toBeInTheDocument();
  });
});

describe("search", () => {
  it("waits for typing to pause, sends one request, and goes back to page 1", async () => {
    const api = mockApi((url) => ({ body: list(url.searchParams.get("search") ? [inr] : [gbp, inr], { total: 120 }) }));
    const router = renderAt("/?page=3");
    await screen.findByText("Alice Smith");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "pat");
    expect(await screen.findByText("Priya Patel")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument());

    const searches = api.requests("/api/employees").map((c) => c.url.searchParams.get("search"));
    expect(searches).toEqual([null, "pat"]); // not "p", "pa", "pat"
    const last = api.requests("/api/employees").at(-1)!.url.searchParams;
    expect(last.get("page")).toBe("1");
    expect(router.state.location.search).toBe("?search=pat");
  });

  it("starts from the search in the URL, so a shared link or the back button keeps it", async () => {
    const api = mockApi(() => ({ body: list([inr]) }));
    renderAt("/?search=pat&country=IN");
    expect(await screen.findByText("Priya Patel")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("pat");
    const params = api.requests("/api/employees")[0]!.url.searchParams;
    expect(params.get("search")).toBe("pat");
    expect(params.get("country")).toBe("IN");
  });

  it("says so when nothing matches", async () => {
    mockApi(() => ({ body: list([]) }));
    renderAt("/?search=zzz");
    expect(await screen.findByText("No employees match these filters.")).toBeInTheDocument();
  });
});

describe("salary column (D8: only sortable within one currency)", () => {
  it("is disabled while several currencies are in play, with the reason on the page", async () => {
    mockApi(() => ({ body: list([gbp, inr], { total: 10_000 }) }));
    renderAt("/");
    await screen.findByText("Alice Smith");

    expect(salaryButton()).toBeDisabled();
    const note = screen.getByText(/sorting by salary is off/i);
    expect(note).toBeVisible();
    expect(note).toHaveTextContent("these 10,000 employees are paid in 2 currencies (GBP, INR)");
    expect(salaryButton()).toHaveAttribute("aria-describedby", note.id);
  });

  it("is enabled when one currency is in play, and sorts highest first", async () => {
    const api = mockApi(() => ({ body: list([gbp]) }));
    const router = renderAt("/?currency=GBP");
    await screen.findByText("Alice Smith");
    expect(screen.getByText("Everyone here is paid in GBP, so you can sort by salary.")).toBeVisible();

    await userEvent.click(salaryButton());
    await waitFor(() => expect(router.state.location.search).toBe("?currency=GBP&sort=salary&order=desc"));
    const params = api.requests("/api/employees").at(-1)!.url.searchParams;
    expect(params.get("sort")).toBe("salary");
    expect(params.get("order")).toBe("desc");
  });

  it("explains the API's refusal and offers to sort by name instead", async () => {
    mockApi((url) =>
      url.searchParams.get("sort") === "salary"
        ? {
            status: 400,
            body: {
              error: {
                code: "currency_required",
                message: "Sorting by salary needs a single currency, but matching employees are paid in GBP, INR.",
                currencies: ["GBP", "INR"],
              },
            },
          }
        : { body: list([gbp, inr]) },
    );
    const router = renderAt("/?sort=salary&order=desc");
    expect(await screen.findByRole("alert")).toHaveTextContent("paid in GBP, INR");
    expect(salaryButton).toThrow(); // no table while the sort is refused

    await userEvent.click(screen.getByRole("button", { name: "Sort by name instead" }));
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
    expect(salaryButton()).toBeDisabled();
  });
});

describe("pagination", () => {
  it("asks the server for the next page of 50", async () => {
    const api = mockApi((url) => ({
      body: list([gbp], { total: 120, page: Number(url.searchParams.get("page")) }),
    }));
    renderAt("/");
    expect(await screen.findByText("1–50 of 120 · page 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next ›" }));
    expect(await screen.findByText("51–100 of 120 · page 2 of 3")).toBeInTheDocument();
    const params = api.requests("/api/employees").at(-1)!.url.searchParams;
    expect([params.get("page"), params.get("pageSize")]).toEqual(["2", "50"]);
  });
});
