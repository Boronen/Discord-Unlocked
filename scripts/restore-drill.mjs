import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { readKey, decrypt, discard, verifyManifest } from "./backup-crypto.mjs";
import { drillDocker } from "./drill-process.mjs";
const directory = resolve(process.argv[2] ?? ""),
  key = await readKey(process.env.BACKUP_KEY_FILE ?? "secrets/backup.key");
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
verifyManifest(manifest, key);
if (manifest.version !== 2) throw new Error("An encrypted v2 backup is required.");
for (const file of manifest.files) await decrypt(join(directory, file.name), discard(), key);
const name = "ps-restore-drill-" + randomBytes(6).toString("hex");
const image = process.env.RESTORE_DRILL_IMAGE ?? "profile-studio:local";
if (!/^(?:profile-studio:local|sha256:[a-f0-9]{64})$/.test(image))
  throw new Error("Restore drill requires the local candidate tag or an immutable image ID.");
function docker(step, args, file, text) {
  if (!["database readiness", "cleanup"].includes(step)) console.log(`Restore drill: ${step}.`);
  return drillDocker(step, args, { file, text, key });
}
try {
  await docker("start isolated database", [
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--memory",
    "512m",
    "--pids-limit",
    "64",
    "--tmpfs",
    "/var/lib/postgresql/data:size=384m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=profile",
    "postgres:17-alpine",
  ]);
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      // The image's temporary initialization server accepts Unix sockets only.
      // Wait for TCP so pg_restore cannot race its shutdown.
      await docker("database readiness", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await setTimeout(500);
    }
  }
  if (!ready) throw new Error("Isolated recovery database did not start.");
  await docker(
    "restore encrypted database",
    ["exec", "-i", name, "pg_restore", "-U", "postgres", "-d", "profile", "--no-owner", "--no-privileges"],
    join(directory, "database.psb"),
  );
  // Rehearse forward migrations against the restored database before applying fences.
  await docker("rehearse candidate migrations", [
    "run",
    "--rm",
    "--network",
    `container:${name}`,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--memory",
    "384m",
    image,
    "node",
    "--input-type=module",
    "-e",
    "import {postgres,migrate} from './dist/server/db.js'; const c=postgres('postgresql://postgres@127.0.0.1:5432/profile');try{await migrate(c.db);}finally{await c.close();}",
  ]);
  const id = "999900000000000001",
    hash = createHash("sha256").update(id).digest("hex");
  await docker(
    "create synthetic recovery account",
    ["exec", "-i", name, "psql", "-U", "postgres", "-d", "profile", "-v", "ON_ERROR_STOP=1"],
    undefined,
    `INSERT INTO users(id,draft) VALUES('${id}','{}'); INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('synthetic-recovery-session','${id}',now()+interval '1 day');`,
  );
  await docker(
    "apply candidate recovery fences",
    [
      "run",
      "--rm",
      "-i",
      "--network",
      `container:${name}`,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--tmpfs",
      "/tmp:size=32m,mode=1777",
      "-e",
      "DATABASE_URL=postgresql://postgres@127.0.0.1:5432/profile",
      "-e",
      "SECURITY_JOURNAL=/tmp/recovery.jsonl",
      image,
      "node",
      "dist/server/recovery.js",
    ],
    undefined,
    JSON.stringify({ kind: "user", hash, at: new Date().toISOString() }) + "\n",
  );
  const result = await docker("verify account deletion and session invalidation", [
    "exec",
    name,
    "psql",
    "-U",
    "postgres",
    "-d",
    "profile",
    "-Atc",
    `SELECT (SELECT count(*) FROM sessions),deleted_at IS NOT NULL,published_revision IS NULL FROM users WHERE id='${id}'`,
  ]);
  if (result.trim() !== "0|t|t") throw new Error("Recovery resurrected access or a deleted account.");
  await docker(
    "restore encrypted media",
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--memory",
      "512m",
      "--tmpfs",
      "/restore:size=384m,mode=1777",
      "--entrypoint",
      "tar",
      image,
      "-C",
      "/restore",
      "-xzf",
      "-",
      "--no-same-owner",
      "--no-same-permissions",
    ],
    join(directory, "media.psb"),
  );
  console.log(
    "Isolated PostgreSQL + media restore passed; deleted-account fence and global session invalidation verified.",
  );
} finally {
  if (!/^ps-restore-drill-[0-9a-f]{12}$/.test(name)) throw new Error("Unsafe drill cleanup target.");
  await docker("cleanup", ["rm", "-f", name]).catch(() => {});
}
