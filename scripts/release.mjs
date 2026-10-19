import { readdir, readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { scanProject, scanZip, forbidden } from "./security-scan.mjs";
import { pluginSource } from "./plugin-source.mjs";
await scanProject();
const root = resolve("."),
  output = join(root, "dist", "release");
await mkdir(output, { recursive: true });
const paths = [
  "packages",
  "migrations",
  "scripts",
  "deploy",
  "preview",
  "docs",
  "docs-site",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "vite.config.ts",
  "vencord-version.json",
  "premium-ui.json",
  ".env.example",
  ".gitignore",
  ".dockerignore",
  ".prettierrc.json",
  ".prettierignore",
  ".oxlintrc.json",
  "Dockerfile",
  "compose.yml",
  "README.md",
  "DESIGN.md",
  "UX-CONTRACT.md",
  "LICENSE",
  "SECURITY.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  ".github",
  "tests",
];
const files = {};
async function add(path, prefix = "") {
  // This is a separate public website checkout, not application source.
  if (relative(root, path).replaceAll("\\", "/") === "docs/backup-oauth-site") return;
  const publicPath = relative(root, path).replaceAll("\\", "/");
  if (publicPath.split("/").includes("__pycache__") || /\.py[co]$/.test(publicPath)) return;
  if (
    publicPath === "docs-site/node_modules" ||
    /^(?:docs|docs-site)\/\.vitepress\/(?:cache|dist|\.temp)(?:\/|$)/.test(publicPath)
  )
    return;
  if ((await lstat(path)).isSymbolicLink())
    throw new Error("Release packaging refuses symbolic links and junctions.");
  if (forbidden(relative(root, path).replaceAll("\\", "/"))) throw new Error("Forbidden release path.");
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (entries) {
    for (const entry of entries) await add(join(path, entry.name), prefix);
  } else files[(prefix + relative(root, path)).replaceAll("\\", "/")] = new Uint8Array(await readFile(path));
}
for (const path of paths) await add(join(root, path));
const source = zipSync(files, { level: 6 });
if (scanZip(source).length) throw new Error("Release security check failed.");
await writeFile(join(output, "profile-studio-source.zip"), source);
const plugin = {};
for (const [path, bytes] of Object.entries(await pluginSource())) plugin[`profileStudio/${path}`] = bytes;
plugin["LICENSE"] = files["LICENSE"];
const pluginZip = zipSync(plugin, { level: 6 });
await writeFile(join(output, "profile-studio-userplugin.zip"), pluginZip);
await writeFile(
  join(output, "SHA256SUMS.txt"),
  [
    [source, "profile-studio-source.zip"],
    [pluginZip, "profile-studio-userplugin.zip"],
  ]
    .map(([data, name]) => `${createHash("sha256").update(data).digest("hex")}  ${name}`)
    .join("\n") + "\n",
);
console.log(`Release packages: ${output}`);
