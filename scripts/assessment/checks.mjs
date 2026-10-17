// Non-destructive baseline gates; detailed output is private and ignored by Git.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const directory = resolve("diagnostics/refactor-stage0");
await mkdir(directory, { recursive: true });
const checks = [
  ["typecheck", "node_modules/typescript/bin/tsc", "--noEmit"],
  ["vitest", "node_modules/vitest/vitest.mjs", "run"],
  [
    "node-tests",
    "--test",
    ...(await readdir("tests")).filter((n) => n.endsWith(".test.mjs")).map((n) => `tests/${n}`),
  ],
  ["server-build", "node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  ["preview-build", "node_modules/vite/bin/vite.js", "build"],
  ["plugin-typecheck", "scripts/plugin.mjs", "check"],
  [
    "format-baseline",
    "node_modules/prettier/bin/prettier.cjs",
    "--check",
    "packages",
    "tests",
    "scripts",
    "preview",
    "*.json",
    "*.md",
    "*.yml",
  ],
];
const results = [];
for (const [name, ...args] of checks) {
  const start = performance.now(),
    log = createWriteStream(resolve(directory, `${name}.log`));
  const exit = await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", reject);
    child.on("close", done);
  });
  await new Promise((done) => log.end(done));
  const result = { name, exit, durationMs: performance.now() - start };
  results.push(result);
  console.log(JSON.stringify(result));
  await writeFile(resolve(directory, "checks.json"), JSON.stringify(results, null, 2) + "\n");
}
if (results.some((r) => r.exit !== 0)) process.exitCode = 1;
