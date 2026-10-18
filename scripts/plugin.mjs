import { mkdir, access, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pluginSource } from "./plugin-source.mjs";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = resolve(process.env.VENCORD_PATH ?? join(root, ".vendor", "Vencord"));
const pin = "32c90633ce6a95d7e56c95479efbb431bacf1eac";
function command(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: target, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Command failed (${code}).`))));
  });
}
await access(join(target, "src", "webpack"));
const actual = (
  await promisify(execFile)("git", ["-C", target, "rev-parse", "HEAD"], { windowsHide: true })
).stdout.trim();
if (actual !== pin)
  throw new Error(`Unsupported Vencord version: ${actual}. Check out ${pin} before building.`);
await mkdir(join(target, "src", "userplugins", "profileStudio"), { recursive: true });
for (const [path, bytes] of Object.entries(await pluginSource(root))) {
  const destination = join(target, "src", "userplugins", "profileStudio", path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
console.log(`ProfileStudio synchronized: ${target}`);
const mode = process.argv[2] ?? "sync";
if (mode === "check")
  await command(process.execPath, [join(target, "node_modules", "typescript", "bin", "tsc"), "--noEmit"]);
else if (mode === "build")
  await command(process.execPath, [
    "--require=./scripts/suppressExperimentalWarnings.js",
    "scripts/build/build.mjs",
    "--standalone",
  ]);
else if (mode !== "sync") throw new Error("Usage: node scripts/plugin.mjs sync|check|build");
