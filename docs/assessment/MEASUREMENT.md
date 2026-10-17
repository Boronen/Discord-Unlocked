# Reproducing the Stage 0 baseline

These tools are development-only and are not imported by the plugin/server. Run from the repository root. They write ignored private `diagnostics/refactor-stage0/` files. Never upload the directory or real account/profile captures.

## Prerequisites

Use the existing lockfile and pinned Vencord checkout. Do not upgrade Vencord or runtime dependencies to reproduce this assessment. The captured host used Windows x64, Node 24.14.0, Electron 41.2.1 and the root package versions in `package-lock.json`. The source parser uses the existing pinned Vencord checkout's TypeScript 6 API because the root TypeScript 7 package no longer exports that legacy API.

The source baseline commit predates these tools. Check out the assessment commit recorded in the private handoff manifest; application sources are unchanged from `377b4a2e6fade416572c72cf0ace8608d3402c39`. Do not expect `scripts/assessment/` to exist in the earlier commit.

Install the project's existing development dependencies and prepare the pinned Vencord checkout using the normal developer guide. The Electron executable is a separately installed development test runtime, not a new client dependency. Record its version and origin locally; do not download it implicitly from a benchmark script.

## Commands

PowerShell (replace the Electron path with the installed official test runtime):

```powershell
node scripts/assessment/inventory.mjs
node scripts/assessment/storage.mjs
node --import tsx scripts/assessment/media.ts
1..3 | ForEach-Object {
  node scripts/assessment/renderer.mjs C:/path/to/electron.exe $_
  if ($LASTEXITCODE -ne 0) { throw 'Renderer baseline failed' }
}
1..3 | ForEach-Object {
  node --import tsx scripts/assessment/server.ts $_
  if ($LASTEXITCODE -ne 0) { throw 'API baseline failed' }
}
1..3 | ForEach-Object {
  node scripts/test-gif-export.mjs C:/path/to/electron.exe --assessment-run $_
  if ($LASTEXITCODE -ne 0) { throw 'Export baseline failed' }
}
node scripts/assessment/checks.mjs
```

On the Linux host, `sh scripts/assessment/host.sh` reads cgroup v2 counters twice, ten seconds apart. It reads process command names only to classify a fixed list of service roles; command lines, environment, config and application data are never emitted. It needs a readable Docker systemd cgroup layout. An empty list or `unknown` role is **missing evidence**, not zero service usage. Normalize CRLF before sending shell input over SSH; prefer transferring LF bytes rather than a PowerShell text pipeline.

Copy the resulting JSON to ignored `diagnostics/refactor-stage0/host.json`, then run:

```powershell
node scripts/assessment/summarize.mjs
```

The summary requires all three renderer/API/export runs plus media/host results. Do not substitute missing samples with zero. The scripts do not modify secrets, production data, deployment configuration or public services. The benchmark API session is synthetic and never persisted to disk.

## What is measured

- Renderer: production React profiling build, real shared renderer/workspace/picker, synthetic artwork and API fixture. Initial rendering, catalogue search, steady-state commit/render counts, RAF/interval/timeout counts, renderer heap, process CPU and working sets. The `empty` case is an Electron shell **without a rendered profile**, not Discord with the plugin disabled.
- Churn: 20 synthetic profile mount/unmount cycles, with a cleanup wait. It checks tracked timers/DOM return to baseline; it does not force GC or inspect native Discord observers.
- Media: the actual cache class with 80 distinct gated 128 KiB blobs, plus duplicate lookups. No HTTP. The active-user case deliberately tests eviction protection.
- API: fresh PGlite migrations, four test accounts, 700 catalogue items, Fastify injection and serial authenticated reads. Five warmups, 12 measured requests per route. Permission checks are mocked; this is not Discord membership latency or production PostgreSQL throughput. Query counting observes the shared database wrapper, excluding internal transaction queries.
- GIF: existing native correctness suite with an opt-in measurement flag; normal/tall two-frame cards and cancellation. Timing includes startup. CPU is main-process CPU only; sampled working sets include all still-running Electron processes.
- Storage: logical file lengths, no symlinks, no user-data directories, and current ZIP entry sizes. Development caches are not installed-client size. Docker layers and filesystem allocation require separate evidence.
- Host: idle cgroup memory and CPU deltas, not an induced load test. Lifetime cgroup peaks are not peaks during this ten-second sample.

Both CPU/process memory instrumentation and React profiling add overhead. Summed process working sets may double-count shared pages. Browser heap does not include all decoded-image, GPU, blob or native memory. Do not use a zero event-loop histogram sample count as zero latency: the server script reports null when no histogram samples were collected.

The renderer refuses an animated sample if hidden-window throttling reduced frame callbacks below the validity threshold. External network requests are blocked and counted. Keep unexpected-request count zero. The fixture's configured opacity, frame timing and image fidelity are not reduced to make measurements look better.

## Comparing a candidate

Keep the same OS/runtime, power mode, display settings, fixtures, case order and benchmark version. Close unrelated load; never run test/build/API/GIF benchmarks concurrently. Record the candidate commit and deployment image. Use at least three fresh-process runs, report median **and range**, and retain raw results privately.

Do not call a CPU/memory change an improvement when ranges overlap materially or when the work moved into an unmeasured GPU/native process. Add a longer controlled run when noise prevents a conclusion. First-request measurements use a fresh process/database but do not flush the OS page cache; repeated OS-cold behavior remains an acceptance gap.

Before deleting code, inspect operational/native/patch entrypoints listed in the [inventory](FEATURE-INVENTORY.md). Before deployment or public distribution, complete real Discord two-account, authorization, quota, erasure/recovery, full-size export and host capacity gates. The laboratory fixture must never be described as that acceptance test.
