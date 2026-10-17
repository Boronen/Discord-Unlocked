// Isolated synthetic API benchmark; no environment file or production database is opened.
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, token, ALICE } from "../../tests/helpers.js";
import { createApp } from "../../packages/server/app.js";
import { FileStore } from "../../packages/server/media.js";

const directory = await mkdtemp(join(tmpdir(), "profile-studio-assessment-"));
const start = performance.now();
const context = await setup();
const app = await createApp(context.service, new FileStore(directory));
const session = await token(context.service, ALICE);
// A realistic first catalog page, without downloading any provider artwork.
await context.raw.query(
  `INSERT INTO catalog(id,kind,item) SELECT 'sample-'||lpad(n::text,3,'0'),'effect',jsonb_build_object('id','sample-'||lpad(n::text,3,'0'),'kind','effect','name','Sample effect '||n,'imageUrl','https://cdn.discordapp.com/asset.png','staticUrl','https://cdn.discordapp.com/asset.png','discordAsset',NULL,'layers','[]'::jsonb) FROM generate_series(1,700) n`,
);
let queries = 0;
const query = context.db.query.bind(context.db);
context.db.query = (async (...args: Parameters<typeof query>) => {
  queries++;
  return query(...args);
}) as typeof context.db.query;
await app.ready();
const initializationMs = performance.now() - start;
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const rows: unknown[] = [];
const paths = ["/health", "/v1/me", "/v2/me/workspace", "/v2/catalog"];
try {
  for (const path of paths) {
    const cold = performance.now();
    const initial = await app.inject({ url: path, headers: { authorization: `Bearer ${session}` } });
    if (initial.statusCode !== 200)
      throw new Error(`Synthetic API returned ${initial.statusCode} for ${path}`);
    const coldMs = performance.now() - cold;
    for (let i = 0; i < 5; i++)
      await app.inject({ url: path, headers: { authorization: `Bearer ${session}` } });
    queries = 0;
    const before = process.cpuUsage(),
      wall = performance.now();
    const latency: number[] = [];
    for (let i = 0; i < 12; i++) {
      const at = performance.now();
      const response = await app.inject({ url: path, headers: { authorization: `Bearer ${session}` } });
      if (response.statusCode !== 200) throw new Error(`Synthetic warm API failed (${response.statusCode})`);
      latency.push(performance.now() - at);
    }
    const cpu = process.cpuUsage(before);
    latency.sort((a, b) => a - b);
    rows.push({
      path,
      coldMs,
      requests: latency.length,
      p50Ms: latency[Math.floor(latency.length * 0.5)],
      p95Ms: latency[Math.floor(latency.length * 0.95)],
      wallMs: performance.now() - wall,
      cpuMs: (cpu.user + cpu.system) / 1000,
      queriesPerRequest: queries / latency.length,
      responseBytes: Buffer.byteLength(initial.body),
      memory: process.memoryUsage(),
    });
  }
  lag.disable();
  await mkdir("diagnostics/refactor-stage0", { recursive: true });
  const result = {
    at: new Date().toISOString(),
    node: process.version,
    kind: "PGlite + Fastify inject; in-process, serial, synthetic 4 accounts + 700 catalog items; excludes network, Discord and production PostgreSQL",
    initializationMs,
    rows,
    eventLoopP95Ms: lag.count ? lag.percentile(95) / 1e6 : null,
  };
  const run = process.argv[2] ?? "1";
  if (!/^[1-9]$/.test(run)) throw new Error("Use run number 1–9.");
  await writeFile(`diagnostics/refactor-stage0/server-${run}.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  lag.disable();
  await app.close();
  await context.raw.close();
  await rm(directory, { recursive: true, force: true });
}
