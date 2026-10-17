import { spawn } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { encrypt, readKey } from "./backup-crypto.mjs";
import { verifyOffsite } from "./offsite.mjs";
const destination = await verifyOffsite();
if (!destination) throw new Error("An independently mounted OFFSITE_BACKUP_DIR is required.");
await mkdir(destination, { recursive: true, mode: 0o700 });
const temporary = join(destination, `journal-${Date.now()}.partial`),
  key = await readKey(process.env.BACKUP_KEY_FILE ?? "secrets/backup.key");
const child = spawn("docker", ["compose", "exec", "-T", "api", "cat", "/data/security/events.jsonl"], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.resume();
const completed = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => (code === 0 ? resolve() : reject(new Error("Current journal copy failed."))));
});
try {
  await Promise.all([encrypt(child.stdout, temporary, key), completed]);
  await rename(temporary, join(destination, "latest-journal.psb"));
  console.log("Current recovery journal replicated with authenticated encryption.");
} finally {
  await rm(temporary, { force: true });
}
