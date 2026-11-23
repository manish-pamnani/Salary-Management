import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DATABASE_PATH } from "../config.js";
import { openDatabase } from "./connection.js";
import { migrate } from "./migrate.js";

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = openDatabase(DATABASE_PATH);
const applied = migrate(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Schema up to date.");
db.close();
