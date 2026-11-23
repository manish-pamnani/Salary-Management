import { z } from "zod";
import { ApiError } from "./errors.js";

/** Parses input with a Zod schema, turning failures into a 400 that lists each bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError(400, "invalid_request", "Request validation failed", {
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

/** A real calendar date in YYYY-MM-DD (rejects 2024-02-30). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD")
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "Not a real calendar date");

export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Expected an ISO-4217 code such as USD");

export const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, "Expected an ISO-3166 alpha-2 code such as GB");
