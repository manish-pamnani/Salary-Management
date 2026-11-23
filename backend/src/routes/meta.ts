import type { FastifyPluginAsync } from "fastify";
import type { RouteContext } from "../app.js";
import { listFilterOptions } from "../repositories/meta.js";

export const metaRoutes =
  ({ db, today }: RouteContext): FastifyPluginAsync =>
  async (app) => {
    app.get("/meta", async () => ({ today: today(), ...listFilterOptions(db) }));
  };
