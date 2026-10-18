import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

/** Build a self-contained userplugin tree from the canonical source modules. */
export async function pluginSource(root = ".") {
  const files = {};
  async function add(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Plugin source refuses links.");
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await add(path, `${name}/`);
      else {
        if (!/\.(?:ts|tsx|css|md|js)$/.test(entry.name)) throw new Error("Unexpected plugin source file.");
        files[name] = new Uint8Array(await readFile(path));
      }
    }
  }
  await add(join(root, "packages/plugin"), "");
  await add(join(root, "packages/shared/domain"), "domain/");
  for (const name of Object.keys(files).filter((name) => name.startsWith("domain/"))) {
    const compatibility = name.slice("domain/".length);
    const original = `export * from "../shared/domain/${compatibility.replace(/\.ts$/, ".js")}";`;
    const text = new TextDecoder().decode(files[compatibility]);
    if (!text.includes(original)) throw new Error(`Missing domain compatibility export: ${compatibility}`);
    files[compatibility] = new TextEncoder().encode(
      text.replace(original, original.replace("../shared/domain/", "./domain/")),
    );
  }
  return files;
}
