// Participant-only release: never walk the server tree or operator configuration.
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { scanZip } from "./security-scan.mjs";
import { pluginSource } from "./plugin-source.mjs";

const files = {};
for (const [path, bytes] of Object.entries(await pluginSource())) files[`profileStudio/${path}`] = bytes;
files["LICENSE"] = new Uint8Array(await readFile("LICENSE"));
files["INSTALL-WINDOWS.md"] = new Uint8Array(await readFile("docs/INSTALL-WINDOWS.md"));

// Compare packaged content with local operator credentials without logging them.
const known = [];
for (const name of await readdir("secrets").catch(() => [])) {
  if (!/\.(?:env|key)$/.test(name)) continue;
  const text = await readFile(join("secrets", name), "utf8");
  if (name.endsWith(".key")) known.push(text.trim());
  else
    for (const line of text.split(/\r?\n/)) {
      if (/^[A-Z_]*(?:TOKEN|PASSWORD|SECRET|PRIVATE_KEY)=/.test(line))
        known.push(line.slice(line.indexOf("=") + 1).trim());
    }
}
const archive = zipSync(files, { level: 6 });
if (
  scanZip(
    archive,
    known.filter((value) => value.length >= 16),
  ).length
)
  throw new Error("Client archive security scan failed; no new archive written.");
const unpacked = unzipSync(archive);
for (const [name, data] of Object.entries(files)) {
  if (!Buffer.from(data).equals(Buffer.from(unpacked[name] ?? [])))
    throw new Error("Client archive round-trip failed.");
}
await mkdir("dist/client", { recursive: true });
await writeFile("dist/client/profile-studio-userplugin.zip", archive);
await writeFile(
  "dist/client/SHA256SUMS.txt",
  `${createHash("sha256").update(archive).digest("hex")}  profile-studio-userplugin.zip\n`,
);
console.log(
  `Participant ZIP created and scanned: dist/client/profile-studio-userplugin.zip (${Object.keys(files).length} files).`,
);
