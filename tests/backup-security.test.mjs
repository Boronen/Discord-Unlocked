import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encrypt, decrypt, discard, sealManifest, verifyManifest } from "../scripts/backup-crypto.mjs";
import { scanBuffer, scanZip } from "../scripts/security-scan.mjs";
import { zipSync, strToU8 } from "fflate";
import { verifyOffsite } from "../scripts/offsite.mjs";
test("backup authentication rejects modified ciphertext and the wrong key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ps-backup-"));
  try {
    const path = join(directory, "test.psb"),
      key = randomBytes(32),
      plain = Buffer.from("private database contents");
    await encrypt(Readable.from([plain]), path, key);
    assert.equal((await readFile(path)).includes(plain), false);
    const parts = [];
    await decrypt(
      path,
      new Writable({
        write(chunk, _encoding, done) {
          parts.push(chunk);
          done();
        },
      }),
      key,
    );
    assert.deepEqual(Buffer.concat(parts), plain);
    const empty = join(directory, "empty.psb");
    await encrypt(Readable.from([]), empty, key);
    await decrypt(empty, discard(), key);
    await assert.rejects(decrypt(path, discard(), randomBytes(32)));
    const bytes = await readFile(path);
    bytes[20] ^= 1;
    await writeFile(path, bytes);
    await assert.rejects(decrypt(path, discard(), key));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("the scanner rejects fixture secrets and forbidden archive paths without printing values", () => {
  const fixture = ["ghp_", "a".repeat(36)].join("");
  assert.deepEqual(scanBuffer(Buffer.from(fixture)), ["GitHub token"]);
  const escapedKey = ["-----BEGIN ", "PRIVATE KEY-----\\n", "a".repeat(64)].join("");
  assert.deepEqual(scanBuffer(Buffer.from(escapedKey)), ["private key"]);
  const findings = scanZip(zipSync({ "secrets/private.env": strToU8(fixture) }));
  assert.equal(findings.length, 2);
  assert.equal(JSON.stringify(findings).includes(fixture), false);
  assert.equal(scanZip(zipSync({ ".env.example": strToU8("DISCORD_BOT_TOKEN=\n") })).length, 0);
});
test("an unavailable offsite mount cannot silently become a local backup destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ps-offsite-")),
    id = "11111111-1111-4111-8111-111111111111";
  try {
    await assert.rejects(verifyOffsite(directory, id));
    await writeFile(join(directory, ".profile-studio-offsite-id"), id);
    assert.equal(await verifyOffsite(directory, id), directory);
    await rm(join(directory, ".profile-studio-offsite-id"));
    await assert.rejects(verifyOffsite(directory, id));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("a backup timestamp cannot be edited to bypass the recovery retention boundary", () => {
  const key = randomBytes(32),
    value = { version: 2, createdAt: "2026-01-01T00:00:00.000Z", files: [] },
    manifest = sealManifest(value, key);
  assert.deepEqual(verifyManifest(manifest, key), value);
  assert.throws(() => verifyManifest({ ...manifest, createdAt: new Date().toISOString() }, key));
  assert.throws(() => verifyManifest(manifest, randomBytes(32)));
});
