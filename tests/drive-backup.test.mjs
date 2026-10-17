import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sealManifest } from "../scripts/backup-crypto.mjs";
import {
  SNAPSHOT_FILES,
  DAY,
  GiB,
  assertSnapshotFiles,
  enforceCapacity,
  snapshotManifest,
  expiredSnapshot,
  verifiedJournal,
} from "../scripts/drive-backup-lib.mjs";

test("Drive rotation accepts only complete authenticated snapshots, never a key or extra file", () => {
  const key = randomBytes(32);
  const createdAt = new Date(Date.now() - 31 * DAY).toISOString();
  const unsigned = {
    version: 2,
    legacy: false,
    createdAt,
    files: ["database.psb", "media.psb", "journal.psb"].map((name) => ({ name, sha256: "a".repeat(64) })),
  };
  const signed = sealManifest(unsigned, key);
  const manifest = snapshotManifest(signed, key);
  assertSnapshotFiles(SNAPSHOT_FILES);
  assert.throws(() => assertSnapshotFiles([...SNAPSHOT_FILES, "backup.key"]));
  assert.throws(() => assertSnapshotFiles(SNAPSHOT_FILES.slice(1)));
  assert.throws(() => snapshotManifest({ ...signed, createdAt: new Date().toISOString() }, key));
  assert.throws(() =>
    snapshotManifest(
      sealManifest({ ...unsigned, files: [...unsigned.files.slice(1), unsigned.files[1]] }, key),
      key,
    ),
  );
  assert.throws(() =>
    snapshotManifest(
      sealManifest(
        {
          ...unsigned,
          files: [...unsigned.files.slice(1), { name: "../backup.key", sha256: "a".repeat(64) }],
        },
        key,
      ),
      key,
    ),
  );
  assert.equal(expiredSnapshot(createdAt.replaceAll(":", "-"), manifest), true);
  assert.equal(expiredSnapshot("vm-migration-old", manifest), false);
  assert.equal(expiredSnapshot(new Date().toISOString().replaceAll(":", "-"), manifest), false);
});

test("Drive free-tier budgets fail closed for unknown capacity, oversized snapshots and exhausted space", () => {
  const safe = { used: GiB, free: 10 * GiB, budget: 12 * GiB, incoming: 2 * 1024 ** 2, snapshot: true };
  enforceCapacity(safe);
  assert.throws(() => enforceCapacity({ ...safe, free: undefined }));
  assert.throws(() => enforceCapacity({ ...safe, free: -1 }));
  assert.throws(() => enforceCapacity({ ...safe, free: GiB }));
  assert.throws(() => enforceCapacity({ ...safe, used: 12 * GiB }));
  assert.throws(() => enforceCapacity({ ...safe, incoming: 401 * 1024 ** 2 }));
});

test("a recovery journal is bound to the destination, slot, authenticated digest and bounded age metadata", () => {
  const key = randomBytes(32),
    id = "11111111-1111-4111-8111-111111111111";
  const plain = {
    kind: "profile-studio-journal",
    destinationId: id,
    slot: 0,
    createdAt: new Date().toISOString(),
    sha256: "a".repeat(64),
    bytes: 64,
  };
  const signed = sealManifest(plain, key);
  assert.deepEqual(verifiedJournal(signed, key, id, 0), plain);
  assert.throws(() => verifiedJournal(signed, key, id, 1));
  assert.throws(() => verifiedJournal(signed, key, "22222222-2222-4222-8222-222222222222", 0));
  assert.throws(() => verifiedJournal({ ...signed, sha256: "b".repeat(64) }, key, id, 0));
  assert.throws(() => verifiedJournal(sealManifest({ ...plain, bytes: 20 * 1024 ** 2 }, key), key, id, 0));
  assert.throws(() =>
    verifiedJournal(
      sealManifest({ ...plain, createdAt: new Date(Date.now() + DAY).toISOString() }, key),
      key,
      id,
      0,
    ),
  );
});
