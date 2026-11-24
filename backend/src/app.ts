import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/connection.js";
import { ApiError } from "./http/errors.js";
import { addServerTiming } from "./http/server-timing.js";
import { hasUi, serveUi } from "./http/ui.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { employeeRoutes } from "./routes/employees.js";
import { homeRoutes } from "./routes/home.js";
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
  /** Directory of the built UI (frontend/dist). When present the UI takes "/" and the API landing page stays at /api. */
  uiDir?: string;
}

export interface RouteContext {
  db: Db;
  timeZone: string;
  today: () => string;
}

export function buildApp({ db, timeZone = ORG_TIMEZONE, today, logger = false, uiDir }: AppDeps): FastifyInstance {
  assertValidTimeZone(timeZone);
  const app = Fastify({ logger });
  const ctx: RouteContext = { db, timeZone, today: today ?? (() => todayInTimeZone(timeZone)) };
  addServerTiming(app);

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
  const withUi = hasUi(uiDir);
  app.register(homeRoutes(ctx, { atRoot: !withUi }));
  if (withUi) serveUi(app, uiDir);
  app.register(metaRoutes(ctx), { prefix: "/api" });
  app.register(employeeRoutes(ctx), { prefix: "/api" });
  app.register(analyticsRoutes(ctx), { prefix: "/api" });
  return app;
}
