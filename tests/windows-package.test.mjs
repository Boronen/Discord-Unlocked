import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { unzipSync } from "fflate";

test(
  "Windows package verifies in PowerShell and rejects a corrupted renderer before installation",
  {
    skip: process.platform !== "win32",
  },
  async () => {
    const archive = await readFile("dist/windows/ProfileStudio-Windows.zip").catch(() => null);
    if (!archive) return; // Operator packaging test; normal source CI does not create binaries.
    const directory = await mkdtemp(join(tmpdir(), "profile-studio-package-"));
    try {
      const entries = unzipSync(archive);
      for (const [name, data] of Object.entries(entries)) {
        assert.ok(name.startsWith("ProfileStudio-Windows/") && !name.split("/").includes(".."));
        await mkdir(dirname(join(directory, name)), { recursive: true });
        await writeFile(join(directory, name), data);
      }
      const root = join(directory, "ProfileStudio-Windows");
      const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
      assert.equal(manifest.updaterDisabled, true);
      assert.match(manifest.vencordCommit, /^[a-f0-9]{40}$/);
      const source = unzipSync(entries["ProfileStudio-Windows/Vencord-source.zip"]);
      assert.ok(source["src/userplugins/profileStudio/index.tsx"]);
      assert.ok(source["pnpm-lock.yaml"]);
      assert.ok(source["PROFILE-STUDIO-BUILD.md"]);
      assert.equal(
        Object.keys(entries).some((name) => /(?:secrets|settings|node_modules|\.git)\//.test(name)),
        false,
      );
      const binary = join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const args = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(root, "Setup.ps1"),
        "-Action",
        "Verify",
      ];
    const environment = { ...process.env };
    delete environment.PSModulePath;
    const result = execFileSync(binary, args, { encoding: "utf8", env: environment });
      assert.match(result, /Package integrity verified/);
      await writeFile(join(root, "dist", "renderer.js"), "corrupted fixture");
    const rejected = spawnSync(binary, args, { encoding: "utf8", env: environment });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stdout, /integrity check failed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
