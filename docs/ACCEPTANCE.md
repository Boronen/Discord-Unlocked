# Closed-beta acceptance evidence

Do not mark real-account, offsite or infrastructure checks passed merely because unit tests are green. Record date, tested image/Vencord commit, tester and evidence privately without tokens or raw private profile data. Move 5 → 20 → 50 only after the current stage remains healthy and its measured load fits free capacity. No public launch is performed by this repository.

## Automated gates

- Typecheck, server/preview/plugin builds and all meaningful tests.
- Account-bound pairing, sliding expiry, one/all device revocation, other-account device/asset denial.
- No anonymous profiles/catalog/media. Actual Authorization in native media requests. No profile fetch during remembered-session restoration; logout/account switch clears caches and playback.
- Guild/beta removal, fresh moderator/owner checks and Discord outage fail closed. Former-member privacy export/deletion remains authenticated and account scoped.
- Exact draft confirmation, expiry, edit invalidation, replay denial, parallel immutable moderation decisions, revocation/restore races.
- Input/output size, true signature, image/frame/audio budgets, pending/daily/byte/global quotas, interrupted decode and invalid staging output.
- Restricted worker role flags/table/function privileges; final volume absent/read-only; actual denied internet, LAN, host gateway and metadata connections. Use read-only privilege checks on live data; destructive denial probes belong only in disposable test databases.
- Retention and durable file deletion; erased account cannot regain access. Encrypted backup authentication, wrong-key/corruption denial and actual isolated PostgreSQL/media restore. A synthetic deletion fence and global session invalidation must pass after restore.
- No raw request IDs, song links, token values or IP addresses in logs. Synthetic secret/forbidden-path fixtures fail the scanner. Working tree, **all publishable commits**, source/userplugin ZIPs and all application image layers scanned; local secret values checked without printing them.

## Real Windows Discord gates (two accounts)

Use separate paired beta accounts/devices, with one moderator and the configured owner. Verify compact/full profile, chat/member/DM avatar geometry, animation, dark/light themes, keyboard focus and reduced motion. Confirm a non-plugin client sees the original Discord profile. Check Decor, USRBG and FakeProfileThemes with each feature toggle. Verify music activity changes, missing art, manual colors, explicit provider playback, close/switch/mute and blocked automatic audio fallback.

Confirm a reviewed design appears on both paired clients within 30 seconds. Remove a beta role, leave the guild, expire/revoke a session, disconnect and switch Discord accounts: private blobs and profiles must clear and no anonymous fallback request may occur. Export metadata and actual normalized media after guild departure; deletion immediately hides the account and removes active data within 24 hours. Test bot preview cleanup and reconcile older/untracked Discord messages.

Exercise owner publication: prepare, confirm via the bot, publish once; replay and changed-draft attempts fail. Try ordinary-user owner/moderation/catalog access, another user's media/draft/session IDs and concurrent approval/rejection. Confirm the prior profile stays visible until exact approval.

## Deployment and release gates

Validate fixed-address proxy header handling and decoder firewall after every host/network change. Check container memory/PID/CPU/read-only/non-root settings, bounded mounted filesystems and time-bounded logs. Fill a disposable test filesystem to prove uploads pause; never fill the live host or mutate approved media as a denial probe. Kill a decoder in the test deployment and verify leases/retries/cleanup. Test disk/backups/erasure-backlog alerts.

Run authenticated traffic representing 5, then 20, then 50 real viewers and their media/palette requests, on the actual free host/Funnel. Measure latency, errors, memory, disk growth, transfer and recovery time. Include concurrent upload/moderation and a service outage. Stop expansion if any quota, availability, backup capacity or 24-hour erasure deadline is at risk. Free hosting is not an uptime guarantee; do not auto-upgrade.

Confirm a real daily encrypted offsite copy and its rotation, independent backup-key custody and current journal replication. Test restoration at production data size, including deletion/revocation events later than the DB snapshot. If a current journal cannot be established, keep the restored service closed and reconcile erasures first.

Complete operator contact/controller/provider information, MFA/passkeys, token reset, private SSH, GitHub protections/private reporting, copyright/license review and release checksum review. Only then record truthful results in `secrets/readiness.json`, keep stage 5, and authorize the public proxy/Funnel.
