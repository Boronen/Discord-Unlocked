import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { verifyOffsite } from "./offsite.mjs";
const problems = [];
try {
  if (!(await fetch("http://127.0.0.1:3100/health", { signal: AbortSignal.timeout(5000) })).ok)
    problems.push("API health");
} catch {
  problems.push("API unavailable");
}
try {
  const probe = `import pg from 'pg';import{statfs}from'node:fs/promises';const db=new pg.Pool({connectionString:process.env.DATABASE_URL});const [v]=(await db.query("SELECT EXISTS(SELECT 1 FROM media WHERE status='processing' AND created_at<now()-interval '5 minutes') AS stuck,EXISTS(SELECT 1 FROM users WHERE deleted_at<now()-interval '1 hour') AS erasure,EXISTS(SELECT 1 FROM file_deletions WHERE created_at<now()-interval '1 hour') AS files,EXISTS(SELECT 1 FROM moderation_messages WHERE erase=true AND created_at<now()-interval '1 hour') AS messages")).rows;const disks=[];for(const area of ['quarantine','staging','processed']){const s=await statfs('/data/media/'+area);if(s.bavail/s.blocks<0.15)disks.push(area);}console.log(JSON.stringify({...v,disks}));await db.end();`;
  const data = JSON.parse(
    execFileSync("docker", ["compose", "exec", "-T", "api", "node", "--input-type=module", "-e", probe], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  for (const key of ["stuck", "erasure", "files", "messages"]) if (data[key]) problems.push(key + " backlog");
  if (data.disks.length) problems.push("low media storage");
} catch {
  problems.push("database/storage probe unavailable");
}
let recent = false;
for (const name of await readdir("backups").catch(() => [])) {
  const manifest = JSON.parse(
    await readFile(join("backups", name, "manifest.json"), "utf8").catch(() => "null"),
  );
  if (manifest?.version === 2 && Date.parse(manifest.createdAt) > Date.now() - 26 * 3600000) recent = true;
}
if (!recent) problems.push("backup older than 26 hours");
if (process.env.DRIVE_CONFIG_FILE) {
  try {
    execFileSync(process.execPath, ["scripts/drive-backup.mjs", "status"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 240000,
    });
  } catch {
    problems.push("Drive destination, capacity, snapshot or current journal verification failed");
  }
} else if (!process.env.OFFSITE_BACKUP_DIR) problems.push("offsite destination not configured");
else {
  try {
    await verifyOffsite();
  } catch {
    problems.push("verified offsite mount unavailable");
  }
  const journal = await stat(join(process.env.OFFSITE_BACKUP_DIR, "latest-journal.psb")).catch(() => null);
  if (!journal || journal.mtimeMs < Date.now() - 5 * 60_000)
    problems.push("current journal replication overdue");
}
if (problems.length) {
  console.error("Profile Studio operator attention required: " + problems.join(", "));
  process.exitCode = 1;
} else console.log("Profile Studio health, storage, erasure and backup probes passed.");
