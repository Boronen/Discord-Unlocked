import { lstatSync, readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function regularFile(path, maxBytes) {
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > maxBytes) throw new Error();
  return file;
}

/** Resolve once per operation, before stopping writers or changing containers. */
export function productionComposeEnv(root = process.cwd(), environment = process.env, production = false) {
  const app = resolve(root);
  const base = [join(app, "compose.yml"), join(app, "deploy", "production.yml")];
  const env = { ...environment };
  if (production) env.COMPOSE_FILE = base.join(delimiter);
  const marker = join(app, "secrets", "privacy-notice.enabled");
  try {
    lstatSync(marker);
  } catch (error) {
    if (error.code === "ENOENT") return env;
    throw new Error("Cannot inspect the privacy notice activation marker.");
  }
  try {
    // A completed JSON file alone must never activate an unapproved notice.
    regularFile(marker, 32);
    if (readFileSync(marker, "utf8").trim() !== "enabled") throw new Error();
    const secretDirectory = lstatSync(join(app, "secrets"));
    if (!secretDirectory.isDirectory() || secretDirectory.isSymbolicLink()) throw new Error();
    const notice = join(app, "secrets", "privacy-notice.json");
    if (!regularFile(notice, 32 * 1024).size) throw new Error();
    const override = join(app, "deploy", "privacy-notice.compose.example.yml");
    regularFile(override, 32 * 1024);
    const current = (env.COMPOSE_FILE ?? base.join(delimiter))
      .split(delimiter)
      .map((path) => resolve(app, path));
    if (
      current.length < 2 ||
      current.length > 3 ||
      current[0] !== base[0] ||
      current[1] !== base[1] ||
      (current.length === 3 && current[2] !== override)
    )
      throw new Error();
    // API startup performs full schema validation; this resolver never prints content.
    env.COMPOSE_FILE = [...base, override].join(delimiter);
    return env;
  } catch {
    throw new Error("Privacy notice activation is invalid or incompatible with this Compose file set.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== "--production")
    throw new Error("Usage: node scripts/production-compose.mjs --production");
  console.log(productionComposeEnv(process.cwd(), process.env, true).COMPOSE_FILE);
}
