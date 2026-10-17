// Optional live-provider smoke test. Public Steam App ID only; no Discord connection or credentials.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = resolve("diagnostics/steam-smoke");
await mkdir(directory, { recursive: true });
const output = join(directory, "native-steam.mjs");
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import assert from 'node:assert/strict';
import {steamGame,artwork} from './packages/plugin/native.ts';
const game=await steamGame(null,'https://store.steampowered.com/app/440/');
assert.equal(game.appId,'440');
assert.ok(game.images.length>=2 && game.images.length<=8);
const image=await artwork(null,game.images[0]);
assert.ok(image.startsWith('data:image/'));
assert.ok(image.length<8*1024*1024);
console.log('Live Steam native bridge passed:',game.name,game.images.length,'validated screenshots; first image loaded within media limits.');
`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: output,
  plugins: [
    {
      name: "isolated-native-imports",
      setup(builder) {
        builder.onResolve({ filter: /^(?:electron$|@main\/)/ }, (args) => ({
          path: args.path,
          namespace: "stub",
        }));
        builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents:
            'export const DATA_DIR="unused-test-only";export const RendererSettings={store:{}};export const safeStorage={};export const dialog={};export class BrowserWindow{}',
        }));
      },
    },
  ],
});
await import(pathToFileURL(output).href);
