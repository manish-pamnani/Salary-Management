import { fileURLToPath } from "node:url";

/** SQLite file location; override with DATABASE_PATH (e.g. a mounted volume in prod). */
export const DATABASE_PATH =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL("../data/salary.db", import.meta.url));

/** IANA time zone whose calendar decides "today" and "this month" (decision D10). */
export const ORG_TIMEZONE = process.env.ORG_TIMEZONE ?? "UTC";

/** Built UI to serve at "/" (D11). Ignored when the directory has no index.html, e.g. API-only dev. */
export const UI_DIR = process.env.UI_DIR ?? fileURLToPath(new URL("../../frontend/dist", import.meta.url));
