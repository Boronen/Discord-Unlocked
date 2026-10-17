import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const config = JSON.parse(await readFile("secrets/load-test.json", "utf8"));
const url = new URL(config.base),
  tokens = config.tokens;
if (
  !(
    url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error("Use the configured clean HTTPS API origin (or local HTTP).");
if (
  !Array.isArray(tokens) ||
  ![5, 20, 50].includes(tokens.length) ||
  tokens.some((v) => typeof v !== "string" || !/^[a-zA-Z0-9_-]{32,100}$/.test(v))
)
  throw new Error(
    "Provide exactly 5, 20 or 50 independently paired beta sessions in ignored secrets/load-test.json. Never share these tokens.",
  );
if (!process.argv.includes("--authorized-stage-test"))
  throw new Error(
    "Run only on your own deployment with consented beta test sessions: --authorized-stage-test.",
  );
const times = [],
  ids = [],
  seen = new Set();
let bytes = 0,
  requests = 0,
  errors = 0;
async function request(path, token, binary = false) {
  const at = performance.now();
  requests++;
  const response = await fetch(new URL(path, url), {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const data = new Uint8Array(await response.arrayBuffer());
  bytes += data.length;
  times.push(performance.now() - at);
  if (bytes > 128 * 1024 * 1024)
    throw new Error(
      "The 128 MiB test transfer budget was exceeded. Stop expansion and size a reviewed test explicitly.",
    );
  if (!response.ok) {
    errors++;
    throw new Error(`Stage test received HTTP ${response.status}; access or capacity gate failed.`);
  }
  return binary ? null : JSON.parse(new TextDecoder().decode(data));
}
for (const token of tokens) {
  const state = await request("/v1/me", token);
  if (ids.includes(state.userId))
    throw new Error("Use separate beta accounts, not multiple sessions for one account.");
  ids.push(state.userId);
}
for (let round = 0; round < 3; round++) {
  for (let start = 0; start < tokens.length; start += 5)
    await Promise.all(
      tokens.slice(start, start + 5).map(async (token) => {
        const { profiles } = await request(`/v1/profiles?ids=${ids.join(",")}`, token);
        const media = Object.values(profiles)
          .filter(Boolean)
          .flatMap((profile) => Object.values(profile.media));
        for (const asset of media.slice(0, 4)) {
          const key = `${token}:${asset.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const target = new URL(asset.url);
          if (target.origin !== url.origin || !/^\/v1\/media\/[0-9a-f-]{36}$/.test(target.pathname))
            throw new Error("Invalid media in stage response.");
          await request(target.pathname, token, true);
        }
      }),
    );
  if (round < 2) await setTimeout(25_000);
}
times.sort((a, b) => a - b);
const result = {
  at: new Date().toISOString(),
  stage: tokens.length,
  requests,
  errors,
  bytes,
  p95ms: Math.round(times[Math.floor(times.length * 0.95)] ?? 0),
  note: "API/media smoke load only. Real Discord rendering, upload/moderation concurrency, host metrics and Funnel capacity still require acceptance evidence.",
};
await mkdir("data/diagnostics", { recursive: true });
await writeFile("data/diagnostics/load-summary.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.p95ms > 2000)
  throw new Error("Stage latency exceeds two seconds. Stop expansion and investigate.");
