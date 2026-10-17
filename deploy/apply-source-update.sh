#!/bin/sh
# Runs only when the operator explicitly invokes this prepared update with sudo.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run this prepared update with sudo sh.'; exit 1; }
[ "$#" = 2 ] || { echo 'Usage: apply-source-update.sh source.zip sha256'; exit 1; }
archive=$(realpath -- "$1")
expected=$2
case "$expected" in *[!a-f0-9]*|'') echo 'Invalid expected SHA-256.'; exit 1;; esac
[ "${#expected}" = 64 ] || { echo 'Invalid expected SHA-256.'; exit 1; }
scratch=$(mktemp -d /tmp/profile-studio-source-update.XXXXXX)
chmod 700 "$scratch"
trap 'rm -f -- "$scratch/source.zip"; rmdir -- "$scratch"' EXIT HUP INT TERM
cp -- "$archive" "$scratch/source.zip"
archive="$scratch/source.zip"
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
[ -f "$app/compose.yml" ] && [ -d "$app/secrets" ] && [ -f "$app/deploy/production.yml" ] || {
  echo 'Run from deploy/ or updates/ inside the existing Profile Studio project.'; exit 1;
}
cd "$app"
umask 077
mkdir -p backups
exec 9>backups/.drive-job.lock
flock -w 180 9
/usr/local/bin/node --input-type=module - "$archive" <<'JS'
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
const files = unzipSync(readFileSync(process.argv[2]));
for (const path of Object.keys(files)) {
  if (path.includes('\\') || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.') ||
      !/^(?:packages|migrations|scripts|deploy|preview|docs|tests|\.github)\/|^(?:package(?:-lock)?\.json|tsconfig(?:\.build)?\.json|vitest\.config\.ts|vite\.config\.ts|vencord-version\.json|premium-ui\.json|\.env\.example|\.gitignore|\.dockerignore|\.prettierrc\.json|Dockerfile|compose\.yml|README\.md|DESIGN\.md|UX-CONTRACT\.md|LICENSE|SECURITY\.md|PRIVACY\.md)$/.test(path))
    throw new Error('Unexpected source archive path.');
}
console.log('Source archive paths verified. Local secrets and data are not part of this update.');
JS
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf "backups/source-before-update-$stamp.tar.gz" packages migrations scripts deploy package.json package-lock.json Dockerfile compose.yml tsconfig.json tsconfig.build.json
/usr/local/bin/node --input-type=module - "$archive" <<'JS'
import { readFileSync, writeFileSync, mkdirSync, renameSync, lstatSync, chmodSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { unzipSync } from 'fflate';
const app = process.cwd();
for (const [name, data] of Object.entries(unzipSync(readFileSync(process.argv[2])))) {
  const target = resolve(app, name);
  if (!target.startsWith(app + '/')) throw new Error('Unsafe update target.');
  let parent = app;
  for (const part of relative(app, target).split('/')) {
    parent = resolve(parent, part);
    try { if (lstatSync(parent).isSymbolicLink()) throw new Error('Source update refuses symbolic links.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  mkdirSync(dirname(target), {recursive:true});
  // File creation modes are masked by the private operator umask. Explicitly
  // normalize allowlisted source paths; secrets, data and backups stay private.
  for (let directory = dirname(target); directory !== app; directory = dirname(directory))
    chmodSync(directory, 0o755);
  const temporary = target + '.update-' + process.pid;
  writeFileSync(temporary, data, {flag:'wx', mode:0o644});
  chmodSync(temporary, 0o644);
  renameSync(temporary, target);
}
JS
(umask 022; /usr/local/bin/npm ci --ignore-scripts --no-audit --no-fund)
flock -u 9
exec 9>&-
# Existing updater takes an encrypted consistent backup, keeps the previous image,
# scans the candidate image and rehearses restoration before changing live services.
sh deploy/update-studio-v2.sh
curl -fsS --max-time 5 http://127.0.0.1:3100/health
printf '\nUpdate complete. Reopen the editor in the matching Windows client and check Music priority.\n'
