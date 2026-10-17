#!/bin/sh
# Run once with sudo on the isolated Linux VM, before the first production database.
set -eu
root=/srv/profile-studio
[ "$(id -u)" = 0 ] || { echo 'Run this storage setup with sudo.'; exit 1; }
mkdir -p "$root/images" "$root/storage"
[ "$(realpath "$root")" = /srv/profile-studio ] || exit 1
for entry in postgres:2048 input:256 staging:512 final:6144 journal:128 caddy-data:64 caddy-config:32; do
  name=${entry%:*}; size=${entry#*:}; image="$root/images/$name.img"; target="$root/storage/$name"
  [ ! -L "$image" ] && [ ! -L "$target" ] || { echo 'Refusing symbolic storage path.'; exit 1; }
  mkdir -p "$target"
  if [ ! -e "$image" ]; then
    # No existing filesystem is formatted. Each new file has a hard capacity.
    fallocate -l "${size}M" "$image"
    chmod 600 "$image"
    mkfs.ext4 -q -m 0 "$image"
  fi
  mountpoint -q "$target" || mount -o loop,nodev,nosuid,noexec "$image" "$target"
  case "$name" in postgres) chown 70:70 "$target" ;; *) chown 1000:1000 "$target" ;; esac
done
echo 'Bounded filesystems prepared. Persist these exact mounts in fstab and verify them after reboot before Docker starts.'
