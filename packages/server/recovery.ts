import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { postgres } from "./db.js";
import { SecurityJournal } from "./journal.js";
const path = process.env.SECURITY_JOURNAL ?? "/data/security/events.jsonl";
let incoming = "";
for await (const chunk of process.stdin) {
  incoming += chunk.toString();
  if (incoming.length > 16 * 1024 * 1024) throw new Error("Recovery journal is too large.");
}
// The operator supplies the most recent independently retained journal, never an old DB snapshot alone.
for (const line of incoming.split("\n").filter(Boolean)) {
  const value = JSON.parse(line);
  if (
    !["user", "profile", "media", "revision", "share", "badge"].includes(value.kind) ||
    !/^[a-f0-9]{64}$/.test(value.hash)
  )
    throw new Error("Invalid recovery journal.");
}
await mkdir(dirname(path), { recursive: true });
await appendFile(path, incoming + (incoming.endsWith("\n") ? "" : "\n"), { mode: 0o600 });
const connection = postgres(process.env.DATABASE_URL!);
try {
  await new SecurityJournal(path).replay(connection.db);
  await connection.db.query("DELETE FROM worker_results");
  await connection.db.query(
    "UPDATE media SET lease_until=NULL,lease_token=NULL,attempts=0 WHERE status='processing'",
  );
  console.log("Recovery fences applied. All sessions and confirmations were invalidated.");
} finally {
  await connection.close();
}
