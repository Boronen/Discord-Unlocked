// Optional native smoke test: node scripts/test-png-export.mjs /absolute/path/to/electron.exe
// Uses synthetic cards and a hidden window; it never connects to Discord or operator data.
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const executable = process.argv[2];
if (!executable) throw new Error("Pass an explicit Electron executable path.");
const directory = resolve("diagnostics/png-export-smoke");
await mkdir(directory, { recursive: true });
const entry = join(directory, "smoke.cjs");
await build({
  stdin: {
    resolveDir: resolve("."),
    loader: "js",
    contents: `
const {app, BrowserWindow, dialog, nativeImage} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {exportProfilePng} = require('./packages/plugin/native.ts');
const directory = ${JSON.stringify(directory)};
app.setPath('userData', path.join(directory, 'user-data'));
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => { console.error('Native export smoke test timed out.'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const output = path.join(directory, 'large-card.png');
  let dialogs = 0;
  dialog.showSaveDialog = async () => { dialogs++; return {canceled:false,filePath:output}; };
  const tile = nativeImage.createFromBitmap(Buffer.from([55,88,201,255]), {width:1,height:1}).toDataURL();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><!--' + 'x'.repeat(3*1024*1024) + '--><foreignObject width="900" height="900"><div xmlns="http://www.w3.org/1999/xhtml" style="width:900px;height:900px;background:#123456"><img src="' + tile + '" style="width:450px;height:900px" /></div></foreignObject></svg>';
  assert.equal(await exportProfilePng(null, svg, 900, 900), true);
  const image = nativeImage.createFromPath(output);
  assert.deepEqual(image.getSize(), {width:900,height:900});
  const bitmap = image.toBitmap();
  const left = [...bitmap.subarray((450*900+200)*4,(450*900+200)*4+4)];
  const right = [...bitmap.subarray((450*900+700)*4,(450*900+700)*4+4)];
  assert.deepEqual(left, [55,88,201,255], 'Embedded image must be decoded before capture.');
  assert.deepEqual(right, [86,52,18,255], 'Styled foreignObject card must render.');
  assert.equal(BrowserWindow.getAllWindows().length,0);
  console.log('PASS: >3 MiB SVG exported, embedded image + card pixels verified, 900 x 900 PNG, hidden window cleaned up.');

  dialog.showSaveDialog = async () => { dialogs++; return {canceled:true}; };
  assert.equal(await exportProfilePng(null, svg, 900, 900), false);
  assert.equal(BrowserWindow.getAllWindows().length,0);
  await assert.rejects(exportProfilePng(null, svg, 5000, 900), /limits/);
  assert.equal(dialogs,2, 'Invalid input must not open a save dialog.');
  console.log('PASS: cancellation and image bounds.');

  dialog.showSaveDialog = async () => ({canceled:false,filePath:path.join(directory,'must-not-save.png')});
  const load = BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL = async () => { throw new Error('ERR_INVALID_URL loading data:private-card-payload'); };
  try {
    await assert.rejects(exportProfilePng(null,svg,900,900), error => error.message === 'The profile card could not be rendered. Please try again.');
    await assert.rejects(fs.access(path.join(directory,'must-not-save.png')));
    assert.equal(BrowserWindow.getAllWindows().length,0);
  } finally { BrowserWindow.prototype.loadURL = load; }
  console.log('PASS: native load failure hides payload, saves no file and destroys the window.');
}).then(() => {clearTimeout(deadline); app.exit(0);}, error => {
  clearTimeout(deadline); console.error(error); app.exit(1);
});
`,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: entry,
  external: ["electron"],
  plugins: [
    {
      name: "operator-free-test-stubs",
      setup(builder) {
        builder.onResolve({ filter: /^@main\// }, (args) => ({ path: args.path, namespace: "test-stub" }));
        builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({
          contents: 'export const DATA_DIR = "unused-test-only"; export const RendererSettings = {store:{}};',
        }));
      },
    },
  ],
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const code = await new Promise((resolveCode, reject) => {
  const child = spawn(resolve(executable), [entry], { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject);
  child.on("exit", resolveCode);
});
if (code !== 0) throw new Error(`Native PNG smoke test failed (${code}).`);
const png = await readFile(join(directory, "large-card.png"));
console.log(`Native PNG fixture saved: ${png.length} bytes, ${directory}`);
