import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../app.js";
import { countryCode, parse } from "../http/validation.js";
import { departmentMonthlyCost, headcountByCurrency, paySummary } from "../repositories/analytics.js";
import { listEmployees } from "../repositories/employees.js";

const summarySchema = z.object({
  groupBy: z.enum(["country", "department"]).default("country"),
  country: countryCode.optional(),
  department: z.string().max(100).optional(),
});

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a month as YYYY-MM");

const departmentCostSchema = z.object({
  department: z.string().min(1).max(100),
  month: month.optional(),
});

const currentSalarySchema = z.object({ q: z.string().trim().min(1).max(100) });

export const analyticsRoutes =
  ({ db, today }: RouteContext): FastifyPluginAsync =>
  async (app) => {
    app.get("/analytics/pay-summary", async (request) => {
      const query = parse(summarySchema, request.query);
      const asOf = today();
      return { asOf, groupBy: query.groupBy, rows: paySummary(db, query, asOf) };
    });

    // The three fixed questions from the requirements' "Ask" panel.

    app.get("/ask/current-salary", async (request) => {
      const { q } = parse(currentSalarySchema, request.query);
      const asOf = today();
      const { items, total } = listEmployees(
        db,
        { search: q, sort: "name", order: "asc", page: 1, pageSize: 5 },
        asOf,
      );
      return { asOf, matches: items, totalMatches: total };
    });

    app.get("/ask/department-cost", async (request) => {
      const query = parse(departmentCostSchema, request.query);
      const targetMonth = query.month ?? today().slice(0, 7);
      return {
        department: query.department,
        month: targetMonth,
        byCurrency: departmentMonthlyCost(db, query.department, targetMonth),
      };
    });

    app.get("/ask/headcount-by-currency", async () => {
      const asOf = today();
      return { asOf, rows: headcountByCurrency(db, asOf) };
    });
  };
