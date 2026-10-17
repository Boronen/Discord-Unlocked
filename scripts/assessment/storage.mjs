import { readdir, lstat, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
async function size(path) {
  const info = await lstat(path).catch(() => null);
  if (!info || info.isSymbolicLink()) return 0;
  if (!info.isDirectory()) return info.size;
  let bytes = 0;
  for (const child of await readdir(path)) bytes += await size(join(path, child));
  return bytes;
}
const folders = {};
for (const path of ["node_modules", ".vendor", "dist", "diagnostics", "packages", "tests", "docs"])
  folders[path] = await size(path);
const zip = unzipSync(await readFile("dist/windows/ProfileStudio-Windows.zip"));
const entries = Object.entries(zip)
  .map(([path, data]) => ({ path, uncompressedBytes: data.length }))
  .sort((a, b) => b.uncompressedBytes - a.uncompressedBytes);
const result = {
  at: new Date().toISOString(),
  kind: "Logical file lengths; no symlink traversal, allocated blocks or Docker layers; private/user-data directories are excluded",
  folders,
  windowsPackage: { uncompressedBytes: entries.reduce((s, e) => s + e.uncompressedBytes, 0), entries },
};
await mkdir("diagnostics/refactor-stage0", { recursive: true });
await writeFile("diagnostics/refactor-stage0/storage.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
