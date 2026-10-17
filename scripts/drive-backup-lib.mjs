import { verifyManifest } from "./backup-crypto.mjs";

export const SNAPSHOT_FILES = ["database.psb", "journal.psb", "manifest.json", "media.psb"];
export const SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/;
export const DAY = 86400000;
export const GiB = 1024 ** 3;
export const JOURNAL_LIMIT = 16 * 1024 ** 2;

export function snapshotManifest(value, key) {
  const manifest = verifyManifest(value, key);
  if (
    manifest.version !== 2 ||
    manifest.legacy ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    Date.parse(manifest.createdAt) > Date.now() + 60000 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 3 ||
    new Set(manifest.files.map((f) => f.name)).size !== 3 ||
    manifest.files.some(
      (f) =>
        !["database.psb", "media.psb", "journal.psb"].includes(f.name) || !/^[a-f0-9]{64}$/.test(f.sha256),
    )
  )
    throw new Error("Invalid authenticated snapshot metadata.");
  return manifest;
}

export function assertSnapshotFiles(names) {
  if (JSON.stringify([...names].sort()) !== JSON.stringify(SNAPSHOT_FILES))
    throw new Error("Snapshot contains unexpected files; upload/rotation refused.");
}

export function enforceCapacity({ used, free, budget, incoming, snapshot = false }) {
  for (const n of [used, free, budget, incoming])
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Storage capacity could not be established.");
  if (snapshot && incoming > 400 * 1024 ** 2)
    throw new Error(
      "Snapshot exceeds the 400 MiB free-tier retention budget. Pause onboarding; no paid upgrade was made.",
    );
  if (used + incoming + 64 * 1024 ** 2 > budget || free < incoming + GiB)
    throw new Error("Insufficient verified cloud capacity. Pause onboarding; no paid upgrade was made.");
}

export function verifiedJournal(value, key, id, slot) {
  const result = verifyManifest(value, key);
  if (
    result.kind !== "profile-studio-journal" ||
    result.destinationId !== id ||
    result.slot !== slot ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes < 32 ||
    result.bytes > JOURNAL_LIMIT + 32 ||
    !/^[a-f0-9]{64}$/.test(result.sha256) ||
    !Number.isFinite(Date.parse(result.createdAt)) ||
    Date.parse(result.createdAt) > Date.now() + 60000
  )
    throw new Error("Invalid authenticated journal metadata.");
  return result;
}

export function expiredSnapshot(name, manifest, now = Date.now()) {
  if (!SNAPSHOT_NAME.test(name)) return false;
  const directoryTime = Date.parse(name.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3"));
  const created = Date.parse(manifest.createdAt);
  return (
    Number.isFinite(directoryTime) &&
    Math.abs(created - directoryTime) < 5 * 60000 &&
    created < now - 30 * DAY
  );
}
