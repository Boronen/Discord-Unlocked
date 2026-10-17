import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { readKey, decrypt, checksum, discard, verifyManifest } from "./backup-crypto.mjs";
import { Writable } from "node:stream";
if (
  !process.argv[2] ||
  !process.argv.includes("--replace-current-data") ||
  !process.argv.includes("--journal-current")
)
  throw new Error(
    "Usage: node scripts/restore.mjs <backup> --replace-current-data --journal-current <latest-journal.jsonl>. This replaces active data. Services stay stopped on failure.",
  );
const directory = resolve(process.argv[2]),
  manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
  key = await readKey(process.env.BACKUP_KEY_FILE ?? "secrets/backup.key");
verifyManifest(manifest, key);
if (
  manifest.version !== 2 ||
  !Number.isFinite(Date.parse(manifest.createdAt)) ||
  Date.now() - Date.parse(manifest.createdAt) > 30 * 86400000 ||
  !Array.isArray(manifest.files)
)
  throw new Error("Only authenticated backups less than 30 days old can be restored.");
for (const item of manifest.files) {
  if (
    !["database.psb", "media.psb", "journal.psb"].includes(item.name) ||
    (await checksum(join(directory, item.name))) !== item.sha256
  )
    throw new Error("Backup checksum mismatch.");
  await decrypt(join(directory, item.name), discard(), key);
}
if (
  !manifest.files.some((f) => f.name === "database.psb") ||
  !manifest.files.some((f) => f.name === "media.psb")
)
  throw new Error("Incomplete backup.");
const journalPath = process.argv[process.argv.indexOf("--journal-current") + 1];
let journal = "";
if (journalPath.endsWith(".psb"))
  await decrypt(
    journalPath,
    new Writable({
      write(chunk, _encoding, done) {
        journal += chunk.toString();
        done(journal.length > 16 * 1024 * 1024 ? new Error("Journal too large.") : undefined);
      },
    }),
    key,
  );
else journal = await readFile(journalPath, "utf8");
const run = (args, inputFile, inputText) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", ...args], {
      windowsHide: true,
      stdio: [inputFile || inputText !== undefined ? "pipe" : "ignore", "inherit", "inherit"],
    });
    const feeding = inputFile
      ? decrypt(inputFile, child.stdin, key).catch((e) => e)
      : Promise.resolve(child.stdin?.end(inputText));
    child.once("error", reject);
    child.once("close", async (code) => {
      try {
        const error = await feeding;
        if (error instanceof Error) throw error;
        if (code !== 0) throw new Error("Restore step failed; services remain stopped.");
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
await run(["stop", "api", "bot", "worker"]);
await run(
  [
    "run",
    "--rm",
    "-T",
    "--no-deps",
    "--entrypoint",
    "tar",
    "api",
    "-C",
    "/data",
    "-xzf",
    "-",
    "--no-same-owner",
    "--no-same-permissions",
  ],
  join(directory, "media.psb"),
);
await run(
  [
    "exec",
    "-T",
    "db",
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    "profile",
    "--clean",
    "--if-exists",
    "--single-transaction",
    "--no-owner",
    "--no-privileges",
    "--role",
    "profile_migrator",
  ],
  join(directory, "database.psb"),
);
await run(["run", "--rm", "-T", "migrate"]);
await run(["run", "--rm", "-T", "--no-deps", "api", "node", "dist/server/recovery.js"], undefined, journal);
await run(["up", "-d", "api", "bot", "worker"]);
console.log("Restored with current erasures/revocations reapplied. Every device must pair again.");
