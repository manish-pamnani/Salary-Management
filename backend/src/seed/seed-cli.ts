import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { todayInTimeZone } from "../clock.js";
import { DATABASE_PATH, ORG_TIMEZONE } from "../config.js";
import { openDatabase } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { generateSeedData } from "./generate.js";
import { writeSeedData } from "./write.js";

/**
 * Usage: npm run seed -- [--count 10000] [--seed 42] [--as-of YYYY-MM-DD]
 * Wipes and reseeds the database at DATABASE_PATH.
 */
const { values } = parseArgs({
  options: {
    count: { type: "string", default: "10000" },
    seed: { type: "string", default: "42" },
    "as-of": { type: "string", default: todayInTimeZone(ORG_TIMEZONE) },
  },
});

const options = { count: Number(values.count), seed: Number(values.seed), asOf: values["as-of"] };

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = openDatabase(DATABASE_PATH);
migrate(db);

const started = performance.now();
const data = generateSeedData(options);
const generated = performance.now();
writeSeedData(db, data);
const written = performance.now();

console.log(
  `Seeded ${data.employees.length.toLocaleString()} employees and ` +
    `${data.salaryRecords.length.toLocaleString()} salary records ` +
    `(seed ${options.seed}, as of ${options.asOf}) into ${DATABASE_PATH}\n` +
    `  generate: ${(generated - started).toFixed(0)} ms, write: ${(written - generated).toFixed(0)} ms`,
);
db.close();
