import { loadConfig } from "./config.js";
import { postgres } from "./db.js";
import { discordPermissions } from "./permissions.js";
import { ProfileService } from "./service.js";
import { FileStore } from "./media.js";
import { SecurityJournal } from "./journal.js";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export async function runtime(role = "api") {
  const config = loadConfig(role),
    connection = postgres(config.DATABASE_URL);
  const service = new ProfileService(
    connection.db,
    discordPermissions(config),
    config.PUBLIC_URL,
    new SecurityJournal(process.env.SECURITY_JOURNAL ?? "data/security/events.jsonl"),
  );
  const files = new FileStore(config.MEDIA_ROOT);
  await files.init(role === "bot" ? ["quarantine"] : undefined);
  await mkdir(dirname(service.journal!.path), { recursive: true, mode: 0o700 });
  await appendFile(service.journal!.path, "", { mode: 0o600 });
  return { config, service, files, close: connection.close };
}
