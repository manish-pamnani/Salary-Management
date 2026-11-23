import { addDays, parseIsoDate, yearOf } from "./dates.js";
import { Random } from "./random.js";
import {
  COUNTRIES,
  DEPARTMENTS,
  LEVELS,
  MINOR_UNIT_EXPONENT,
  NAMES,
  type Country,
  type Level,
} from "./reference-data.js";

export type SalaryReason = "hire" | "annual_review" | "promotion" | "market_adjustment" | "relocation";

export interface SeedEmployee {
  id: number;
  fullName: string;
  email: string;
  countryCode: string;
  department: string;
  jobTitle: string;
  startDate: string;
}

export interface SeedSalaryRecord {
  employeeId: number;
  amountMinorUnits: number;
  currency: string;
  effectiveDate: string;
  reason: SalaryReason;
}

export interface SeedData {
  employees: SeedEmployee[];
  salaryRecords: SeedSalaryRecord[];
}

export interface SeedOptions {
  count: number;
  seed: number;
  /** "Today" for the generated company. Fixing it makes output fully reproducible. */
  asOf: string;
}

/** Tunables, named so the shape of the data is readable in one place. */
const PROBABILITY = {
  reviewRaise: 0.9, // gets a raise in a given annual cycle
  promotion: 0.12, // that raise is a promotion (when not already at the top level)
  marketAdjustment: 0.04, // per year
  relocation: 0.03, // per employee with 3+ years tenure
  scheduledRaise: 0.02, // has a future-dated raise already approved
};
const MAX_TENURE_DAYS = 12 * 365;
const MIN_DAYS_BEFORE_FIRST_REVIEW = 180;

/**
 * Generates a deterministic company: the same options always yield the same
 * employees and salary histories. Pure (no I/O), so it is cheap to unit test.
 *
 * Each history starts with a 'hire' record on the start date, then appends
 * annual reviews (1 April), occasional promotions and market adjustments
 * (1 October), sometimes a relocation that switches currency, and for a few
 * people a raise dated after `asOf` that must not count as current.
 */
export function generateSeedData({ count, seed, asOf }: SeedOptions): SeedData {
  parseIsoDate(asOf);
  if (!Number.isInteger(count) || count < 0) throw new Error(`Invalid employee count: ${count}`);

  const random = new Random(seed);
  const employees: SeedEmployee[] = [];
  const salaryRecords: SeedSalaryRecord[] = [];

  for (let id = 1; id <= count; id++) {
    const { employee, records } = generateEmployee(random, id, asOf);
    employees.push(employee);
    salaryRecords.push(...records);
  }
  return { employees, salaryRecords };
}

interface PayEvent {
  date: string;
  reason: SalaryReason;
  /** Multiplier applied to pay; for relocation, applied after the currency switch. */
  factor: number;
  promotes?: boolean;
}

function generateEmployee(random: Random, id: number, asOf: string) {
  const country = random.weighted(COUNTRIES);
  const department = random.weighted(DEPARTMENTS);
  const startDate = addDays(asOf, -random.int(0, MAX_TENURE_DAYS));
  const tenureYears = yearOf(asOf) - yearOf(startDate);

  // Some people joined in another country and moved later; their early
  // records are in the old currency.
  const relocation =
    tenureYears >= 3 && random.chance(PROBABILITY.relocation)
      ? {
          from: random.pick(COUNTRIES.filter((c) => c.code !== country.code)),
          date: `${random.int(yearOf(startDate) + 2, yearOf(asOf) - 1)}-07-01`,
        }
      : undefined;
  const hireCountry = relocation?.from ?? country;

  const names = NAMES[hireCountry.namePool];
  const firstName = random.pick(names.first);
  const lastName = random.pick(names.last);

  let level = random.weighted(LEVELS);
  const events = buildPayEvents(random, { startDate, asOf, hireLevel: level.level, relocationDate: relocation?.date });

  let currentCountry = hireCountry;
  // Pay is tracked in "USD-equivalent" and converted per record, so a raise is
  // the same proportional change whatever the currency.
  let payUsd = department.baseUsd * level.payMultiplier * random.between(0.9, 1.1);

  const records: SeedSalaryRecord[] = [
    toRecord(id, payUsd, currentCountry, startDate, "hire"),
  ];
  for (const event of events) {
    if (event.reason === "relocation") currentCountry = country;
    if (event.promotes) level = nextLevel(level);
    payUsd *= event.factor;
    records.push(toRecord(id, payUsd, currentCountry, event.date, event.reason));
  }

  const jobTitle = [level.titlePrefix, department.role].filter(Boolean).join(" ");
  const employee: SeedEmployee = {
    id,
    fullName: `${firstName} ${lastName}`,
    email: `${slug(firstName)}.${slug(lastName)}.${id}@acme.example`,
    countryCode: country.code,
    department: department.name,
    jobTitle,
    startDate,
  };
  return { employee, records };
}

/** Pay changes after hire, in date order, at most one per date. */
function buildPayEvents(
  random: Random,
  { startDate, asOf, hireLevel, relocationDate }:
    { startDate: string; asOf: string; hireLevel: number; relocationDate?: string },
): PayEvent[] {
  const earliestChange = addDays(startDate, MIN_DAYS_BEFORE_FIRST_REVIEW);
  const topLevel = LEVELS[LEVELS.length - 1]!.level;
  const events: PayEvent[] = [];
  let level = hireLevel;

  for (let year = yearOf(startDate); year <= yearOf(asOf); year++) {
    const review = `${year}-04-01`;
    if (review >= earliestChange && review <= asOf && random.chance(PROBABILITY.reviewRaise)) {
      const promotes = level < topLevel && random.chance(PROBABILITY.promotion);
      if (promotes) level++;
      events.push(
        promotes
          ? { date: review, reason: "promotion", factor: random.between(1.1, 1.18), promotes: true }
          : { date: review, reason: "annual_review", factor: random.between(1.02, 1.06) },
      );
    }

    if (relocationDate && yearOf(relocationDate) === year && relocationDate > startDate) {
      events.push({ date: relocationDate, reason: "relocation", factor: random.between(0.97, 1.08) });
    }

    const midYear = `${year}-10-01`;
    if (midYear >= earliestChange && midYear <= asOf && random.chance(PROBABILITY.marketAdjustment)) {
      events.push({ date: midYear, reason: "market_adjustment", factor: random.between(1.05, 1.1) });
    }
  }

  if (random.chance(PROBABILITY.scheduledRaise)) {
    events.push({ date: addDays(asOf, random.int(1, 90)), reason: "annual_review", factor: random.between(1.03, 1.08) });
  }
  return events;
}

function nextLevel(level: Level): Level {
  return LEVELS.find((l) => l.level === level.level + 1) ?? level;
}

function toRecord(
  employeeId: number,
  payUsd: number,
  country: Country,
  effectiveDate: string,
  reason: SalaryReason,
): SeedSalaryRecord {
  return {
    employeeId,
    amountMinorUnits: toMinorUnits(payUsd * country.payFactor, country.currency),
    currency: country.currency,
    effectiveDate,
    reason,
  };
}

/** Rounds to the nearest 100 major units (as offer letters do), then to integer minor units. */
export function toMinorUnits(majorAmount: number, currency: string): number {
  const exponent = MINOR_UNIT_EXPONENT[currency];
  if (exponent === undefined) throw new Error(`Unknown currency: ${currency}`);
  const roundedMajor = Math.max(100, Math.round(majorAmount / 100) * 100);
  return roundedMajor * 10 ** exponent;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
