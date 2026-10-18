# Sources, technologies and licences

## Project source

The target repository is [Boronen/Discord-Unlocked](https://github.com/Boronen/Discord-Unlocked). Profile Studio source is **GPL-3.0-or-later**; the complete licence is the root `LICENSE`. Source ZIPs preserve the project source and licence. Participant Windows packages include the custom runtime, notices and corresponding Vencord/plugin source. A checksum detects corruption; it does not authenticate an unknown distributor.

This is not an official Discord product and does not grant Nitro, store ownership or permission to redistribute shop artwork. Store media and third-party music are not bundled. Uploader/operator permissions and provider terms remain relevant. A URL available to the client is not automatically a licence to include that asset in a release.

## Application technology

- **TypeScript / JavaScript**, Node.js 24: shared models, plugin, API, bot and operational scripts. Runtime support is tested on the documented target, not every engine satisfying a package's minimum range.
- **React**: editor/preview rendering using Discord's integration adapter. **Vencord**: pinned custom userplugin host and native bridge; [source](https://github.com/Vendicated/Vencord), commit `32c90633ce6a95d7e56c95479efbb431bacf1eac`, GPL-3.0. It is not an upstream-approved plugin.
- **Fastify**, CORS/rate-limit/multipart plugins, **Zod**, **pg**, **discord.js**, **dotenv**: HTTP, shape validation, PostgreSQL/Discord integration and service configuration. Exact versions and declared licences are in the lock inventory below.
- **PostgreSQL 17**: persistent data and narrow role/function boundaries. **Sharp/libvips** and **FFmpeg/FFprobe** normalize untrusted media under process/network/storage limits.
- **Docker Engine/Compose**, Linux, optional **Caddy**, **Tailscale Funnel**, **rclone** and Google Drive: deployment/network/backup tools. These are separate tools/services, not new Discord runtime dependencies. Their provider agreements and processing locations must be assessed for the actual deployment.
- **Vite/Vitest**, Testing Library, jsdom, PGlite, oxlint and Prettier: development/build/verification. The synthetic preview is not the production API or a native Discord test.
- **VitePress 1.6.4** and its own isolated lockfile: static documentation and local search. Its Vite dependency is overridden to patched 6.4.4 and checked with the site build/audit; application locks and production images do not acquire this dependency tree.

## APIs and external content

Discord REST/gateway/bot commands verify identity and roles and deliver moderation messages; this project never requests a Discord password/user token. The catalog imports validated Discord/CDN metadata. Supported Spotify, Apple Music and YouTube links provide bounded metadata/artwork and explicit provider playback. Steam public store metadata/screenshots power the game panel; no Steam account/key is required. These are integrations, not endorsements or guaranteed content availability. See [Privacy](PRIVACY.md) for data sent to providers and [Architecture](ARCHITECTURE.md) for boundaries.

## Licence verification and retained notices

The generated [complete locked npm inventory](DEPENDENCY-LICENSES.md) covers direct/transitive application and documentation dependencies, including duplicates and platform-optional entries. It records declared licences rather than inventing missing ones. Run `node scripts/docs-licenses.mjs` to check drift after lock changes. Package licence declarations alone do not establish compatibility of every native binary build.

Bundled third-party code has its own notice in `packages/plugin/third-party/`; preserve those notices and provenance. The Vencord corresponding-source archive retains upstream notices; inspect its pinned source and dependencies before redistribution. The official Windows installer is downloaded from a pinned release and hash-checked, not included as an unreviewed copied binary.

Docker installs distribution FFmpeg/libvips components in the runtime image. Their exact distribution build, enabled codecs and LGPL/GPL/other obligations must be checked from the built image before publishing it; this document does not call every FFmpeg build LGPL. Keep image package metadata/notices and corresponding-source obligations. PostgreSQL, Caddy, Linux, Node and container base-image packages retain their own licences. A source-only npm inventory cannot replace the final image/binary inventory.

## Primary references

- [Vencord custom plugins](https://docs.vencord.dev/installing/custom-plugins/) and [source](https://github.com/Vendicated/Vencord).
- [Fastify documentation](https://fastify.dev/docs/latest/), [PostgreSQL](https://www.postgresql.org/docs/17/), [Discord developer documentation](https://discord.com/developers/docs/intro).
- [Sharp](https://sharp.pixelplumbing.com/), [FFmpeg legal information](https://ffmpeg.org/legal.html), [Docker Compose](https://docs.docker.com/compose/).
- [VitePress](https://vitepress.dev/), [rclone Drive backend](https://rclone.org/drive/), [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel).

External references may change. The committed source/lockfiles and release-specific notices identify the actual candidate; links do not establish that the current live website matches the pinned version.
