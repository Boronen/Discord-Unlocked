import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { encrypt, readKey, sealManifest } from "./backup-crypto.mjs";
const directory = resolve(
  process.argv.find((v, i) => i > 1 && !v.startsWith("--")) ??
    join("backups", new Date().toISOString().replaceAll(":", "-")),
);
const key = await readKey(process.env.BACKUP_KEY_FILE ?? "secrets/backup.key");
const legacy = process.argv.includes("--legacy");
await mkdir(directory, { recursive: true, mode: 0o700 });
function docker(args, archive) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      failure = "";
    child.stderr.on("data", (v) => {
      failure += v;
    });
    const encrypted = archive
      ? encrypt(child.stdout, join(directory, archive), key).catch((error) => error)
      : null;
    if (!archive)
      child.stdout.on("data", (v) => {
        output += v;
      });
    child.once("error", reject);
    child.once("close", async (code) => {
      try {
        const digest = await encrypted;
        if (digest instanceof Error) throw digest;
        if (code !== 0)
          throw new Error(`Docker backup step failed (${code}); no complete backup was created.`);
        resolve(archive ? digest : output);
      } catch (error) {
        reject(error);
      }
    });
  });
}
const running = (await docker(["ps", "--status", "running", "--services"]))
  .trim()
  .split(/\r?\n/)
  .filter((name) => ["api", "bot", "worker"].includes(name));
try {
  if (running.length) await docker(["stop", ...running]);
  const files = [];
  const capture = async (name, args) => files.push({ name, sha256: await docker(args, name) });
  await capture("database.psb", [
    "exec",
    "-T",
    "db",
    "pg_dump",
    "-U",
    legacy ? "profile" : "postgres",
    "-d",
    "profile",
    "-Fc",
  ]);
  await capture("media.psb", [
    "run",
    "--rm",
    "-T",
    "--no-deps",
    "--entrypoint",
    "tar",
    "api",
    "--exclude=media/quarantine/lost+found",
    "--exclude=media/processed/lost+found",
    "-C",
    "/data",
    "-czf",
    "-",
    "media/quarantine",
    "media/processed",
  ]);
  if (!legacy)
    await capture("journal.psb", [
      "run",
      "--rm",
      "-T",
      "--no-deps",
      "--entrypoint",
      "cat",
      "api",
      "/data/security/events.jsonl",
    ]);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(
      sealManifest({ version: 2, legacy, createdAt: new Date().toISOString(), files }, key),
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(`Encrypted, consistent backup created: ${directory}`);
} catch (error) {
  await rm(join(directory, "manifest.json"), { force: true });
  throw error;
} finally {
  if (running.length) await docker(["start", ...running]);
}
