import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildApp } from "./app.js";
import { todayInTimeZone } from "./clock.js";
import { DATABASE_PATH, ORG_TIMEZONE } from "./config.js";
import { openDatabase } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./seed/seed-if-empty.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = openDatabase(DATABASE_PATH);
migrate(db);

const app = buildApp({ db, logger: process.env.NODE_ENV !== "test" });

// SEED_ON_BOOT=if-empty: for hosts with an ephemeral disk, where each cold start begins empty.
if (process.env.SEED_ON_BOOT === "if-empty") {
  const result = seedIfEmpty(db, todayInTimeZone(ORG_TIMEZONE));
  app.log.info(result, result.seeded ? "seeded empty database" : "database already has data; not seeding");
}

await app.listen({ port, host });
// Time from process start to accepting requests: the app's share of a cold start.
app.log.info({ bootMs: Math.round(performance.now()), timeZone: ORG_TIMEZONE }, "ready");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
