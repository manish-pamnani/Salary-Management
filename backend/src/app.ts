import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/connection.js";
import { ApiError } from "./http/errors.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { employeeRoutes } from "./routes/employees.js";
import { metaRoutes } from "./routes/meta.js";
import { assertValidTimeZone, todayInTimeZone } from "./clock.js";
import { ORG_TIMEZONE } from "./config.js";

export interface AppDeps {
  db: Db;
  /** IANA zone whose calendar decides "today" (D10). Defaults to ORG_TIMEZONE. */
  timeZone?: string;
  /** "Today" as YYYY-MM-DD. Injected so tests can pin the date that decides what is current. */
  today?: () => string;
  logger?: boolean;
}

export interface RouteContext {
  db: Db;
  timeZone: string;
  today: () => string;
}

export function buildApp({ db, timeZone = ORG_TIMEZONE, today, logger = false }: AppDeps): FastifyInstance {
  assertValidTimeZone(timeZone);
  const app = Fastify({ logger });
  const ctx: RouteContext = { db, timeZone, today: today ?? (() => todayInTimeZone(timeZone)) };

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, ...error.details } });
    }
    // Fastify's own client errors (e.g. malformed JSON body) carry a 4xx statusCode.
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: "bad_request", message: (error as Error).message } });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: "internal", message: "Something went wrong" } });
  });

  app.get("/api/health", async () => ({ status: "ok" }));
  app.register(metaRoutes(ctx), { prefix: "/api" });
  app.register(employeeRoutes(ctx), { prefix: "/api" });
  app.register(analyticsRoutes(ctx), { prefix: "/api" });
  return app;
}
