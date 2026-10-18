# Developer guide

## Workspace and dependencies

Use Node.js 24 and the root lockfile. The package declares a broader minimum engine; Node 24 is the tested project/deployment target. Docker with Linux containers is required for production-equivalent database, image and isolation checks. Windows Discord Stable is required for actual client acceptance. The React preview uses synthetic data and is not a production control panel.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run preview:build
```

The full tests include TypeScript/Vitest and Node operational/package suites. Some Linux deployment tests skip on Windows; a passing local run must report those skips. Media tests need the supplied FFmpeg/FFprobe binaries or explicitly configured `TEST_FFMPEG` / `TEST_FFPROBE`. Docker image builds/scans and native export tests are separate from the browser build.

Run `npm run preview` for the synthetic editor. Keep it loopback-only. Real API/bot/worker development uses ignored per-service secrets and a disposable database; see [Configuration](CONFIGURATION.md). Never point exploratory tests at production user data.

## Pinned Vencord

Use `vencord-version.json` and [the source installation instructions](INSTALL-WINDOWS.md). The current supported commit is `32c90633ce6a95d7e56c95479efbb431bacf1eac`; this refactor does not change it.

```sh
npm run plugin:check
npm run plugin:build
```

Plugin assembly includes shared domain files; use the scripts, not a manual plugin-folder copy. After final source/format changes, sync again before building/packaging. A build/source mismatch is a packaging failure to fix, not a guard to disable. `package-windows.mjs` produces the participant ZIP and corresponding source; [Windows packaging](WINDOWS-CLIENT-PACKAGE.md) covers exact commands and installer provenance. Building does not install or restart Discord.

## Change boundaries

- Pure contracts/helpers: shared domain; strict schemas: shared server-facing schema modules.
- Service rules: API/Studio services with transactional ownership/version checks. Do not trust a client privilege flag.
- Editor state/data/native/rendering: follow [ownership](CODE-OWNERSHIP.md); avoid putting unrelated work back into the top-level component.
- Media/animation work: follow explicit lease and teardown ownership in [Resource lifecycle](RESOURCE-LIFECYCLE.md). Hidden scenes must not retain pointless timers.
- Native/dynamic roots: consult `scripts/dead-code-entrypoints.json` before removing code. Static reachability alone cannot prove a Vencord patch/export/migration is unused.

Use existing TypeScript/React lint and scoped format checks. Do not bulk-format vendored source/licences. Add meaningful regression cases for altered ownership, races or authorization; avoid implementation-mirroring tests for trivial reversible edits.

## Documentation and contract changes

English Markdown under `docs/` is the site source. Root privacy/security text is included into site pages. The contribution policy has one canonical document and a root entry link. Keep working, experimental and proposed behavior distinct.

```sh
npm ci --prefix docs-site --ignore-scripts
npm run docs:check
npm run build --prefix docs-site
```

API changes must update the maintained route contracts and source fingerprints after reviewing actual DTO/schema/service changes. Regenerate `API-REFERENCE.md`; never update fingerprints solely to silence a failure. The coverage checker does not replace runtime security tests. Licences/sources are generated from both lockfiles and retained third-party notices; review new dependencies for redistribution obligations.

## Verification and release

Run scoped format checks, lint, typecheck, full tests, server/preview/plugin/docs builds, API coverage, package integrity and working-tree/history/ZIP/image secret scans. Native export scripts exercise PNG/GIF with an isolated Electron runtime; do not describe them as two-account Discord trials. Preserve synthetic screenshots only in public docs.

A compatible server rollout requires a fresh encrypted backup, migration/restore rehearsal, image scan and rollback image/database point. Update the server before distributing a client that requires its capabilities. Old images must not start against newly written schemas without a tested rollback. Follow [Studio deployment](STUDIO-V2-DEPLOYMENT.md), [Operations](OPERATIONS.md) and [Acceptance](ACCEPTANCE.md).

The target repository is [Boronen/Discord-Unlocked](https://github.com/Boronen/Discord-Unlocked). Choosing that URL does not prove it exists, configure a remote, push source or enable Pages. Public publication remains a separate reviewed owner action. Use minimal CI permissions, pinned Action commits, branch protections, secret protection/private vulnerability reporting where available, and a noreply commit identity if desired.
