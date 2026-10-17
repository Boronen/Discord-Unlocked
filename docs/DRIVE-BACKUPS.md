# Google Drive backup operation

This is an alternative to the independently mounted destination in the original runbook. It uses the operator's own OAuth Desktop client with `drive.file`, already reauthorized after switching the Google application to In production. The application must not receive Drive credentials. Never add the recovery key to Drive.

## Install on the isolated Ubuntu host

Prerequisites: the production bounded filesystems are mounted; Node 24 is `/usr/local/bin/node`; Docker, rclone and flock are installed; the app has `secrets/backup.key` and an authorized `secrets/rclone.conf` with a remote named `psdrive`. The private `ProfileStudio-Automatic-Backups` Drive folder must exist. Keep the host root disk encrypted where available and the recovery key in a separate offline/password-manager copy.

Review `deploy/install-drive-backup.sh`, `deploy/activate-drive-backup.sh`, `scripts/drive-backup.mjs` and its library. Then run from the application directory:

```sh
sudo sh deploy/activate-drive-backup.sh --oauth-production-confirmed
```

This installs restricted operator credentials in `/etc/profile-studio-backup/`, preserves them on reruns and installs systemd units. The credentials are outside the application containers. It verifies an authenticated destination marker, makes a fresh consistent encrypted backup, uploads and downloads it for comparison, replicates the current recovery journal, runs application/database/storage/cloud checks and fetches an authenticated journal copy. Only after all steps pass are timers enabled.

An activation failure leaves timers unenabled on a new install. Diagnose using `sudo journalctl -u profile-studio-drive-backup.service -n 40 --no-pager` (or the journal/monitor unit). Provider error output and credentials are deliberately withheld by the Drive CLI. Never paste OAuth config contents into support. Stop existing timers before changing an already active installation.

## Schedule, limits and retention

- Snapshot: daily at 03:00 Europe/Budapest, with up to five minutes of random delay. Persistent scheduling catches a missed run when the machine returns.
- Journal: every minute, with two alternating encrypted slots and authenticated per-slot metadata. A failed upload must not replace the preceding valid slot. Each slot contains the API's retained recovery markers, not just the last minute's changes.
- Monitor: every five minutes. Failure produces a failed systemd unit. This is not an off-device alert: configure and test an operator notification route separately before setting the corresponding launch gate.
- Jobs share an exclusive host lock. Journal replication may be delayed during a consistent snapshot, while application writes are stopped. Investigate stale replication after the application restarts.
- Storage: at most 12 GiB under the dedicated Drive root, at least 1 GiB account headroom and a maximum 400 MiB snapshot. Thirty snapshots at that maximum plus the journal fit the configured root budget, but provider usage and local space are checked at runtime. A minimum 10 GiB host scratch space is required before creating a snapshot. The account may contain other data, which reduces actual available capacity.
- This free full-snapshot approach does **not** guarantee capacity for 50 users at the maximum profile quota. Pause onboarding when a job fails its budget check. Do not shorten retention or enable paid storage to silence an error. A separately tested deduplicating backend or a different independent destination is required if measured growth exceeds the free budget.
- Rotation deletes only exactly dated, authenticated, complete snapshot directories older than 30 days. Unknown files, extra files, migration directories and unsigned manifests are not automatically removed. Recognized expired Drive files are permanently deleted rather than retained in provider trash. Partial/unknown uploads require operator reconciliation; they are counted against the budget.

## Checks and recovery

```sh
sudo systemctl list-timers --all 'profile-studio-drive-*'
sudo systemctl start profile-studio-drive-monitor.service
sudo journalctl -u profile-studio-drive-monitor.service -n 20 --no-pager
```

Manual CLI operations must use the service environment and project directory:

```sh
sudo /usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/drive-backup.mjs status
sudo /usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/drive-backup.mjs fetch-journal /private/new-current-journal.psb
```

The journal download authenticates both slots where possible, checks ciphertext hashes and decryptability, chooses the newest authentic copy and refuses a copy more than five minutes old. After a prolonged outage, independently establish and reconcile the last possible erasures/revocations with the operator before restoring; do not bypass this check by editing timestamps. Pass the recovered `.psb` to `scripts/restore.mjs --journal-current` with the correct key and production `COMPOSE_FILE` environment. A database snapshot's own journal alone is not proof that later erasures are covered. Every restored session must be invalidated.

The original mounted-destination scripts remain available. Do not enable both destinations' timers without reviewing downtime, locks, retention and capacity together.
