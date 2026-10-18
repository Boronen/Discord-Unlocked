# Configuration and public privacy notice

## Service boundaries

Run `node scripts/security-init.mjs` only as documented in [Operations](OPERATIONS.md); preserve generated per-service database URLs. Configuration belongs in ignored `secrets/`, with directory mode 0700 and files 0600 on Linux. On Windows use the supplied protection script. Host/container administrators can read environment files: Compose does not encrypt them at rest.

- `secrets/db.env`: PostgreSQL bootstrap configuration. Runtime applications do not use this account.
- `secrets/migrate.env`: migration database login; not a bot token.
- `secrets/api.env`: restricted API database login, Discord bot/application/guild/role/owner configuration, clean `PUBLIC_URL`, optional `SUPPORTER_ROLE_ID`, `STUDIO_V2_ENABLED`, and optional `PRIVACY_NOTICE_FILE`.
- `secrets/bot.env`: separate bot database login and the required Discord configuration. The API and bot need the bot token for their respective Discord operations; worker/migrations do not.
- `secrets/worker.env`: restricted worker database connection and media/tool paths only.
- `secrets/backup.key`, `rclone.conf`, alert credentials and readiness/journal configuration: independent operational secrets; never bundle with releases or documentation.

Authoritative parsers are `packages/server/config.ts` and the individual scripts. `deploy/api.env.example` is a template, not a working secret file. `PUBLIC_URL` must be a clean HTTPS origin without credentials/path/query/fragment; loopback HTTP is allowed for development. `BETA_ROLE_ID` is required for admission. Missing `SUPPORTER_ROLE_ID` leaves custom tints owner-only. The moderator role does not automatically grant supporter access.

Compose binds API port 3100 to host loopback; PostgreSQL has no host port. Compose supplies container `HOST`, media roots and exact proxy address. Trust only the actual proxy IP; never trust arbitrary forwarded headers. A Funnel directly targeting loopback differs from the optional Caddy route: confirm the real peer before changing `TRUST_PROXY`. Do not expose the database, Docker socket or decoder to the internet.

## Complete the privacy notice

The public `GET /v1/privacy/notice` returns generic handling defaults plus deployment facts. Without configuration it explicitly returns `configured:false`. The editor shows it before pairing and while signed in. A configured-but-invalid file prevents API startup; the error does not echo the file or internal path. There is no automatic legal-basis or region inference.

The operator supplied these publication facts for the intended community:

- Responsible individual/controller: **Kovács Kevin**.
- Project: **Discord Unlocked**; planned company/brand: **Boronen Games**. No registered-company operator is claimed.
- Country: **Hungary**.
- Privacy/security contact: **alisioboronen@gmail.com**.
- Source repository: [Boronen/Discord-Unlocked](https://github.com/Boronen/Discord-Unlocked).
- Intended hosting: an isolated Linux VM on the operator's Windows machine, exposed through Tailscale Funnel; private Google Drive for encrypted offsite backups.

Hosting/provider storage locations, international-transfer arrangements, legal bases and the rights/complaints process still require operator assessment. A provider's name does not establish its actual processing region. Earlier Oracle/DuckDNS/Caddy proposals are deployment alternatives, not claims about this installation. No paid resource is enabled by these instructions.

1. Copy `deploy/privacy-notice.example.json` to `secrets/privacy-notice.json` locally. Replace **every** placeholder and verify the provider list. Include Discord, the actual network/hosting and backup providers, and relevant music/artwork/Steam processing described in [Privacy](PRIVACY.md). The file is intended to become public through the endpoint; put no credentials, user records, internal paths or private diagnostics in it.
2. Review the legal basis, contact/rights process, provider locations and effective date. Placeholder values are rejected. `configured:true` means the schema is filled; it does not certify legal compliance or the truth of provider facts.
3. For Docker, add `deploy/privacy-notice.compose.example.yml` **after** your existing compose files. It read-only mounts the completed file and sets `PRIVACY_NOTICE_FILE` inside the API. Keep the same file set for subsequent lifecycle commands. The source file must exist before running Compose. The optional override is not enabled automatically.
4. For direct Node development, set `PRIVACY_NOTICE_FILE` in the API environment to the local completed file path.
5. Test in the candidate environment: request `/v1/privacy/notice` without Authorization, verify the displayed facts, then verify export/account/media endpoints still reject anonymous access. Restarting the API is required to load a changed notice; it is loaded once, not on each request.

**Update lifecycle limitation:** `deploy/update-studio-v2.sh` and `deploy/update-appearance-library.sh` currently reset `COMPOSE_FILE` to the base and production files. An inherited third override is therefore not preserved by these scripts. The backup timer installer also records that two-file set. Do not enable the optional notice mount on the live service and assume a later update will retain it. Before activation, adapt and rehearse every applicable update/restart/backup path with the same reviewed override, then verify that the notice remains configured after the rehearsal. The current deployment keeps the notice unconfigured while its wording and this lifecycle check remain pending.

Public launch also requires [readiness checks](ACCEPTANCE.md); an incomplete notice must not be presented as a completed launch gate. Never mark a readiness checkbox true just to bypass a failed test.

## Bounded storage and worker isolation

Use `deploy/prepare-storage.sh` on the isolated Linux VM, persist the exact mounts in `/etc/fstab`, reboot and verify them **before** starting Docker. A mounted ext4 root contains `lost+found`; the production override places PostgreSQL under `PGDATA=.../pgdata`. Do not delete a live database directory to fix initialization.

The worker reads quarantine and writes staging; it cannot mount final media. Its network guard allows only its restricted database operations, not external metadata or the home network. The API validates/promotes completed output. `compose.yml` contains memory, process, CPU, read-only-root, capability and logging bounds; `deploy/production.yml` selects bounded persistent storage and journald behavior. Test these on Linux; Windows-only static checks are not a worker-isolation acceptance test.

## Documentation site configuration

From the project root:

```sh
npm ci --prefix docs-site --ignore-scripts
npm run docs:check
npm run build --prefix docs-site
```

Only `docs-site` installs VitePress. Root runtime dependencies and Docker images do not include it. VitePress is pinned to stable 1.6.4; its build tool is explicitly overridden to patched Vite 6.4.4 after a dependency audit, with the combined build tested. Do not run the development server on a public interface.

For a GitHub project site set `DOCS_BASE=/Discord-Unlocked/` **in the build environment**; root/local preview uses `/`. The output is `docs-site/.vitepress/dist`. Publishing it to GitHub Pages is a separate owner action. CI builds a review artifact and has no Pages deployment permission. Search is bundled locally; no hosted search account is required. The ignored backup OAuth mini-site is excluded from this build.
