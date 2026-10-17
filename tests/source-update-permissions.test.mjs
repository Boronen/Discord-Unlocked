import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, stat, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const scriptPath =
  process.env.SOURCE_UPDATE_SCRIPT ?? new URL("../deploy/apply-source-update.sh", import.meta.url);
async function extractFixture(directory, files) {
  const script = await readFile(scriptPath, "utf8");
  const blocks = [...script.matchAll(/<<'JS'\r?\n([\s\S]*?)\r?\nJS/g)];
  assert.equal(blocks.length, 2);
  const source = blocks[1][1].replace(
    "import { unzipSync } from 'fflate';",
    `const unzipSync = () => Object.fromEntries(Object.entries(${JSON.stringify(files)}).map(([name, value]) => [name, Buffer.from(value)]));`,
  );
  // Exercise the real filesystem-writing block, under the updater's private
  // umask. Archive decompression is substituted; no package dependency or sudo.
  await writeFile(join(directory, "fixture.zip"), "fixture");
  execFileSync(process.execPath, ["--input-type=module", "-", "fixture.zip"], {
    cwd: directory,
    input: `process.umask(0o077);\n${source}`,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
async function cleanFixture(directory) {
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + "ps-source-mode-"));
  await rm(directory, { recursive: true, force: true });
}

test(
  "source extraction overrides umask 077 for code without changing private files",
  { skip: process.platform !== "linux" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ps-source-mode-"));
    try {
      await mkdir(join(directory, "secrets"), { mode: 0o700 });
      await writeFile(join(directory, "secrets", "private.env"), "private fixture", { mode: 0o600 });
      await extractFixture(directory, {
        "package.json": '{"type":"module"}',
        "packages/new-component/deep/module.ts": "export const fixture = true;",
      });
      assert.equal(
        await readFile(join(directory, "packages/new-component/deep/module.ts"), "utf8"),
        "export const fixture = true;",
      );
      assert.equal(await readFile(join(directory, "secrets/private.env"), "utf8"), "private fixture");
      if (process.platform !== "win32") {
        assert.equal((await stat(join(directory, "package.json"))).mode & 0o777, 0o644);
        assert.equal(
          (await stat(join(directory, "packages/new-component/deep/module.ts"))).mode & 0o777,
          0o644,
        );
        for (const name of ["packages", "packages/new-component", "packages/new-component/deep"])
          assert.equal((await stat(join(directory, name))).mode & 0o777, 0o755);
        assert.equal((await stat(join(directory, "secrets"))).mode & 0o777, 0o700);
        assert.equal((await stat(join(directory, "secrets/private.env"))).mode & 0o777, 0o600);
      }
    } finally {
      await cleanFixture(directory);
    }
  },
);

test(
  "source mode normalization refuses symlink targets",
  { skip: process.platform !== "linux" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ps-source-mode-"));
    try {
      await mkdir(join(directory, "secrets"), { mode: 0o700 });
      await writeFile(join(directory, "secrets/private.env"), "private fixture", { mode: 0o600 });
      await symlink(join(directory, "secrets"), join(directory, "packages"));
      await assert.rejects(extractFixture(directory, { "packages/private.env": "replacement" }));
      assert.equal(await readFile(join(directory, "secrets/private.env"), "utf8"), "private fixture");
      assert.equal((await stat(join(directory, "secrets/private.env"))).mode & 0o777, 0o600);
    } finally {
      await cleanFixture(directory);
    }
  },
);
