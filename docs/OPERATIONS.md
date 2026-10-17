# Operator runbook

## Current boundary and prerequisites

Do not open the public proxy until the launch checklist is true and evidenced. Local Docker Desktop is for development; production is an isolated Linux VM. A directory named `secrets` is not encrypted by Compose. Restrict its ACL/mode and use an encrypted host disk. Keep `backup.key` in a separate offline/password-manager copy; never put it beside an offsite backup.

The operator must reset the previously disclosed Discord token, configure the dedicated beta role, assign that role only to the current 5/20/50 participants, enable MFA/passkeys, fill the controller/contact/provider details in PRIVACY.md and SECURITY.md and protect GitHub before public release. No script buys a domain, upgrades a cloud account or changes a paid plan.

## Free primary hosting

1. Choose an EU Oracle home region and **Always Free eligible** Linux VM/storage. Do not upgrade to Pay As You Go or select a resource merely covered by temporary trial credit. Set compartment quotas/budget alerts; alerts alone are not spending caps. Verify the Console's current free eligibility before every provision/change. The published allowance currently describes A1 **2 OCPUs / 12 GB total**, with 200 GB combined boot/block storage; availability and idle reclamation are not guaranteed. See [Oracle's current limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). If free capacity is unavailable, stop or use the fallback.
2. Use a dedicated OS operator, a separate SSH key and a private administration connection. Confirm a second private key-authenticated SSH session before applying `deploy/sshd-profile-studio.conf`. Expose only 80/443 through host/cloud rules. Keep SSH private, PostgreSQL unpublished and Docker accessible only to the operator. Docker-group membership is host-root-equivalent.
3. Create a free [DuckDNS hostname](https://www.duckdns.org/about.jsp). Store its update token privately outside the application containers; update DNS from the VM/operator, never the decoder. Point the hostname to this VM. Set `PUBLIC_URL=https://your-name.duckdns.org` in both API/bot env files and `CADDY_DOMAIN=your-name.duckdns.org` in `.env`.
4. Prepare bounded storage **before initial production data**, using `sudo sh deploy/prepare-storage.sh`. The script creates new fixed-size filesystem images only: PostgreSQL 2 GiB, input 256 MiB, staging 512 MiB, final 6 GiB, journal 128 MiB and small Caddy volumes. It refuses symlink targets and does not format an existing image. Persist the exact mounts in `/etc/fstab`, reboot and verify every mount before Docker can start. Add a systemd mount dependency; do not allow an unmounted bind directory to silently use the host root filesystem. Review capacity as the beta grows. Do not reuse a populated Desktop data volume as this fresh Linux bind volume; use the encrypted restore procedure.
5. Install `deploy/journald-profile-studio.conf` as a journald drop-in and use a journald Docker logging override in production. Set a 30-day maximum retention and 128 MiB host log cap. The default local Compose uses bounded 5 MiB × 3 JSON log files per service; it does not provide a time-based 30-day retention guarantee. Never enable raw API/Caddy access logging. API logs contain request IDs, route templates and status codes.
6. Build the app, restricted worker firewall and rootless proxy. Initialize secrets, start the database, run the scoped role bootstrap/migrations, configure an independent backup destination and verify restoration. The PostgreSQL admin credential stays only in the DB/operator configuration; migration, API, bot and decoder passwords differ. The worker does not receive the bot token, final media, journal or a Docker socket.
7. Copy `deploy/readiness.example.json` to `secrets/readiness.json`. Fill a monitored contact, a recent verification date and only checks actually completed. Keep the target stage at 5 initially. `launch-check` refuses incomplete flags; it does not replace evidence. Do not set a flag to bypass a missing test.

```sh
docker compose build api worker-egress proxy
docker compose -f compose.yml -f deploy/production.yml --profile production up -d
```

The Caddy proxy handles HTTPS; direct API port 3100 remains loopback only. The API trusts forwarded client addresses solely from Caddy's fixed internal IP. All other forwarded headers are ignored. Every internal service uses a distinct fixed address to avoid address allocation collisions. If these private subnets overlap a real site network, change **all** Compose addresses, worker firewall rules, generated database URLs and trusted-proxy settings together and rerun isolation tests.

The production override initializes PostgreSQL in `postgres/pgdata`, below the mounted filesystem's `lost+found` directory, and gives its socket tmpfs to the image's PostgreSQL UID/GID 70. Apply this layout to a new, empty production database before restoring a logical backup. An existing cluster stored directly at the volume root must be migrated explicitly; changing `PGDATA` alone does not move that cluster.

## Isolated home-machine fallback

Use a dedicated Linux VM with no shared Windows folders, clipboard/filesystem passthrough, personal credentials or Docker socket mounts. Keep administration private through Tailscale; enable Funnel only for HTTPS to the loopback API. No router port forwarding. Use the stable assigned `*.ts.net` URL as `PUBLIC_URL` in both service env files. Do not trust client-supplied forwarding headers; keep the current proxy trust disabled/unchanged when bypassing Caddy. Per-account limits still apply when requests share the Funnel relay connection address.

[Funnel](https://tailscale.com/docs/features/tailscale-funnel) is public and has non-configurable bandwidth limits. Measure your actual deployment at each beta stage before opening it. A Funnel URL is public routing, not user authorization: profile/media routes still require pairing and the beta role. Use a private, independently controlled offsite backup destination and stop if storage/transfer would exceed its free allowance. Full daily archives at maximum media usage can exceed free object-storage quotas; do not claim 30-day offsite coverage until measured capacity is sufficient. An independently managed encrypted, deduplicating backup system may replace full archives after its restore process passes the same gates. No paid capacity is silently enabled.

## Backups and restoration

For the Google Drive operator setup, see [Drive backup operation](DRIVE-BACKUPS.md). Its direct API backend verifies destination identity, uploads by rclone, downloads for comparison and maintains authenticated alternating journal copies without a cloud filesystem mount. It has its own installation and timer units; do not point the mounted-destination jobs at a normal local folder as a substitute.

`node scripts/backup-secure.mjs [destination]` stops API/bot/worker briefly, streams `pg_dump` and normalized media/input through AES-256-GCM encryption and restarts previously running services in `finally`. No plaintext database dump or media archive is staged. Staging output is omitted: pending jobs can decode again. `journal.psb` captures the separate security journal. A manifest is written only after every archive succeeds. Store encrypted backups as personal data; test the key before relying on them.

`OFFSITE_BACKUP_DIR` must name an independently mounted private destination (for example an operator-machine SSHFS mount, or a private free object-storage mount). A second folder on the server is not an offsite copy. `node scripts/daily-backup.mjs` creates a backup, copies it, verifies checksums and rotates only recognized v2 snapshot directories older than 30 days in both destinations. An unavailable/full destination fails the run and retains old snapshots. Install the provided service/timer only after adjusting the operator/path and `secrets/backup.env`; enable it using systemd. Watch failed units. A successful local archive alone does not satisfy offsite backup readiness.

Replicate the **current** erasure/revocation journal independently of database snapshots (at least after each erasure/revocation and before a restore). Keep its encrypted offsite copy current; do not restore a database if the latest journal cannot be established. The API and bot share a dedicated append/sync journal volume containing only event type, hashed target and timestamp, kept for 31 days. Never replace that volume with an old snapshot. A total loss after the last independent journal copy needs manual reconciliation of later erasures/revocations with the operator before opening access.

First test on a disposable database:

```sh
node scripts/restore-drill.mjs backups/SNAPSHOT_DIRECTORY
```

This creates a random named, network-isolated temporary PostgreSQL container and temporary media filesystem. It authenticates/decrypts the backup, actually restores PostgreSQL/media, adds a synthetic deleted account/session and verifies recovery fences. Only its own temporary container is removed. The bounded drill filesystem intentionally fails if more capacity is needed; size a private scratch disk and repeat at production scale before checking the load/restore gates.

For a real replacement, first make a new encrypted backup of the current installation, confirm downtime, obtain the latest independently retained journal and run:

```sh
node scripts/restore.mjs backups/SNAPSHOT_DIRECTORY --replace-current-data --journal-current /private/latest-journal.jsonl
```

The script authenticates each archive before use, refuses snapshots older than 30 days, stops services, restores media/database, migrates/grants, replays current erasures/revocations, clears all sessions/pairings/owner confirmations and resets pending decoder leases. It keeps services stopped on failure. It never silently starts an unfenced old database. Current tombstones must accompany a moved server as well. Account deletions are purged during API startup before public listening. Every device must pair again.

The backup manifest is HMAC authenticated as well as the encrypted archives, so its creation time cannot be edited to bypass the 30-day recovery boundary. Older development snapshots without an authenticated manifest are not accepted by automated restore; create and test a fresh backup before relying on the automated procedure.

## Monitoring, updates and emergency stop

Check `/health`, container health/restarts/OOM, mount capacity, oldest pending job, file-deletion backlog, moderator-message deletion backlog, last successful offsite backup and current-journal replication. Use request IDs, not raw tokens or profile lists, when investigating. Alert locally/private operator monitoring when any service is unhealthy for five minutes, disk free drops below 15%, backups are over 26 hours old, pending processing is over five minutes or erasure cleanup is over one hour. Pause onboarding immediately if those persist; address erasure failures before the 24-hour deadline.

Apply OS security updates regularly, review weekly dependency/image notifications, build and scan a new image, test it locally, make a backup and roll it through the 5-person stage. Do not automatically merge dependency or GitHub Action changes. Verify pinned Vencord compatibility with two real Windows accounts after Discord/Vencord changes.

Emergency stop: disable Funnel/public proxy, `docker compose stop api bot worker`, revoke a compromised Discord token, and use the PostgreSQL administrator to invalidate all sessions if needed. Keep the DB and security journal privately for investigation/recovery. Never run `down -v` as an incident response; it destroys recovery data. Do not start the old single-superuser Compose configuration after migration.

## Verified support after session expiry

The operator verifies the requesting Discord account through a private Discord conversation with that same account (not a screenshot, display name, claimed ID or a Discord token). Record the verification method and minimum request details privately; do not ask for passwords or tokens. For an expired-session former member, the operator can use the local data-subject administrative tool after verification to export only that account or erase it. Transfer an export through a protected, expiring channel and remove the temporary copy. Do not give a former member general beta/admin credentials or edit another account because a requester supplied an ID. Delete corresponding moderation-channel preview messages; the bot's tracked cleanup should do this automatically, but verify it and reconcile older/untracked messages manually.

## Incidents

Record awareness time, affected versions/data, evidence, containment actions and decisions in private operator notes. Revoke leaked credentials before cleaning repositories. Evaluate the risk to individuals and document the decision. Where GDPR notification is required, evaluate the 72-hour supervisory-authority deadline and high-risk individual notification using [EDPB guidance](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en); obtain appropriate legal assistance for the actual deployment. Publish a factual, minimal user notice through the authorized community process. Preserve evidence securely, correct the root cause and repeat restoration/isolation/secret scans before reopening.

## GitHub release

Set a GitHub noreply author email before the first public commit if desired. Add only reviewed source, migrations and placeholder config; never use `git push --mirror` (the local app can keep private recovery tree refs). Run the secret scanner before staging/committing and after preparing ZIPs/images. If a committed secret is found, rotate it, clean publication history with a reviewed migration, and rescan every release/image; `.gitignore` alone cannot fix history.

Enable branch/ruleset protection with required CI/review, push protection/secret scanning where available, Dependabot and private vulnerability reporting. CI uses pinned Actions, read-only permissions and no deployment secret. Source candidate ZIPs/checksums are artifacts only: publish a reviewed GitHub release manually once all launch gates pass. Keep GPL attribution; never redistribute shop media, user uploads, Discord caches or music recordings with the code.

## Installed helper commands and migration cleanup

`node scripts/journal-backup.mjs` writes authenticated encrypted `latest-journal.psb` into `OFFSITE_BACKUP_DIR`. Install its one-minute service/timer and verify it after erasure/revocation; restore accepts this encrypted file directly with `--journal-current`. The backup key stays separate. `node scripts/monitor.mjs` reports health/backlog/storage/backup status. Install its timer and connect failures to private operator alerts; actual alert delivery is an operator setup gate, not a notification service silently configured by the code.

Configure `secrets/backup.env` using `deploy/backup.env.example`. Generate a UUID and create `.profile-studio-offsite-id` containing it **on the mounted independent destination**, then set the same `OFFSITE_BACKUP_ID` locally. The unmounted local mountpoint must not contain a copy of this marker. Backups/journal replication fail if it is absent or different, preventing a disconnected remote mount from silently becoming a local folder. This verifies mount identity, not geographic independence: the operator must still verify that the destination is physically off-machine.

After verifying the same Discord identity privately, `node scripts/support-export.mjs VERIFIED_DISCORD_ID --identity-verified` writes a private ignored ZIP, without PowerShell binary-redirection corruption. For requested erasure use `docker compose run --rm -T --no-deps api node dist/server/privacy-admin.js delete VERIFIED_DISCORD_ID --identity-verified`. These are privileged local tools, not unauthenticated recovery endpoints. Review the target and keep minimal support evidence private for at most 30 days.

For a first capacity smoke test, create ignored `secrets/load-test.json` with a clean API `base` and exactly 5/20/50 consented, separately paired account `tokens`, then run `node scripts/load-test.mjs --authorized-stage-test`. It limits transfer to 128 MiB and records aggregate counts/latency only. Never send the file to support or GitHub. This does not replace real Discord rendering, concurrent uploads/moderation, host metrics or Funnel measurements. Remove the temporary sessions/file after testing.

On migration, old `profile-studio_media` is initially retained for recovery. After matching-file verification and a successful encrypted restore drill, obtain explicit operator approval before removing the original copy. Until removed or separately archived under an approved encrypted retention policy, keep `legacyPlaintextRemoved` false; public launch is blocked. Do not claim complete active-storage erasure while a plaintext legacy copy remains.
