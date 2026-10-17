import { loadMigrationConfig } from "./config.js";
import { readFile } from "node:fs/promises";
import { postgres, migrate } from "./db.js";
const connection = postgres(loadMigrationConfig().DATABASE_URL);
try {
  await migrate(connection.db);
  await connection.db.query(await readFile(new URL("../../deploy/grants.sql", import.meta.url), "utf8"));
  console.log("The database is up to date.");
} finally {
  await connection.close();
}
