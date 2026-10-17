import { spawn } from "node:child_process";
import { decrypt } from "./backup-crypto.mjs";

// Docker/SQL stderr may contain restored user data. Emit only known diagnostic
// categories and machine error codes, never the command, query or raw stderr.
export function drillFailure(step, code, signal, stderr, inputFailed = false) {
  const hints = [];
  const sql = stderr.match(/\bcode:\s*['"]([0-9A-Z]{5})['"]/);
  const node = stderr.match(/\b(?:ERR_[A-Z_]+|EACCES|EPERM|ENOSPC|EROFS|ENOMEM|ECONNREFUSED)\b/);
  if (sql) hints.push(`SQLSTATE ${sql[1]}`);
  if (node) hints.push(node[0]);
  if (/no space left on device/i.test(stderr)) hints.push("temporary filesystem is full");
  if (/permission denied|operation not permitted/i.test(stderr)) hints.push("permission denied");
  if (/read-only file system/i.test(stderr)) hints.push("read-only filesystem");
  if (/cannot connect to the docker daemon|error during connect/i.test(stderr))
    hints.push("Docker daemon unavailable");
  if (/unable to find image|no such image|pull access denied/i.test(stderr))
    hints.push("required local image unavailable");
  if (/is already in use by container/i.test(stderr)) hints.push("container name conflict");
  if (/out of memory|cannot allocate memory/i.test(stderr)) hints.push("memory allocation failed");
  if (code === 137) hints.push("process was killed; check container memory limits");
  if (inputFailed) hints.push("backup/input stream did not finish");
  return new Error(
    `Restore drill failed at "${step}" (exit ${code ?? "unavailable"}${signal ? `, signal ${signal}` : ""})${hints.length ? `: ${[...new Set(hints)].join("; ")}` : "."}`,
  );
}

export function drillDocker(step, args, { file, text, key } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: [file || text !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let output = "",
      stderr = "";
    child.stdout.on("data", (v) => (output = (output + v).slice(-128 * 1024)));
    child.stderr.on("data", (v) => (stderr = (stderr + v).slice(-128 * 1024)));
    // A failed docker run may close stdin before the encrypted stream ends.
    // Always consume that rejection; report the Docker stage as the primary failure.
    const feed = file
      ? decrypt(file, child.stdin, key).catch(() => true)
      : child.stdin
        ? new Promise((done) => {
            child.stdin.once("error", () => done(true));
            child.stdin.end(text, () => done(false));
          })
        : Promise.resolve(false);
    child.once("error", (error) => reject(drillFailure(step, null, null, error.code ?? "")));
    child.once("close", async (code, signal) => {
      const inputFailed = await feed;
      if (inputFailed || code !== 0) reject(drillFailure(step, code, signal, stderr, !!inputFailed));
      else resolve(output);
    });
  });
}
