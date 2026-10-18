import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function licenseInventory(write = false) {
  const sections = [];
  let count = 0;
  for (const [label, file] of [
    ["Application", "package-lock.json"],
    ["Documentation tooling", "docs-site/package-lock.json"],
  ]) {
    const lock = JSON.parse(await readFile(file, "utf8"));
    const lines = [];
    for (const [path, entry] of Object.entries(lock.packages)
      .filter(([p]) => p)
      .sort(([a], [b]) => a.localeCompare(b))) {
      const name = path.slice(path.lastIndexOf("node_modules/") + 13);
      const license = entry.license ?? "Not declared in lockfile; inspect the distributed package";
      lines.push(
        `- [${name}@${entry.version}](https://www.npmjs.com/package/${encodeURIComponent(name)}/v/${entry.version}) — ${license}; ${entry.dev ? "development" : "runtime"}${entry.optional ? "; optional/platform-specific" : ""}.`,
      );
    }
    count += lines.length;
    sections.push(
      `## ${label}\n\nLockfile: \`${file}\`. Includes nested duplicates and optional packages; this is not a count of modules shipped to every platform.\n\n${lines.join("\n")}\n`,
    );
  }
  const text =
    "# Locked dependency licence inventory\n\nGenerated from both committed lockfiles by `node scripts/docs-licenses.mjs --write`. These are declared package licences, not a legal compatibility determination. Retain each package's distributed notices and verify obligations when changing or redistributing it. See [Sources and licences](SOURCES-LICENSES.md) for native tools, Vencord and bundled code outside npm.\n\n" +
    sections.join("\n");
  if (write) await writeFile("docs/DEPENDENCY-LICENSES.md", text);
  else if ((await readFile("docs/DEPENDENCY-LICENSES.md", "utf8")).replaceAll("\r\n", "\n") !== text)
    throw new Error("Dependency licence inventory is stale.");
  return count;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    `Licence declarations checked: ${await licenseInventory(process.argv.includes("--write"))} locked entries.`,
  );
