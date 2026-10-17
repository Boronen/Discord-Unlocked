import { readFile, writeFile } from "node:fs/promises";
const directory = "diagnostics/refactor-stage0/";
const read = async (name) => JSON.parse((await readFile(directory + name, "utf8")).replace(/^\uFEFF/, ""));
const render = await Promise.all([1, 2, 3].map((n) => read(`renderer-${n}.json`)));
const server = await Promise.all([1, 2, 3].map((n) => read(`server-${n}.json`)));
const exports = await Promise.all([1, 2, 3].map((n) => read(`export-${n}.json`)));
function range(values) {
  const v = values.toSorted((a, b) => a - b);
  return { min: v[0], median: v[Math.floor(v.length / 2)], max: v.at(-1) };
}
const result = {
  capturedAt: new Date().toISOString(),
  renderer: render[0].rows.map((row, i) => ({
    name: row.name,
    cpuMs: range(render.map((r) => r.rows[i].cpuMs)),
    wallMs: range(render.map((r) => r.rows[i].wallMs)),
    commitsPerSecond: range(render.map((r) => r.rows[i].commits / (r.rows[i].wallMs / 1000))),
    sumWorkingSetMiB: range(render.map((r) => r.rows[i].processWorkingSetKb / 1024)),
    heapMiB: range(render.map((r) => r.rows[i].heapBytes / 1048576)),
    mountMs: range(render.map((r) => r.rows[i].mountMs)),
    pendingAnimationFrames: row.pendingAnimationFrames,
    activeIntervals: row.activeIntervals,
    activeTimeouts: row.activeTimeouts,
  })),
  churn: render.map((r) => ({
    cycles: r.churn.cycles,
    pendingAnimationFrames: r.churn.after.pendingAnimationFrames,
    intervals: r.churn.after.activeIntervals,
    timeouts: r.churn.after.activeTimeouts,
    domNodes: r.churn.after.domNodes,
    externalRequests: r.externalRequests,
  })),
  api: server[0].rows.map((row, i) => ({
    path: row.path,
    coldMs: range(server.map((r) => r.rows[i].coldMs)),
    p50Ms: range(server.map((r) => r.rows[i].p50Ms)),
    p95Ms: range(server.map((r) => r.rows[i].p95Ms)),
    queriesPerRequest: row.queriesPerRequest,
    responseBytes: row.responseBytes,
  })),
  gif: {
    suiteWallMs: range(exports.map((r) => r.wallMs)),
    mainProcessCpuMs: range(exports.map((r) => r.mainProcessCpuMs)),
    peakSumWorkingSetMiB: range(exports.map((r) => r.peakSumWorkingSetKb / 1024)),
    artifacts: exports[0].artifacts,
  },
  host: await read("host.json"),
  media: await read("media.json"),
  limitations: [
    "Offscreen Electron CPU includes Chromium/GPU work and instrumentation; it is not Discord CPU.",
    "Working-set sums can count shared pages more than once and exclude terminated processes.",
    "PGlite RSS includes its embedded WASM database and is not production PostgreSQL/API RSS.",
    "Three runs characterize spread, not a statistically powered before/after comparison.",
    "Warm request p95 uses only twelve samples per endpoint per run; cold means first request in a fresh process, not OS cold disk cache.",
    "GIF suite has two sampled frames per card; it is not a full-duration recording benchmark.",
    "Host idle sample is not a 50-user capacity or sustained-load test.",
  ],
};
await writeFile(directory + "summary.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
