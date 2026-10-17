// Host-side operator CLI. Never run this in an application/decoder container.
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  lstat,
  statfs,
  mkdtemp,
  rename,
  rm,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  checksum,
  decrypt,
  discard,
  encrypt,
  readKey,
  sealManifest,
  verifyManifest,
} from "./backup-crypto.mjs";
import {
  SNAPSHOT_FILES,
  SNAPSHOT_NAME,
  GiB,
  JOURNAL_LIMIT,
  snapshotManifest,
  assertSnapshotFiles,
  enforceCapacity,
  verifiedJournal,
  expiredSnapshot,
} from "./drive-backup-lib.mjs";

const mode = process.argv[2];
if (!["init", "daily", "journal", "status", "fetch-journal"].includes(mode))
  throw new Error(
    "Usage: node scripts/drive-backup.mjs init|daily|journal|status|fetch-journal [new-destination.psb]",
  );
if (process.platform !== "linux") throw new Error("Run Drive automation on the isolated Linux host.");
if (process.env.DRIVE_OAUTH_PRODUCTION !== "true")
  throw new Error("Confirm Google OAuth In production and reauthorize before automation.");
const root = process.env.DRIVE_BACKUP_ROOT;
const config = resolve(process.env.DRIVE_CONFIG_FILE ?? "secrets/rclone.conf");
const id = process.env.OFFSITE_BACKUP_ID;
const budget = Number(process.env.DRIVE_BUDGET_BYTES ?? 12 * GiB);
if (
  !root ||
  !/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(root) ||
  !id ||
  !/^[a-f0-9-]{36}$/i.test(id) ||
  !Number.isSafeInteger(budget) ||
  budget <= 0 ||
  budget > 12 * GiB
)
  throw new Error("Configure a dedicated Drive folder, destination UUID and a budget no larger than 12 GiB.");
const key = await readKey(process.env.BACKUP_KEY_FILE ?? "secrets/backup.key");
const backups = resolve("backups");
await mkdir(backups, { recursive: true, mode: 0o700 });
const stateFile = join(backups, ".drive-status.json");

function run(binary, args, { env, outputLimit = 1024 ** 2 } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"], env: env ?? process.env });
    let text = "",
      overflow = false;
    child.stdout.on("data", (part) => {
      text += part.toString();
      if (Buffer.byteLength(text) > outputLimit) {
        overflow = true;
        child.kill();
      }
    });
    child.once("error", () => reject(new Error(`${binary} could not start.`)));
    child.once("close", (code) =>
      code === 0 && !overflow
        ? accept(text)
        : reject(
            new Error(
              `${binary} ${args[0] ?? "operation"} failed; credentials and raw provider errors were withheld.`,
            ),
          ),
    );
  });
}
const rc = (...args) =>
  run("rclone", [
    "--config",
    config,
    "--retries",
    "2",
    "--low-level-retries",
    "2",
    "--contimeout",
    "15s",
    "--timeout",
    "60s",
    "--transfers",
    "1",
    "--checkers",
    "1",
    "--buffer-size",
    "8M",
    ...args,
  ]);
const json = async (...args) => JSON.parse(await rc(...args));
const localJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const cloudJson = (path) => json("cat", `${root}/${path}`);
async function note(patch) {
  const old = await localJson(stateFile).catch(() => ({}));
  const tmp = stateFile + ".tmp";
  await writeFile(tmp, JSON.stringify({ ...old, ...patch }), { mode: 0o600 });
  await rename(tmp, stateFile);
}
async function remoteIdentity() {
  const marker = verifyManifest(await cloudJson("destination.json"), key);
  if (marker.kind !== "profile-studio-drive-destination" || marker.id !== id)
    throw new Error("Drive destination identity mismatch; no fallback destination is allowed.");
}
async function capacity(incoming, snapshot = false) {
  const account = await json("about", `${root.split(":")[0]}:`, "--json");
  const usage = await json("size", root, "--json");
  enforceCapacity({ used: usage.bytes, free: account.free, budget, incoming, snapshot });
}
async function verifyUpload(local, remote) {
  await rc("copy", local, remote);
  await rc("check", local, remote, "--download", "--one-way");
}

