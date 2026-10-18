import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { zipSync, unzipSync } from "fflate";
import { scanZip } from "./security-scan.mjs";
import { pluginSource } from "./plugin-source.mjs";

const vendor = ".vendor/Vencord";
const pin = JSON.parse(await readFile("vencord-version.json", "utf8")).commit;
const actual = execFileSync("git", ["-C", vendor, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (actual !== pin) throw new Error("Unexpected Vencord revision.");
if (execFileSync("git", ["-C", vendor, "diff", "HEAD", "--name-only"], { encoding: "utf8" }).trim())
  throw new Error("Upstream sources differ from the recorded commit.");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const known = [];
for (const name of await readdir("secrets").catch(() => [])) {
  if (!/\.(?:env|key)$/.test(name)) continue;
  const content = await readFile(join("secrets", name), "utf8");
  if (name.endsWith(".key")) known.push(content.trim());
  else
    for (const line of content.split(/\r?\n/))
      if (/^[A-Z_]*(?:TOKEN|PASSWORD|SECRET|PRIVATE_KEY)=/.test(line))
        known.push(line.slice(line.indexOf("=") + 1).trim());
}
const source = unzipSync(
  execFileSync("git", ["-C", vendor, "archive", "--format=zip", "HEAD"], { maxBuffer: 64 * 1024 * 1024 }),
);
const plugin = {};
for (const [path, bytes] of Object.entries(await pluginSource()))
  plugin[`src/userplugins/profileStudio/${path}`] = bytes;
for (const [name, data] of Object.entries(plugin)) {
  const vendored = await readFile(join(vendor, name));
  if (!Buffer.from(data).equals(vendored)) throw new Error("Plugin source and built checkout differ.");
  source[name] = data;
}
source["PROFILE-STUDIO-BUILD.md"] = new TextEncoder().encode(
  `# Corresponding source\n\nVencord commit: ${pin}\n\nProfileStudio is included under src/userplugins/profileStudio.\nInstall Node.js 24, Git and pnpm 11.9.0, then run:\n\npnpm install --frozen-lockfile\nnode --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone --disable-updater\n\nFor an archive without Git metadata, set VENCORD_HASH=${pin.slice(0, 7)} in the build environment.\nThis operator-created build disables automatic upstream updates.\n`,
);
const corresponding = zipSync(source, { level: 6 });
function checked(archive) {
  const findings = scanZip(
    archive,
    known.filter((value) => value.length >= 16),
  );
  if (findings.length) {
    // Print rule and source path only; never print matching secret material.
    console.error(findings);
    throw new Error("Windows package security scan failed.");
  }
}
checked(corresponding);
const files = {};
for (const base of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
  const content = await readFile(join(vendor, "dist", base));
  if (base.endsWith(".js") && !content.toString().includes("Updater Disabled: true"))
    throw new Error("Build with --disable-updater before packaging.");
  files[`dist/${base}`] = new Uint8Array(content);
  for (const suffix of [".map", ".LEGAL.txt"]) {
    try {
      files[`dist/${base}${suffix}`] = new Uint8Array(await readFile(join(vendor, "dist", base + suffix)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
if (!Buffer.from(files["dist/renderer.js"]).includes(Buffer.from("ProfileStudio")))
  throw new Error("ProfileStudio missing from renderer.");
files["Vencord-source.zip"] = corresponding;
files["LICENSE"] = new Uint8Array(await readFile("LICENSE"));
files["gifenc-LICENSE.txt"] = new Uint8Array(await readFile("packages/plugin/third-party/gifenc-LICENSE.md"));
for (const name of ["Install.cmd", "Uninstall.cmd", "Setup.ps1", "README.txt"]) {
  const content = await readFile(`deploy/windows-client/${name}`, "utf8");
  files[name] = new TextEncoder().encode(content.replace(/\r?\n/g, "\r\n"));
}
const entries = Object.entries(files).map(([path, data]) => ({ path, sha256: hash(data) }));
const buildId = hash(JSON.stringify(entries)).slice(0, 16);
files["manifest.json"] = new TextEncoder().encode(
  JSON.stringify(
    {
      version: 1,
      buildId,
      vencordCommit: pin,
      builtAt: new Date().toISOString(),
      updaterDisabled: true,
      files: entries.filter((entry) => !/\.(?:cmd|ps1)$/.test(entry.path)),
    },
    null,
    2,
  ),
);
const archive = zipSync(
  Object.fromEntries(Object.entries(files).map(([path, data]) => [`ProfileStudio-Windows/${path}`, data])),
  { level: 6 },
);
checked(archive);
const extracted = unzipSync(archive);
for (const [path, data] of Object.entries(files))
  if (!Buffer.from(extracted[`ProfileStudio-Windows/${path}`] ?? []).equals(Buffer.from(data)))
    throw new Error("Archive round-trip mismatch.");
await mkdir("dist/windows", { recursive: true });
await writeFile("dist/windows/ProfileStudio-Windows.zip", archive);
await writeFile("dist/windows/SHA256SUMS.txt", `${hash(archive)}  ProfileStudio-Windows.zip\n`);
console.log(`Windows package built and scanned: ${archive.length} bytes, build ${buildId}.`);
