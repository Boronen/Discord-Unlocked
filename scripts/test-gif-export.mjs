// Optional native integration test. Uses a synthetic owned card; never connects to Discord.
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const executable = process.argv[2];
if (!executable) throw new Error("Pass an explicit Electron executable path.");
const assessmentIndex = process.argv.indexOf("--assessment-run");
const assessmentRun = assessmentIndex < 0 ? null : process.argv[assessmentIndex + 1];
if (assessmentIndex >= 0 && !/^[1-9]$/.test(assessmentRun ?? ""))
  throw new Error("Assessment run must be 1–9.");
const directory = resolve("diagnostics/gif-export-smoke");
await mkdir(directory, { recursive: true });
const browser = await build({
  entryPoints: ["packages/plugin/profile-export.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "CardCapture",
  write: false,
});
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
const {CardGif} = require('./packages/plugin/gif-encoder.ts');
const {beginProfileGif, appendProfileGif, finishProfileGif, cancelProfileGif} = require('./packages/plugin/native.ts');
const directory = ${JSON.stringify(directory)};
const script = ${JSON.stringify(browser.outputFiles[0].text)};
app.setPath('userData', path.join(directory,'user-data'));
app.on('window-all-closed', () => {});
const assessmentRun=${JSON.stringify(assessmentRun)};
const measurementStart=performance.now(),cpuStart=process.cpuUsage();
let peakWorkingSetKb=0;
const measurementTimer=assessmentRun?setInterval(()=>{peakWorkingSetKb=Math.max(peakWorkingSetKb,app.getAppMetrics().reduce((sum,m)=>sum+m.memory.workingSetSize,0));},100):null;
const deadline=setTimeout(() => {console.error('GIF smoke timed out');app.exit(1);},90000);
app.whenReady().then(async () => {
  const make = (color) => { const data=new Uint8Array(100*100*4);for(let i=0;i<data.length;i+=4)data.set(color,i);return data; };
  const source=new CardGif(100,100);
  source.add(make([0,0,255,255]),0);source.add(make([0,255,0,255]),1000);
  const animated='data:image/gif;base64,'+Buffer.from(source.finish(2000)).toString('base64');
  const fixture=new BrowserWindow({show:false,width:300,height:300,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'gif-export-fixture'}});
  const url='https://profile-studio-test.invalid/';
  fixture.webContents.session.protocol.handle('https', () => new Response('<!doctype html><style>body{margin:0}.ps-profile{width:300px;height:200px;background:white;color:black}.ps-profile img{display:block;width:100px;height:100px}</style><aside>Outside card must not be exported</aside><section class="ps-profile"><img src="'+animated+'"><span>Own card only</span></section>',{headers:{'Content-Type':'text/html'}}));
  await fixture.loadURL(url);
  await fixture.webContents.executeJavaScript(script);
  const samples=await fixture.webContents.executeJavaScript('(async()=>{const capture=CardCapture.createProfileCapture(document.querySelector(".ps-profile"),async()=>{throw new Error("Unexpected remote request")},true);try{return [await capture.snapshot(0),await capture.snapshot(1250)]}finally{capture.close()}})()');
  assert.equal(samples[0].width,450);
  assert.equal(samples[0].height,300);
  assert(!samples[0].svg.includes('Outside card'));
  const event={sender:fixture.webContents};
  let output=path.join(directory,'animated-card.gif');
  dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
  const id=await beginProfileGif(event,450,300);
  await assert.rejects(beginProfileGif(event,450,300),/already running/);
  await assert.rejects(appendProfileGif({sender:{id:-1}},id,samples[0].svg,0),/expired/);
  await appendProfileGif(event,id,samples[0].svg,0);
  await appendProfileGif(event,id,samples[1].svg,1250);
  assert.equal(await finishProfileGif(event,id,2000),true);
  await assert.rejects(finishProfileGif(event,id,2000),/expired/);
  assert.equal(BrowserWindow.getAllWindows().length,1);
  console.log('PASS: actual animated GIF artwork sampled at distinct times, native card frames exported; session ownership/replay guarded.');
  // Repeated high-entropy PNG art used to exceed 16 MiB even on valid profiles.
  const noise=Buffer.alloc(512*512*4);let seed=12345;
  for(let i=0;i<noise.length;i+=4){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=seed&255;noise[i+1]=(seed>>>8)&255;noise[i+2]=(seed>>>16)&255;noise[i+3]=255;}
  const photo=nativeImage.createFromBitmap(noise,{width:512,height:512}).toDataURL();
  const tall=await fixture.webContents.executeJavaScript('(async()=>{const card=document.querySelector(".ps-profile");card.style.height="3000px";card.style.position="relative";for(let i=0;i<20;i++){const img=new Image();img.src='+JSON.stringify(photo)+';img.style.cssText="position:absolute;left:0;top:100px;width:300px;height:300px";card.append(img);await img.decode()}const bottom=document.createElement("div");bottom.textContent="LAST PANEL";bottom.style.cssText="position:absolute;left:0;bottom:0;width:300px;height:80px;background:#ffff00";card.append(bottom);const capture=CardCapture.createProfileCapture(card,async()=>{throw new Error("Unexpected remote request")},true);try{return [await capture.snapshot(0),await capture.snapshot(1250)]}finally{capture.close()}})()');
  assert(tall[0].height>2000 && tall[0].height<=8192);
  assert(tall[0].width*tall[0].height<=2000000);
  assert(tall[0].svg.includes('LAST PANEL'));
  assert(tall[0].svg.length<16*1024*1024,'GIF artwork must be compacted before serialization');
  output=path.join(directory,'tall-card.gif');
  const tallId=await beginProfileGif(event,tall[0].width,tall[0].height);
  const expanded=tall[0].svg.replace('>','><!--'+'x'.repeat(17*1024*1024)+'-->');
  await appendProfileGif(event,tallId,expanded,0);
  await appendProfileGif(event,tallId,tall[1].svg,1250);
  assert.equal(await finishProfileGif(event,tallId,2000),true);
  console.log('PASS: tall card with 20 photo layers exports fully; former 16 MiB native payload and 2,000px height gates no longer reject it.');
  output=path.join(directory,'cancelled.gif');
  await fs.writeFile(output,'existing file stays intact');
  const cancelled=await beginProfileGif(event,450,300);
  const pending=appendProfileGif(event,cancelled,samples[0].svg,0);
  await cancelProfileGif(event,cancelled);
  await assert.rejects(pending);
  assert.equal(await fs.readFile(output,'utf8'),'existing file stays intact');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  dialog.showSaveDialog=async()=>({canceled:true});
  assert.equal(await beginProfileGif(event,450,300),null);
  fixture.destroy();
  console.log('PASS: active rendering cancellation cleans up without overwriting a file; native save-dialog cancellation.');
}).then(async()=>{
  clearTimeout(deadline);
  if(measurementTimer){
    clearInterval(measurementTimer);
    const cpu=process.cpuUsage(cpuStart);
    await fs.mkdir(path.resolve('diagnostics/refactor-stage0'),{recursive:true});
    await fs.writeFile(path.resolve('diagnostics/refactor-stage0/export-'+assessmentRun+'.json'),JSON.stringify({at:new Date().toISOString(),kind:'Entire isolated native GIF correctness suite: normal and tall cards, cancellation; includes initialization',wallMs:performance.now()-measurementStart,mainProcessCpuMs:(cpu.user+cpu.system)/1000,peakSumWorkingSetKb:peakWorkingSetKb,artifacts:await Promise.all(['animated-card.gif','tall-card.gif'].map(async name=>({name,bytes:(await fs.stat(path.join(directory,name))).size})))},null,2)+'\\n');
  }
  app.exit(0)
},error=>{clearTimeout(deadline);if(measurementTimer)clearInterval(measurementTimer);console.error(error);app.exit(1)});
`,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: entry,
  external: ["electron"],
  plugins: [
    {
      name: "operator-free-stubs",
      setup(builder) {
        builder.onResolve({ filter: /^@main\// }, (args) => ({ path: args.path, namespace: "stub" }));
        builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: 'export const DATA_DIR="unused"; export const RendererSettings={store:{}};',
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
if (code !== 0) throw new Error(`Native GIF smoke failed (${code}).`);
const bytes = await readFile(join(directory, "animated-card.gif"));
const image = sharp(bytes, { animated: true });
const metadata = await image.metadata();
if (metadata.pages !== 2 || metadata.loop !== 0 || metadata.delay.join() !== "1250,750")
  throw new Error("GIF timing or frames did not survive.");
const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixel = (frame) => [
  ...data.subarray(
    (frame * metadata.pageHeight * info.width + 20 * info.width + 20) * 4,
    (frame * metadata.pageHeight * info.width + 20 * info.width + 20) * 4 + 4,
  ),
];
if (pixel(0)[0] < 240 || pixel(0)[1] > 15 || pixel(1)[0] > 15 || pixel(1)[1] < 240)
  throw new Error(`Animation was frozen or captured incorrectly: ${pixel(0)} / ${pixel(1)}`);
console.log(
  `PASS: independently decoded ${metadata.pages} distinct frames, ${metadata.width}×${metadata.pageHeight}, correct timing, ${bytes.length} bytes.`,
);
const tallImage = sharp(await readFile(join(directory, "tall-card.gif")), { animated: true });
const tallMeta = await tallImage.metadata();
if (tallMeta.pages !== 2 || tallMeta.pageHeight <= 2000)
  throw new Error("Tall GIF was cropped or lost animation.");
const tallRaw = await tallImage.ensureAlpha().raw().toBuffer();
const bottom = (tallMeta.pageHeight - 20) * tallMeta.width * 4 + 20 * 4;
if (tallRaw[bottom] < 240 || tallRaw[bottom + 1] < 240 || tallRaw[bottom + 2] > 15)
  throw new Error("The last panel did not survive tall-card export.");
console.log(
  "PASS: independent decode confirms the tall GIF includes its last panel and both animation frames.",
);
