import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";

if (!process.getuid || process.getuid() === 0) throw new Error("Runtime check requires a non-root user.");
JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await import("../dist/server/db.js");
for (const path of [
  "../dist/server/main.js",
  "../dist/server/worker.js",
  "../dist/server/migrate.js",
  "../dist/server/recovery.js",
  "../dist/bot/main.js",
  "grants.sql",
  "launch-check.mjs",
])
  await access(new URL(path, import.meta.url), constants.R_OK);
const migrations = new URL("../migrations/", import.meta.url);
for (const name of (await readdir(migrations)).filter((value) => value.endsWith(".sql")))
  await readFile(new URL(name, migrations));
try {
  await access(new URL("../package.json", import.meta.url), constants.W_OK);
} catch (error) {
  if (error.code !== "EACCES") throw error;
  console.log("Non-root runtime can read application files and cannot rewrite package.json.");
  process.exit(0);
}
throw new Error("Runtime user must not be able to rewrite application files.");
