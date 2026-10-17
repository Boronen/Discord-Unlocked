import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
const executable = process.argv[2],
  run = process.argv[3] ?? "1";
if (!executable || !/^[1-9]$/.test(run))
  throw new Error("Usage: node scripts/assessment/renderer.mjs <electron.exe> <run 1–9>");
const directory = resolve("diagnostics/refactor-stage0");
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ["scripts/assessment/renderer.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: join(directory, "renderer.js"),
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@webpack/common": resolve("preview/discord-adapter.tsx"),
    "@components/Button": resolve("preview/discord-adapter.tsx"),
    "react-dom/client": "react-dom/profiling",
  },
});
const html =
  '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/renderer.css"><style>body{margin:0}#root{padding:16px;min-height:100vh}.ps-profile{width:300px;flex-shrink:0}</style><div class="preview-shell"><div id="root"></div></div><script src="/renderer.js"></script>';
const main = join(directory, "renderer-main.cjs");
await writeFile(
  main,
  `
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const directory=${JSON.stringify(directory)},run=${JSON.stringify(run)};
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.setPath('userData',path.join(directory,'electron-user-'+run));
app.on('window-all-closed',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const timeout=setTimeout(()=>app.exit(2),150000);
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,width:1800,height:1000,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'assessment-'+run}});
  window.webContents.setFrameRate(60);
  let externalRequests=0;
  window.webContents.session.webRequest.onBeforeRequest((details,cb)=>{const allowed=details.url.startsWith('https://assessment.invalid/')||details.url.startsWith('data:')||details.url.startsWith('blob:');if(!allowed)externalRequests++;cb({cancel:!allowed})});
  window.webContents.session.protocol.handle('https',async req=>{
    const name=new URL(req.url).pathname;
    if(name==='/')return new Response(${JSON.stringify(html)},{headers:{'Content-Type':'text/html'}});
    if(name==='/renderer.js'||name==='/renderer.css')return new Response(await fs.readFile(path.join(directory,name.slice(1))),{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':'text/css'}});
    return new Response('',{status:404});
  });
  await window.loadURL('https://assessment.invalid/');
  const evaluate=script=>window.webContents.executeJavaScript(script);
  const metrics=()=>app.getAppMetrics().map(m=>({type:m.type,pid:m.pid,cpu:m.cpu.cumulativeCPUUsage,workingSetKb:m.memory.workingSetSize,peakWorkingSetKb:m.memory.peakWorkingSetSize}));
  const rows=[];
  for(const name of ['empty','profile-static','profile-small','profile-full','profiles-five','profile-offscreen','editor','catalog']){
    await evaluate('assessment.clear()');
    const at=performance.now();await evaluate('assessment.mount('+JSON.stringify(name)+')');const mountMs=performance.now()-at;
    await wait(700);
    const interaction=name==='catalog'?await evaluate('assessment.search()'):null;
    const before=await evaluate('assessment.stats()'),cpuBefore=metrics(),wall=performance.now();
    let peak=0;const sampler=setInterval(()=>{peak=Math.max(peak,...metrics().map(m=>m.workingSetKb));},100);
    await wait(3000);clearInterval(sampler);
    const after=await evaluate('assessment.stats()'),cpuAfter=metrics();
    const cpuMs=cpuAfter.reduce((sum,m)=>sum+Math.max(0,m.cpu-(cpuBefore.find(b=>b.pid===m.pid)?.cpu??m.cpu))*1000,0);
    if(name==='profile-small'&&after.rafCallbacks-before.rafCallbacks<30)throw new Error('Background frame throttling invalidates this sample');
    rows.push({name,mountMs,interaction,settledAfterMs:wall-at,wallMs:performance.now()-wall,cpuMs,processWorkingSetKb:cpuAfter.reduce((s,m)=>s+m.workingSetKb,0),largestProcessPeakKb:peak,commits:after.commits-before.commits,reactRenderMs:after.renderMs-before.renderMs,rafCallbacks:after.rafCallbacks-before.rafCallbacks,pendingAnimationFrames:after.pendingAnimationFrames,activeIntervals:after.activeIntervals,activeTimeouts:after.activeTimeouts,requests:after.requests-before.requests,domNodes:after.domNodes,heapBytes:after.heap});
    if(run==='1'&&(name==='editor'||name==='catalog'))await fs.writeFile(path.join(directory,name+'.png'),(await window.webContents.capturePage()).toPNG());
  }
  await evaluate('assessment.clear()');
  const beforeChurn=await evaluate('assessment.stats()');
  const afterChurn=await evaluate('assessment.churn()');
  const result={at:new Date().toISOString(),electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node,kind:'Isolated offscreen Electron at 60fps; production React profiling build; synthetic 3-layer CSS/texture profiles; no Discord',rows,churn:{cycles:20,before:beforeChurn,after:afterChurn},externalRequests};
  await fs.writeFile(path.join(directory,'renderer-'+run+'.json'),JSON.stringify(result,null,2)+'\\n');
  window.destroy();clearTimeout(timeout);console.log('Renderer baseline run '+run+' complete ('+rows.length+' cases).');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const code = await new Promise((done, reject) => {
  const child = spawn(resolve(executable), [main], { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject);
  child.on("exit", done);
});
if (code !== 0) throw new Error(`Isolated renderer assessment failed (${code}).`);
const result = JSON.parse(await readFile(join(directory, `renderer-${run}.json`), "utf8"));
console.log(
  JSON.stringify(
    result.rows.map(({ name, cpuMs, commits, pendingAnimationFrames, activeIntervals }) => ({
      name,
      cpuMs,
      commits,
      pendingAnimationFrames,
      activeIntervals,
    })),
    null,
    2,
  ),
);