// Serializes snapshots, journal capture, status and rotation, including manual invocations.
if (process.env.PROFILE_STUDIO_DRIVE_LOCKED !== "1") {
  const child = spawn(
    "flock",
    ["-w", "180", join(backups, ".drive-job.lock"), process.execPath, ...process.argv.slice(1)],
    {
      env: { ...process.env, PROFILE_STUDIO_DRIVE_LOCKED: "1" },
      stdio: "inherit",
    },
  );
  child.once("error", () => {
    console.error("Could not acquire the backup job lock.");
    process.exitCode = 1;
  });
  await new Promise((done) =>
    child.once("close", (code) => {
      process.exitCode = code ?? 1;
      done();
    }),
  );
} else {
  const scratch = await mkdtemp(join(backups, ".drive-work-"));
  try {
    if (mode === "init") {
      const files = await json("lsjson", root, "--files-only", "--max-depth", "1");
      if (!files.some((f) => f.Name === "destination.json")) {
        const path = join(scratch, "destination.json");
        await writeFile(
          path,
          JSON.stringify(
            sealManifest(
              { kind: "profile-studio-drive-destination", id, createdAt: new Date().toISOString() },
              key,
            ),
          ),
          { mode: 0o600 },
        );
        await rc("copyto", path, `${root}/destination.json`, "--immutable");
      }
      await remoteIdentity();
      await capacity(0);
      console.log("Drive destination identity and capacity verified. No schedules were enabled.");
    } else {
      await remoteIdentity();
      if (mode === "daily") {
        // Rotate only dated snapshots with an authenticated, complete, expected archive set.
        const entries = await json("lsjson", root, "--dirs-only", "--max-depth", "1");
        if (entries.length > 200)
          throw new Error("Unexpected number of backup directories; inspect storage manually.");
        for (const entry of entries) {
          if (!SNAPSHOT_NAME.test(entry.Name)) continue;
          let manifest;
          try {
            manifest = snapshotManifest(await cloudJson(`${entry.Name}/manifest.json`), key);
          } catch {
            continue;
          }
          if (!expiredSnapshot(entry.Name, manifest)) continue;
          const files = await json("lsjson", `${root}/${entry.Name}`, "--max-depth", "1");
          try {
            assertSnapshotFiles(files.map((f) => f.Name));
            if (files.some((f) => f.IsDir)) continue;
          } catch {
            continue;
          }
          // Exact file deletion only. Never purge an unknown folder or follow a supplied archive path.
          for (const file of SNAPSHOT_FILES)
            await rc("deletefile", `${root}/${entry.Name}/${file}`, "--drive-use-trash=false");
          await rc("rmdir", `${root}/${entry.Name}`);
        }
        for (const name of await readdir(backups)) {
          if (!SNAPSHOT_NAME.test(name)) continue;
          const dir = join(backups, name);
          if (!(await lstat(dir)).isDirectory()) continue;
          let manifest;
          try {
            manifest = snapshotManifest(await localJson(join(dir, "manifest.json")), key);
            assertSnapshotFiles(await readdir(dir));
          } catch {
            continue;
          }
          if (!expiredSnapshot(name, manifest)) continue;
          for (const file of SNAPSHOT_FILES) {
            const value = await lstat(join(dir, file));
            if (!value.isFile()) throw new Error("Unexpected local snapshot entry.");
          }
          await rm(dir, { recursive: true });
        }
        await capacity(400 * 1024 ** 2, true);
        const disk = await statfs(backups);
        if (disk.bavail * disk.bsize < 10 * GiB)
          throw new Error(
            "Less than 10 GiB local scratch space; pause uploads/onboarding and inspect storage.",
          );
        const name = new Date().toISOString().replaceAll(":", "-");
        const dir = join(backups, name);
        await run(process.execPath, ["scripts/backup-secure.mjs", dir]);
        const manifest = snapshotManifest(await localJson(join(dir, "manifest.json")), key);
        assertSnapshotFiles(await readdir(dir));
        for (const file of manifest.files)
          if ((await checksum(join(dir, file.name))) !== file.sha256)
            throw new Error("Snapshot archive integrity check failed before upload.");
        let bytes = 0;
        for (const file of SNAPSHOT_FILES) bytes += (await stat(join(dir, file))).size;
        await capacity(bytes, true);
        await verifyUpload(dir, `${root}/${name}`);
        await note({
          dailyAt: new Date().toISOString(),
          dailyName: name,
          dailyBytes: bytes,
          dailyManifest: manifest.createdAt,
        });
        console.log(`Daily encrypted Drive snapshot uploaded and read-back verified (${bytes} bytes).`);
      } else if (mode === "journal") {
        // Two independently authenticated slots preserve the preceding copy during upload failure.
        const state = await localJson(stateFile).catch(() => ({}));
        const slot = state.journalSlot === 0 ? 1 : 0;
        const file = `slot${slot}.psb`,
          meta = `slot${slot}.json`;
        const path = join(scratch, file);
        const child = spawn(
          "docker",
          ["compose", "exec", "-T", "api", "cat", "/data/security/events.jsonl"],
          { stdio: ["ignore", "pipe", "ignore"] },
        );
        const completed = new Promise((accept, reject) => {
          child.once("error", () => reject(new Error("Journal capture could not start.")));
          child.once("close", (code) =>
            code === 0 ? accept() : reject(new Error("Journal capture failed.")),
          );
        });
        let bytes = 0;
        const bound = new Transform({
          transform(part, _encoding, done) {
            bytes += part.length;
            done(bytes > JOURNAL_LIMIT ? new Error("Journal exceeds the recovery budget.") : null, part);
          },
        });
        try {
          await Promise.all([pipeline(child.stdout, bound), encrypt(bound, path, key), completed]);
        } finally {
          if (child.exitCode === null) child.kill();
        }
        const encryptedBytes = (await stat(path)).size;
        await capacity(encryptedBytes + 4096);
        await rc("mkdir", `${root}/journals`);
        await rc("copyto", path, `${root}/journals/${file}`);
        await rc("check", scratch, `${root}/journals`, "--download", "--one-way");
        const metadata = sealManifest(
          {
            kind: "profile-studio-journal",
            destinationId: id,
            slot,
            createdAt: new Date().toISOString(),
            sha256: await checksum(path),
            bytes: encryptedBytes,
          },
          key,
        );
        await writeFile(join(scratch, meta), JSON.stringify(metadata), { mode: 0o600 });
        await rc("copyto", join(scratch, meta), `${root}/journals/${meta}`);
        await rc("check", scratch, `${root}/journals`, "--download", "--one-way");
        await note({ journalAt: metadata.createdAt, journalSlot: slot, journalSha256: metadata.sha256 });
        console.log("Current encrypted recovery journal replicated and read-back verified.");
      } else if (mode === "status") {
        const state = await localJson(stateFile);
        if (
          !SNAPSHOT_NAME.test(state.dailyName ?? "") ||
          Date.parse(state.dailyAt) < Date.now() - 26 * 3600000 ||
          !Number.isFinite(Date.parse(state.dailyAt)) ||
          Date.parse(state.dailyAt) > Date.now() + 60000
        )
          throw new Error("Verified daily snapshot is overdue.");
        if (![0, 1].includes(state.journalSlot)) throw new Error("No verified recovery journal.");
        const daily = snapshotManifest(await cloudJson(`${state.dailyName}/manifest.json`), key);
        if (
          daily.createdAt !== state.dailyManifest ||
          Date.parse(daily.createdAt) < Date.now() - 26 * 3600000
        )
          throw new Error("Remote daily snapshot is overdue or does not match the verified copy.");
        const journal = verifiedJournal(
          await cloudJson(`journals/slot${state.journalSlot}.json`),
          key,
          id,
          state.journalSlot,
        );
        if (journal.sha256 !== state.journalSha256 || Date.parse(journal.createdAt) < Date.now() - 5 * 60000)
          throw new Error("Verified recovery journal replication is overdue.");
        await capacity(400 * 1024 ** 2, true);
        console.log("Drive snapshot, current journal, destination and capacity checks passed.");
      } else if (mode === "fetch-journal") {
        const destination = process.argv[3];
        if (!destination) throw new Error("Specify a new private .psb destination.");
        const candidates = [];
        for (const slot of [0, 1]) {
          try {
            const metadata = verifiedJournal(await cloudJson(`journals/slot${slot}.json`), key, id, slot);
            const path = join(scratch, `slot${slot}.psb`);
            await rc("copyto", `${root}/journals/slot${slot}.psb`, path);
            if ((await checksum(path)) !== metadata.sha256 || (await stat(path)).size !== metadata.bytes)
              continue;
            await decrypt(path, discard(), key);
            candidates.push({ path, metadata });
          } catch {
            /* The other slot remains usable after an interrupted upload. */
          }
        }
        candidates.sort((a, b) => Date.parse(b.metadata.createdAt) - Date.parse(a.metadata.createdAt));
        if (!candidates.length)
          throw new Error(
            "No authentic recovery journal is available. Restore/public access must remain closed.",
          );
        if (Date.parse(candidates[0].metadata.createdAt) < Date.now() - 5 * 60000)
          throw new Error(
            "The latest journal is over five minutes old. Reconcile later erasures/revocations before recovery.",
          );
        await copyFile(candidates[0].path, resolve(destination), constants.COPYFILE_EXCL);
        console.log("Current independently retained journal authenticated and downloaded.");
      }
    }
  } finally {
    // Only the unique private work directory allocated by this invocation is removed.
    await rm(scratch, { recursive: true, force: true });
  }
}
