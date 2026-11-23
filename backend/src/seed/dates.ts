/** Date-only helpers on ISO "YYYY-MM-DD" strings, all in UTC to avoid DST/timezone drift. */

const MS_PER_DAY = 86_400_000;

export function parseIsoDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Not an ISO date: ${iso}`);
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== iso) throw new Error(`Invalid date: ${iso}`);
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * MS_PER_DAY));
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function todayIso(): string {
  return toIsoDate(new Date());
}
