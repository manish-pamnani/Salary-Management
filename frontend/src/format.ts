// Formatting and parsing for money and dates. Dates are calendar dates
// (YYYY-MM-DD) with no time zone, so they are formatted in UTC to avoid
// shifting a day in the viewer's zone.

export function formatMoney(minor: number, currency: string, exponent: number, locale?: string): string {
  const scale = 10 ** exponent;
  // Seeded salaries are whole units; show cents only when there are some.
  const digits = minor % scale === 0 ? 0 : exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / scale);
}

export function formatSignedMoney(minor: number, currency: string, exponent: number, locale?: string): string {
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "±";
  return sign + formatMoney(Math.abs(minor), currency, exponent, locale);
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11-24" -> "24 Nov 2026" */
export function formatDate(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-11" -> "November 2026" */
export function formatMonth(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

export type ParsedAmount = { ok: true; minorUnits: number } | { ok: false; error: string };

/**
 * Parses an amount typed in major units ("85,000.50") into integer minor units
 * without going through floating point, so 0.29 becomes 29, not 28.999….
 */
export function parseAmount(input: string, currency: string, exponent: number): ParsedAmount {
  const cleaned = input.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter an amount." };
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return { ok: false, error: "Enter a number, like 85000 or 85000.50." };
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) {
    return {
      ok: false,
      error:
        exponent === 0
          ? `${currency} has no minor unit. Enter a whole number.`
          : `${currency} has at most ${exponent} decimal places.`,
    };
  }
  const minorUnits = Number(whole + fraction.padEnd(exponent, "0"));
  if (!Number.isSafeInteger(minorUnits)) return { ok: false, error: "That amount is too large." };
  if (minorUnits <= 0) return { ok: false, error: "Amount must be greater than zero." };
  return { ok: true, minorUnits };
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: "Brazil",
  CA: "Canada",
  DE: "Germany",
  GB: "United Kingdom",
  IN: "India",
  JP: "Japan",
  SG: "Singapore",
  US: "United States",
};

export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

const REASON_LABELS: Record<string, string> = {
  hire: "Hire",
  annual_review: "Annual review",
  promotion: "Promotion",
  market_adjustment: "Market adjustment",
  relocation: "Relocation",
  correction: "Correction",
};

export const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason;
