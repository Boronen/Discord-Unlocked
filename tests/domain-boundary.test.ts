import { describe, expect, test } from "vitest";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { pluginSource } from "../scripts/plugin-source.mjs";
import { posix } from "node:path";
import * as oldModel from "../packages/plugin/model.js";
import * as model from "../packages/shared/domain/model.js";
import * as oldStudio from "../packages/plugin/studio-model.js";
import * as studio from "../packages/shared/domain/studio-model.js";
import * as oldTint from "../packages/plugin/tint.js";
import * as tint from "../packages/shared/domain/tint.js";
import * as oldMusic from "../packages/plugin/music-links.js";
import * as music from "../packages/shared/domain/music-links.js";
import * as oldZip from "../packages/plugin/export-zip.js";
import * as zip from "../packages/shared/domain/export-zip.js";

const modules = ["model", "studio-model", "tint", "music-links", "export-zip"];
describe("shared domain compatibility", () => {
  test("lint rejects reverse, type-only and runtime-specific domain imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-boundaries-"));
    try {
      await writeFile(join(root, ".oxlintrc.json"), await readFile(".oxlintrc.json"));
      for (const [file, source] of [
        ["packages/server/probe.ts", 'import type { ProfileConfig } from "../plugin/model.js";'],
        ["packages/shared/probe.ts", 'export * from "../plugin/model.js";'],
        ["packages/shared/domain/probe.ts", 'import { readFile } from "node:fs";'],
        ["packages/shared/domain/parent.ts", 'export * from "../schema.js";'],
      ] as const) {
        await mkdir(join(root, file.slice(0, file.lastIndexOf("/"))), { recursive: true });
        await writeFile(join(root, file), source!);
        const result = spawnSync(
          process.execPath,
          [resolve("node_modules/oxlint/bin/oxlint"), "-c", ".oxlintrc.json", file!],
          { cwd: root, encoding: "utf8", windowsHide: true },
        );
        expect(result.status, file + ": " + result.stderr + result.stdout).toBe(1);
        expect(result.stderr + result.stdout).toContain("no-restricted-imports");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test.each([
    ["model", oldModel, model],
    ["studio", oldStudio, studio],
    ["tint", oldTint, tint],
    ["music", oldMusic, music],
    ["zip", oldZip, zip],
  ] as const)("%s compatibility export has identical runtime bindings", (_name, old, canonical) => {
    expect(Object.keys(old)).toEqual(Object.keys(canonical));
    for (const key of Object.keys(canonical))
      expect((old as Record<string, unknown>)[key]).toBe((canonical as Record<string, unknown>)[key]);
  });
  test("participant source is self-contained and has no server dependency", async () => {
    const files = await pluginSource();
    for (const name of modules) {
      expect(new TextDecoder().decode(files[`${name}.ts`])).toContain(`./domain/${name}.js`);
      expect(files[`domain/${name}.ts`]).toEqual(
        new Uint8Array(await readFile(`packages/shared/domain/${name}.ts`)),
      );
    }
    expect(Object.keys(files).some((p) => p.includes("server/") || p.includes("secrets/"))).toBe(false);
    // Compile the relocated source, not the repository's compatibility paths.
    await build({
      stdin: {
        contents: modules.map((n) => `export * as ${n.replaceAll("-", "_")} from "./${n}.ts";`).join("\n"),
        resolveDir: "/fixture",
      },
      bundle: true,
      platform: "browser",
      write: false,
      plugins: [
        {
          name: "packaged-source",
          setup(builder) {
            builder.onResolve({ filter: /^\.\// }, (args) => ({
              path: posix.resolve(
                args.namespace === "fixture" ? posix.dirname(args.importer) : "/",
                args.path,
              ),
              namespace: "fixture",
            }));
            builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => {
              const name = args.path.replace(/^\//, "").replace(/\.js$/, ".ts");
              if (!files[name]) throw new Error(`Missing packaged domain module: ${name}`);
              return {
                contents: new TextDecoder().decode(files[name]),
                loader: "ts",
                resolveDir: args.path.slice(0, args.path.lastIndexOf("/")),
              };
            });
          },
        },
      ],
    });
  });
});
