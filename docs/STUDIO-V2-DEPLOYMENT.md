# Studio v2 deployment

Use the existing isolated Linux VM. Preserve `secrets/`, the security journal, all mounted storage and the encrypted backup key. Do not rerun secret generation or replace local configuration with examples.

1. Build and test the source, then transfer the source archive to the VM. Extract it over the project directory without deleting operator files. The source archive never contains `secrets/` or user data.
2. From `~/profile-studio`, install the locked host-side tools with `npm ci --ignore-scripts --no-audit --no-fund`, then run `sudo sh deploy/update-studio-v2.sh`. Enter the Linux password in your SSH terminal; never send it in chat. This takes a consistent encrypted database/media/journal backup, retains the old image, builds and scans the new image, and rehearses forward migrations and recovery in an isolated PostgreSQL container. A failed scan or rehearsal does not change the live database.
3. Only after rehearsal succeeds, writers stop, migration `006_studio_workspace` and current grants apply, and the new services start. Check `sudo docker compose -f compose.yml -f deploy/production.yml ps` and the `/health` endpoint.
4. Upgrade the owner client with the matching Windows ZIP. Test a separate preset, save, review and explicit activation. Existing v1 profiles remain readable; old clients cannot overwrite v2 profiles. Test a second account before sharing the ZIP further.
5. Keep the encrypted pre-migration backup and retained image for the rollback window. Create and verify a fresh post-migration offsite backup with the existing scheduled backup procedure.

`STUDIO_V2_ENABLED=false` in the local API environment disables the new editor endpoints. It does not undo the database migration or discard v2 data. Existing published profiles can still be read. Restart the API after changing this operator setting. Do not distribute a new feature set while its acceptance checks remain unverified.

## Recovery

On migration or health failure, the updater leaves API, bot and worker stopped. Do not retag the old image and start it against the expanded database. Prefer fixing forward with the new image and intact data.

If replacing data is necessary, obtain the latest independently retained security journal first. Use `scripts/restore.mjs` with the authenticated encrypted backup and `--journal-current`, following the existing recovery procedure. The current migration code runs before recovery fences, so an older backup is upgraded safely. All sessions are invalidated; erasures and revocations, including shared-media descendants, are reapplied. Restoring an old application image also requires a verified compatible database snapshot and a recovery tool that understands the current journal kinds. Never remove new journal entries to make an older tool accept them.

The rehearsal uses a bounded temporary media filesystem. A backup that cannot fit that filesystem must not be silently skipped; provide an adequately sized isolated restore target and repeat the test before deployment.

### Candidate image cannot read package.json

`ERR_INVALID_PACKAGE_CONFIG` together with `permission denied` during candidate migrations can result from root-owned source files extracted with a private `077` umask. Node runs as the unprivileged `node` user, so a root-owned `0600` package manifest is unreadable. Source extraction now explicitly sets allowlisted source files to `0644` and source directories to `0755`; it preserves private permissions for secrets, backups and data. The Dockerfile independently normalizes application-code permissions and checks read access with the runtime user during the build.

With the matching repair scripts installed, run `sudo sh deploy/repair-image-permissions.sh` from the project. This adds a local, network-isolated permission layer to the already-built candidate. It does not reinstall dependencies or compile the application. It then invokes the normal updater with the exact immutable image ID. A fresh encrypted backup, the complete image secret scan, isolated migration/recovery/media tests and health checks remain required. The rollback image is taken from the running API container rather than the candidate tag. A failed build, scan or rehearsal leaves the existing services running; the backup phase pauses and resumes writers to capture a consistent snapshot.

## Small-card hover, large GIF and music-priority update

Hover and GIF changes are client-only. The optional `musicPriority` profile field needs the matching API/bot image; no new table or migration is required. Older configurations remain readable. A client connected to an older API keeps the new priority choice disabled instead of submitting an unsupported field.

For a source archive already staged in the existing project's `updates/` folder, the prepared `run-latest-update.sh` invokes `apply-source-update.sh` with the archive's fixed SHA-256. Review those files, then run `sudo sh updates/run-latest-update.sh` from the project. Enter the Linux password only in the SSH terminal. Source extraction preserves secrets/data, refuses unsafe archive paths and symbolic-link targets, retains previous application source, and invokes the existing encrypted-backup/image-scan/restore-rehearsal updater. A verified source copy is held in a root-private temporary directory during extraction.

After health succeeds, install the matching Windows ZIP and reopen the editor. **Music → Music priority → Current Discord music first** becomes available when the authenticated capability response advertises support. Save and submit normally; do not bypass moderation to enable this preference for ordinary users.
