import type { FastifyInstance } from "fastify";

/**
 * Adds `Server-Timing: app;dur=<ms>` to every response: time from the request
 * arriving to the response body being serialized. A client subtracts it from
 * its own total to separate server work from network (PERFORMANCE.md).
 */
export function addServerTiming(app: FastifyInstance): void {
  const started = new WeakMap<object, bigint>();
  app.addHook("onRequest", async (request) => {
    started.set(request, process.hrtime.bigint());
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const start = started.get(request);
    if (start !== undefined) {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      reply.header("Server-Timing", `app;dur=${ms.toFixed(1)}`);
    }
    return payload;
  });
}
