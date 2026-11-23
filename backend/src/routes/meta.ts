import type { FastifyPluginAsync } from "fastify";
import type { RouteContext } from "../app.js";
import { listFilterOptions } from "../repositories/meta.js";

export const metaRoutes =
  ({ db, today, timeZone }: RouteContext): FastifyPluginAsync =>
  async (app) => {
    app.get("/meta", async () => ({ today: today(), timeZone, ...listFilterOptions(db) }));
  };
