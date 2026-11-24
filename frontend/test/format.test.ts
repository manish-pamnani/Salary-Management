import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, parseAmount } from "../src/format";

describe("parseAmount: what the manager types -> integer minor units", () => {
  it.each([
    ["85000", "GBP", 2, 85_000_00],
    ["85,000", "GBP", 2, 85_000_00],
    ["85,000.5", "GBP", 2, 85_000_50],
    ["0.29", "USD", 2, 29], // 0.29 * 100 is 28.999… in floating point
    [" 1 200 000 ", "JPY", 0, 1_200_000],
  ])("%s %s -> %i", (input, currency, exponent, expected) => {
    expect(parseAmount(input, currency, exponent)).toEqual({ ok: true, minorUnits: expected });
  });

  it.each([
    ["", "Enter an amount."],
    ["abc", "Enter a number"],
    ["-5", "Enter a number"],
    ["1e5", "Enter a number"],
    ["0", "greater than zero"],
    ["10.123", "at most 2 decimal places"],
  ])("rejects %j", (input, message) => {
    const result = parseAmount(input, "GBP", 2);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it("rejects decimals for a currency with no minor unit", () => {
    const result = parseAmount("1000.50", "JPY", 0);
    expect(!result.ok && result.error).toBe("JPY has no minor unit. Enter a whole number.");
  });
});

describe("formatting", () => {
  it("uses the currency's exponent and hides .00 on whole amounts", () => {
    expect(formatMoney(85_000_00, "GBP", 2, "en-GB")).toBe("£85,000");
    expect(formatMoney(85_000_50, "GBP", 2, "en-GB")).toBe("£85,000.50");
    expect(formatMoney(1_200_000, "JPY", 0, "en-GB")).toBe("JP¥1,200,000");
  });

  it("formats calendar dates without shifting them into the viewer's time zone", () => {
    expect(formatDate("2026-12-01")).toBe("1 Dec 2026");
  });
});
