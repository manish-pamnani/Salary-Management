import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../app.js";
import { countryCode, currencyCode, isoDate, parse } from "../http/validation.js";
import { getEmployee, listEmployees } from "../repositories/employees.js";
import { addSalaryRecord, CHANGE_REASONS, getSalaryHistory } from "../repositories/salaries.js";

export const MAX_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  search: z.string().max(100).optional(),
  country: countryCode.optional(),
  department: z.string().max(100).optional(),
  currency: currencyCode.optional(),
  sort: z.enum(["name", "salary", "start_date"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

const newSalarySchema = z.object({
  amountMinorUnits: z.number().int("Amount must be in whole minor units (e.g. cents)").positive(),
  currency: currencyCode,
  effectiveDate: isoDate,
  reason: z.enum(CHANGE_REASONS as [string, ...string[]]),
});

export const employeeRoutes =
  ({ db, today }: RouteContext): FastifyPluginAsync =>
  async (app) => {
    app.get("/employees", async (request) => {
      return listEmployees(db, parse(listQuerySchema, request.query), today());
    });

    app.get("/employees/:id", async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      const asOf = today();
      const employee = getEmployee(db, id, asOf);
      return { ...employee, asOf, salaryHistory: getSalaryHistory(db, id, asOf) };
    });

    app.post("/employees/:id/salary-records", async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const input = parse(newSalarySchema, request.body) as Parameters<typeof addSalaryRecord>[2];
      const record = addSalaryRecord(db, id, input);
      return reply.status(201).send(record);
    });
  };
