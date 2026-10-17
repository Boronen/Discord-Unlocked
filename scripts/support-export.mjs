import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
if (!/^\d{17,20}$/.test(process.argv[2] ?? "") || !process.argv.includes("--identity-verified"))
  throw new Error(
    "Verify the same Discord identity privately first, then run support-export.mjs <id> --identity-verified.",
  );
await mkdir("exports", { recursive: true, mode: 0o700 });
const destination = `exports/account-${Date.now()}.zip`;
const child = spawn(
  "docker",
  [
    "compose",
    "run",
    "--rm",
    "-T",
    "--no-deps",
    "api",
    "node",
    "dist/server/privacy-admin.js",
    "export",
    process.argv[2],
    "--identity-verified",
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] },
);
const completed = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) =>
    code === 0 ? resolve() : reject(new Error("Support export failed. Delete the incomplete local archive.")),
  );
});
await Promise.all([
  pipeline(child.stdout, createWriteStream(destination, { flags: "wx", mode: 0o600 })),
  completed,
]);
console.log(`Private account export: ${destination}. Transfer securely, then remove this copy.`);
