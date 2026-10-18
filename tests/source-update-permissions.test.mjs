import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, stat, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const scriptPath =
  process.env.SOURCE_UPDATE_SCRIPT ?? new URL("../deploy/apply-source-update.sh", import.meta.url);

test(
  "source update validates an immutable reuse image before touching source",
  { skip: process.platform !== "linux" },
  async () => {
    const source = await readFile(scriptPath, "utf8");
    const prefix = source.slice(0, source.indexOf("archive=$(realpath"));
    const candidate = "sha256:" + "a".repeat(64);
    function run(args, image = candidate) {
      return execFileSync(
        "sh",
        ["-c", `id() { echo 0; }; docker() { printf '%s\\n' '${image}'; }; ${prefix}`, "fixture", ...args],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    }
    run(["source.zip", "hash"]);
    run(["source.zip", "hash", "--use-built-image", candidate]);
    for (const args of [
      ["source.zip", "hash", "--unknown", candidate],
      ["source.zip", "hash", "--use-built-image", "profile-studio:local"],
      ["source.zip", "hash", "--use-built-image"],
    ])
      assert.throws(() => run(args));
    assert.throws(() =>
      run(["source.zip", "hash", "--use-built-image", candidate], "sha256:" + "b".repeat(64)),
    );
    assert.match(source, /sh deploy\/update-studio-v2\.sh --use-built-image "\$reuse_image"/);
  },
);
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

test("update admission accepts the documentation release and rejects private/generated paths", async () => {
  const script = await readFile(scriptPath, "utf8");
  const admission = [...script.matchAll(/<<'JS'\r?\n([\s\S]*?)\r?\nJS/g)][0][1];
  function check(paths) {
    const source = admission
      .replace(
        "import { unzipSync } from 'fflate';",
        `const unzipSync = () => Object.fromEntries(${JSON.stringify(paths)}.map(name => [name, new Uint8Array()]));`,
      )
      .replace("readFileSync(process.argv[2])", "new Uint8Array()");
    execFileSync(process.execPath, ["--input-type=module", "-"], {
      input: source,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  check([
    "docs-site/package.json",
    "docs-site/package-lock.json",
    "docs-site/.vitepress/config.mts",
    "CONTRIBUTING.md",
    ".oxlintrc.json",
    "deploy/api.env.example",
  ]);
  const release = await readFile(new URL("../scripts/release.mjs", import.meta.url), "utf8");
  const roots = JSON.parse(release.match(/const paths = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  check(
    roots.filter(
      (path) => (path.includes(".") && path !== ".github") || ["LICENSE", "Dockerfile"].includes(path),
    ),
  );
  for (const path of [
    "secrets/api.env",
    "packages/secrets/private.env",
    "docs/.vitepress/dist/index.html",
    "docs-site/.vitepress/cache/index.json",
    "docs-site/node_modules/tool/index.js",
    "docs/backup-oauth-site/index.html",
    "deploy/backup.key",
    "packages/.env",
    "../package.json",
    "/package.json",
  ])
    assert.throws(() => check([path]), undefined, path);
});

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
