import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestDb } from "./helpers.js";

function fakeUi(): string {
  const dir = mkdtempSync(join(tmpdir(), "ui-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><div id=root></div>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log('ui')");
  return dir;
}

describe("serving the built UI (D11)", () => {
  const app = buildApp({ db: createTestDb(), today: () => "2026-06-15", uiDir: fakeUi() });

  it("takes / and keeps the API landing page at /api", async () => {
    const root = await app.inject("/");
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('<div id=root>');
    expect(root.headers["cache-control"]).toBe("no-cache");
    expect((await app.inject("/api")).body).toContain("Salary Management API");
  });

  it("returns index.html for client-side routes, so a reload on /employees/42 works", async () => {
    const res = await app.inject("/employees/42?from=search");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain('<div id=root>');
  });

  it("caches hashed assets for a year", async () => {
    const res = await app.inject("/assets/app-abc123.js");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("still 404s as JSON for unknown API routes and missing assets", async () => {
    for (const url of ["/api/nope", "/assets/missing.js"]) {
      const res = await app.inject(url);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("not_found");
    }
    expect((await app.inject("/api/meta")).json().timeZone).toBeDefined();
  });

  it("without a built UI, / is the API landing page", async () => {
    const apiOnly = buildApp({ db: createTestDb(), uiDir: join(tmpdir(), "does-not-exist") });
    expect((await apiOnly.inject("/")).body).toContain("Salary Management API");
  });
});
