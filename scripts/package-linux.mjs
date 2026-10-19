import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { zipSync, unzipSync } from "fflate";
import { scanProject, scanZip } from "./security-scan.mjs";
import { pluginSource } from "./plugin-source.mjs";

await scanProject();
const vendor = ".vendor/Vencord";
const pin = JSON.parse(await readFile("vencord-version.json", "utf8")).commit;
if (execFileSync("git", ["-C", vendor, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== pin)
  throw new Error("Unexpected Vencord revision.");
if (execFileSync("git", ["-C", vendor, "diff", "HEAD", "--name-only"], { encoding: "utf8" }).trim())
  throw new Error("Upstream sources differ from the pinned commit.");
const source = unzipSync(
  execFileSync("git", ["-C", vendor, "archive", "--format=zip", "HEAD"], { maxBuffer: 64 * 1024 * 1024 }),
);
for (const [path, bytes] of Object.entries(await pluginSource())) {
  const name = `src/userplugins/profileStudio/${path}`;
  if (!Buffer.from(bytes).equals(await readFile(join(vendor, name))))
    throw new Error("Plugin source and built checkout differ.");
  source[name] = bytes;
}
source["PROFILE-STUDIO-BUILD.md"] = new TextEncoder().encode(
  `# Corresponding Linux client source\n\nPinned Vencord: ${pin}\n\nProfileStudio is included under src/userplugins/profileStudio. Build with Node.js 24, Git and pnpm 11.9.0:\n\npnpm install --frozen-lockfile\nnode --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone --disable-updater\n\nFor an archive without Git metadata set VENCORD_HASH=${pin.slice(0, 7)}. Automatic upstream updating is disabled.\n`,
);
const files = { "Vencord-source.zip": zipSync(source, { level: 6 }) };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const base of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
  const bytes = await readFile(join(vendor, "dist", base));
  if (base.endsWith(".js") && !bytes.toString().includes("Updater Disabled: true"))
    throw new Error("Build with --disable-updater before packaging.");
  files[`dist/${base}`] = bytes;
  for (const suffix of [".map", ".LEGAL.txt"])
    try {
      files[`dist/${base}${suffix}`] = await readFile(join(vendor, "dist", base + suffix));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
}
if (!files["dist/renderer.js"].includes(Buffer.from("ProfileStudio")))
  throw new Error("ProfileStudio missing from build.");
for (const name of ["Install.sh", "Uninstall.sh", "Setup.py", "README.txt"])
  files[name] = Buffer.from((await readFile(`deploy/linux-client/${name}`, "utf8")).replaceAll("\r\n", "\n"));
files.LICENSE = await readFile("LICENSE");
files["gifenc-LICENSE.txt"] = await readFile("packages/plugin/third-party/gifenc-LICENSE.md");
const entries = Object.entries(files).map(([path, data]) => ({ path, sha256: hash(data) }));
const buildId = hash(JSON.stringify(entries)).slice(0, 16);
files["manifest.json"] = Buffer.from(
  JSON.stringify(
    {
      version: 1,
      platform: "linux-x64",
      status: "experimental-fedora-flatpak",
      buildId,
      vencordCommit: pin,
      builtAt: new Date().toISOString(),
      updaterDisabled: true,
      files: entries,
    },
    null,
    2,
  ) + "\n",
);
const archive = zipSync(
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`ProfileStudio-Linux/${path}`, bytes])),
  { level: 6 },
);
if (scanZip(files["Vencord-source.zip"]).length || scanZip(archive).length)
  throw new Error("Linux package scan failed.");
const restored = unzipSync(archive);
for (const [path, bytes] of Object.entries(files))
  if (!Buffer.from(restored[`ProfileStudio-Linux/${path}`] ?? []).equals(Buffer.from(bytes)))
    throw new Error("Archive round-trip mismatch.");
await mkdir("dist/linux", { recursive: true });
const name = `ProfileStudio-Linux-x64-${buildId}.zip`;
await writeFile("dist/linux/" + name, archive);
await writeFile("dist/linux/Linux-SHA256SUMS.txt", `${hash(archive)}  ${name}\n`);
console.log(
  JSON.stringify({ name, buildId, bytes: archive.length, sha256: hash(archive), experimental: true }),
);
