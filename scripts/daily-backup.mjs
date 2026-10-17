import { spawn } from "node:child_process";
import { cp, readdir, readFile, rm, mkdir } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { checksum } from "./backup-crypto.mjs";
import { verifyOffsite } from "./offsite.mjs";
const root = resolve("backups"),
  offsite = await verifyOffsite();
if (!offsite || offsite === root || offsite.startsWith(root + sep))
  throw new Error(
    "Set OFFSITE_BACKUP_DIR to an independently mounted private destination. No cloud plan is upgraded automatically.",
  );
const name = new Date().toISOString().replaceAll(":", "-"),
  directory = join(root, name);
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/backup-secure.mjs", directory], {
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("error", reject);
  child.once("close", (code) => (code === 0 ? resolve() : reject(new Error("Daily backup failed."))));
});
await mkdir(offsite, { recursive: true, mode: 0o700 });
const target = join(offsite, name);
await cp(directory, target, { recursive: true, errorOnExist: true, force: false });
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
for (const file of manifest.files)
  if ((await checksum(join(target, file.name))) !== file.sha256)
    throw new Error("Offsite verification failed. Old backups were retained.");
for (const base of [root, offsite])
  for (const candidate of await readdir(base)) {
    if (!/^\d{4}-\d{2}-\d{2}T[0-9.-]+Z$/.test(candidate)) continue;
    const path = resolve(base, candidate);
    if (!path.startsWith(base + sep)) throw new Error("Unsafe backup rotation path.");
    const old = JSON.parse(await readFile(join(path, "manifest.json"), "utf8").catch(() => "null"));
    if (old?.version === 2 && Date.parse(old.createdAt) < Date.now() - 30 * 86400000)
      await rm(path, { recursive: true });
  }
console.log("Daily encrypted backup copied, verified and rotated. Store its key separately.");
