import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** True when `dir` holds a built UI (frontend/dist). */
export const hasUi = (dir: string | undefined): dir is string => Boolean(dir && existsSync(join(dir, "index.html")));

/**
 * Serves the built React app from the same origin as the API (D11), so there
 * is no CORS and one deploy. Hashed assets are cached for a year; index.html
 * is never cached, so a deploy shows up on the next load.
 * Any other GET outside /api returns index.html, and the client router
 * decides what to show (/employees/42 on a reload, for example).
 */
export function serveUi(app: FastifyInstance, dir: string): void {
  app.register(fastifyStatic, {
    root: dir,
    wildcard: false,
    index: false,
    setHeaders(reply, path) {
      reply.header("cache-control", path.startsWith(join(dir, "assets")) ? "public, max-age=31536000, immutable" : "no-cache");
    },
  });
  // wildcard: false registers a route per file found at start-up, including /index.html.
  app.get("/", (_request, reply) => reply.header("cache-control", "no-cache").sendFile("index.html"));

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0]!;
    if (request.method === "GET" && !path.startsWith("/api") && !path.startsWith("/assets/")) {
      return reply.header("cache-control", "no-cache").sendFile("index.html");
    }
    return reply.status(404).send({ error: { code: "not_found", message: `No route for ${request.method} ${path}` } });
  });
}
