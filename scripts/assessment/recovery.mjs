// Verify the private source snapshot without touching the current worktree.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { unzipSync } from "fflate";
import { forbidden, scanZip } from "../security-scan.mjs";
const directory = resolve("diagnostics/refactor-stage0");
await mkdir(directory, { recursive: true });
const bundle = join(directory, "source-baseline.bundle"),
  zip = join(directory, "source-baseline-lf.zip");
execFileSync("git", ["bundle", "verify", bundle], { stdio: "pipe" });
const target = await mkdtemp(join(directory, "restore-check-"));
execFileSync("git", ["clone", "--no-checkout", bundle, target], { stdio: "pipe" });
const commit = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (commit !== "377b4a2e6fade416572c72cf0ace8608d3402c39") throw new Error("Unexpected baseline commit");
const bytes = await readFile(zip),
  files = unzipSync(bytes);
if (scanZip(bytes).length || Object.keys(files).some(forbidden))
  throw new Error("Source snapshot path/secret check failed");
const tracked = execFileSync("git", ["-C", target, "ls-tree", "-rz", "--name-only", "HEAD"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
if (tracked.length !== Object.keys(files).filter((p) => !p.endsWith("/")).length)
  throw new Error("Snapshot file count differs");
for (const path of tracked) {
  const expected = execFileSync("git", ["-C", target, "show", `HEAD:${path}`], {
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!expected.equals(Buffer.from(files[path] ?? [])))
    throw new Error(
      `Snapshot differs from baseline tree: ${path} (${expected.length}/${files[path]?.length ?? 0} bytes)`,
    );
}
const hashes = {};
for (const [name, path] of Object.entries({ bundle, zip }))
  hashes[name] = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const result = {
  at: new Date().toISOString(),
  baselineCommit: commit,
  files: tracked.length,
  hashes,
  verifiedClone: target,
  notes: [
    "Only the source baseline HEAD was bundled; no private recovery refs or operator data.",
    "git clone <absolute bundle path> <new directory> restores the baseline; install locked dependencies and the pinned Vencord checkout separately.",
    "This source recovery check is not a database/media/offsite restore drill.",
  ],
};
await writeFile(join(directory, "baseline-manifest.json"), JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify({ baselineCommit: commit, files: tracked.length, hashes, verified: true }, null, 2),
);
