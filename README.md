# Discord Unlocked

Discord Unlocked is a Windows Discord / Vencord userplugin for shared animated avatars, decorations, banners, profile effects, favorite songs and music-card styling. Profiles are immutable, moderated revisions. Music Presence remains a separate application; this plugin styles its existing Discord activity.

**Release status: closed beta preparation.** One community, a dedicated beta role and at most 50 enrolled accounts. Viewing profiles and uploaded media requires pairing and current community access. This does not change a Discord Nitro subscription or purchase. Authorized viewers can save what they see.

The repository contains an API, PostgreSQL migrations, a restricted offline decoder, a Discord upload/moderation bot and the Vencord editor. No cloud account, paid plan, GitHub publication or public endpoint is created by these scripts. Public launch is blocked by `secrets/readiness.json` until its checks are verified. Start with [the operations guide](docs/OPERATIONS.md), [security policy](SECURITY.md), [privacy notice](PRIVACY.md) and [acceptance checks](docs/ACCEPTANCE.md).

The planned company/brand name is **Boronen Games**. The current operator is an individual; no incorporated company is claimed. Existing releases call the profile editor/plugin **Profile Studio**. Those plugin identifiers, service names, paths and saved settings stay compatible; this documentation naming change does not rename them.

## Documentation

[Join Discord Unlocked](https://discord.gg/S42hjgbcCk) · Read `rules` and request admission in `beta-access`. The owner manually assigns **Beta Tester** to admitted adults (18+); joining or installing does not automatically grant access.

Download the prebuilt Windows client from [GitHub Releases](https://github.com/Boronen/Discord-Unlocked/releases). The [searchable documentation site](https://boronen.github.io/Discord-Unlocked/) is published separately from application releases.

Start at the [documentation index](docs/index.md): user installation and feature walkthroughs, API contracts, configuration, development, sources/licences and contribution recognition. The searchable site builds separately with `npm ci --prefix docs-site --ignore-scripts` and `npm run build --prefix docs-site`; it is not automatically published. See [Configuration](docs/CONFIGURATION.md) to complete the public privacy notice before release. Target source repository: [Boronen/Discord-Unlocked](https://github.com/Boronen/Discord-Unlocked).

## Local server setup

Requirements: Node.js 24, Docker Engine/Desktop with Linux containers and Compose v2.24.4+, and a Discord bot application. Keep the database and API on the isolated machine; never mount personal folders or the Docker socket into application containers.

```powershell
npm ci
node scripts/security-init.mjs
```

The initializer creates separate, ignored `secrets/api.env`, `bot.env`, `worker.env`, `migrate.env` and `db.env`, and a separate backup key. Fill the API and bot files locally using [the example](deploy/api.env.example). Both require the new bot token and the application, guild, beta-role, moderator-role, moderation-channel and owner IDs. Never paste tokens into a chat or issue. Revoke any previously disclosed token in the Discord Developer Portal before launch.

On Windows, run `powershell -File scripts/protect-secrets.ps1` as your normal account after configuring secrets. On Linux use `chmod 700 secrets; chmod 600 secrets/*`. Compose environment files are not encryption at rest; Docker administrators and the host operator can read them.

For a **new database**:

```powershell
docker compose build api worker-egress
docker compose up -d db
node scripts/security-migrate.mjs
docker compose ps
```

For an **existing installation**, first make and authenticate an encrypted backup with the existing Compose version (`node scripts/backup-secure.mjs --legacy`), then initialize secrets and migrate. `security-migrate.mjs` transfers only application objects, disables the legacy login, and copies UUID media into separate volumes without removing the original volume. PostgreSQL's original bootstrap role may be protected from demotion; it is disabled and never used by runtime services. Do not run a second PostgreSQL cluster against the same data directory.

The API is `http://localhost:3100`, bound to loopback; the database has no host port. No beta role means access stays closed. Include yourself in the configured community beta role. The bot needs `bot` and `applications.commands` scopes and View Channel, Send Messages, Embed Links and Attach Files in the private moderation channel. It does not need Administrator or Message Content intent. Turn off “Requires OAuth2 Code Grant” for a conventional bot invite.

## Vencord installation

This is a source userplugin, not a BetterDiscord `.plugin.js` file. The supported Vencord commit is `32c90633ce6a95d7e56c95479efbb431bacf1eac`.

```powershell
git clone https://github.com/Vendicated/Vencord.git .vendor/Vencord
git -C .vendor/Vencord checkout 32c90633ce6a95d7e56c95479efbb431bacf1eac
pnpm --dir .vendor/Vencord install --frozen-lockfile
npm run plugin:check
npm run plugin:build
```

Follow [Vencord's custom-plugin installation instructions](https://docs.vencord.dev/installing/custom-plugins/) to install the built Vencord. Building alone does not patch Discord. Set `VENCORD_PATH` to use a different source checkout. Enable **ProfileStudio**, configure the API URL and open its editor. Pair once using `/profile connect`; the service session is stored through Windows encrypted storage and renews with authenticated use for up to 90 days of inactivity. Discord account/API switches clear in-memory profiles, blobs and playback. Sign out explicitly to remove the saved session.

Upload using `/profile upload`, choose media in the editor, save and submit. The previous approved appearance stays visible until a moderator approves that exact revision. Moderation buttons and `/profile-mod` commands recheck the community, beta and moderator roles with Discord. Owner publication requires a fresh **Prepare test publication → `/profile confirm` → Publish confirmed draft** sequence. The code expires after five minutes, works once and becomes invalid if the draft changes.

**Account, devices and privacy** lists sessions, signs out one/all devices, exports account data with normalized media to a ZIP and deletes the account. Export and erasure remain authenticated but do not require continued guild membership. With an expired session, use the verified support procedure in the operations guide.

Favorite Spotify, Apple Music and YouTube song links open an isolated provider player only after **Play**. Playback depends on that provider and the viewer's account. No music stream or listening history is collected. Shop catalog selection uses items available to the Discord client; store media and third-party music are not bundled in releases. Availability is not guaranteed.

## Validation and release candidates

```powershell
npm run typecheck
npm test
npm run build
npm run plugin:check
npm run preview:build
npm run security:scan
node scripts/security-scan.mjs --image profile-studio:local
npm run release
```

The scanner checks working files, Git objects, publication history, release ZIPs and (when requested) all image layers against token/key patterns and current local secret values. A clean scan is evidence, not a guarantee against every kind of secret. The `.gitignore` cannot remove an already committed secret. Never mirror-push local Codex recovery refs. Review source candidates and checksums before a manually approved GitHub release; CI has read-only repository access and does not publish.

See [the deployment guide](docs/OPERATIONS.md) for Oracle Always Free + DuckDNS/Caddy, the isolated-VM/Funnel fallback, disk limits, encrypted offsite backups, restoration and incident response. Real two-account Windows Discord tests and free-host load tests remain launch gates. Discord [prohibits client modification](https://discord.com/safety/platform-manipulation-policy-explainer); this project cannot promise freedom from account sanctions.

Licensed GPL-3.0-or-later. Keep copyright notices and third-party license attribution. Vencord and Music Presence are separate projects and are not included in the source ZIP.
