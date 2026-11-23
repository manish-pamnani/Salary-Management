/**
 * "Today" for the organisation. Effective dates are calendar dates with no
 * time zone (the date written in the contract), so the only question is which
 * calendar decides that today has started. The answer is the org's time zone
 * (ORG_TIMEZONE), not the server's clock: a server on UTC would still be on
 * 30 November for the first 5.5 hours of 1 December in Delhi (decision D10).
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Fails fast at startup on a typo like "Asia/Delhi" instead of at the first request. */
export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`Invalid ORG_TIMEZONE "${timeZone}": expected an IANA zone such as Asia/Kolkata`);
  }
}
