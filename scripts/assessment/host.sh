#!/bin/sh
# Read-only Linux cgroup v2 baseline. Does not read environment or application data.
set -eu
sample() {
  for scope in /sys/fs/cgroup/system.slice/docker-*.scope; do
    [ -r "$scope/cpu.stat" ] || continue
    usage=$(awk '$1=="usage_usec" {print $2}' "$scope/cpu.stat")
    memory=$(cat "$scope/memory.current")
    peak=$(cat "$scope/memory.peak" 2>/dev/null || printf '0')
    role=unknown
    while read -r pid; do
      # Classify only; command lines are never printed or persisted.
      command=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
      case "$command" in
        *dist/server/main.js*) role=api ;;
        *dist/bot/main.js*) role=bot ;;
        *dist/server/worker.js*) role=worker ;;
        */netguard.mjs*) role=worker-egress ;;
        *postgres*) [ "$role" != unknown ] || role=database ;;
      esac
    done < "$scope/cgroup.procs"
    printf '%s %s %s %s %s\n' "$scope" "$role" "$usage" "$memory" "$peak"
  done
}
before=$(sample)
sleep 10
after=$(sample)
printf '{"kind":"Read-only cgroup v2 idle sample, ten seconds; cumulative memory peak is lifetime","containers":['
separator=
printf '%s\n' "$after" | while read -r scope role usage memory peak; do
  previous=$(printf '%s\n' "$before" | awk -v key="$scope" '$1==key {print $3}')
  [ -n "$previous" ] || continue
  printf '%s{"role":"%s","cpuUsecOver10s":%s,"memoryBytes":%s,"lifetimePeakBytes":%s}' "$separator" "$role" "$((usage-previous))" "$memory" "$peak"
  separator=,
done
printf ']}\n'
