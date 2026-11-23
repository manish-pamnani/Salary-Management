import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildApp } from "./app.js";
import { DATABASE_PATH } from "./config.js";
import { openDatabase } from "./db/connection.js";
import { migrate } from "./db/migrate.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = openDatabase(DATABASE_PATH);
migrate(db);

const app = buildApp({ db, logger: process.env.NODE_ENV !== "test" });
await app.listen({ port, host });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
