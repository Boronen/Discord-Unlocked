import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setup, token, OWNER, ALICE, BOB, MOD, ownerPublish } from "./helpers.js";
import { FileStore, enqueueMedia } from "../packages/server/media.js";
import { createApp } from "../packages/server/app.js";
import { SecurityJournal } from "../packages/server/journal.js";
import { maintain } from "../packages/server/maintenance.js";
import { publishMediaResult } from "../packages/server/publisher.js";
import { discordPermissions } from "../packages/server/permissions.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { AppError } from "../packages/server/errors.js";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const close of cleanup.splice(0)) await close();
});
async function context() {
  const c = await setup();
  cleanup.push(() => c.raw.close());
  const files = new FileStore(await mkdtemp(join(tmpdir(), "ps-security-")));
  await files.init();
  const app = await createApp(c.service, files);
  cleanup.unshift(() => app.close());
  return { ...c, files, app };
}
test("admin approval is bound to owner, draft hash/version, expiry and one use", async () => {
  const { service, db } = await context();
  const first = await service.beginPublishConfirmation(OWNER, 0);
  await expect(service.confirmPublish(ALICE, first.code)).rejects.toMatchObject({ status: 403 });
  await expect(service.submit(OWNER, 0, true, first.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  await service.confirmPublish(OWNER, first.code);
  await service.submit(OWNER, 0, true, first.id);
  await expect(service.submit(OWNER, 0, true, first.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  const stale = await service.beginPublishConfirmation(OWNER, 0);
  await service.confirmPublish(OWNER, stale.code);
  await service.saveDraft(OWNER, { ...DEFAULT_CONFIG, colors: ["#111111", "#222222"] }, 0);
  await expect(service.submit(OWNER, 1, true, stale.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  const expired = await service.beginPublishConfirmation(OWNER, 1);
  await db.query("UPDATE admin_confirmations SET expires_at=now()-interval '1 second' WHERE id=$1", [
    expired.id,
  ]);
  await expect(service.confirmPublish(OWNER, expired.code)).rejects.toMatchObject({
    code: "INVALID_CONFIRMATION",
  });
});
test("retention preserves current publication, removes expired drafts/files and invalidates confirmations", async () => {
  const { service, db, files } = await context(),
    avatar = randomUUID(),
    banner = randomUUID();
  for (const [id, slot] of [
    [avatar, "avatar"],
    [banner, "banner"],
  ]) {
    const output = `processed/${id}.webp`;
    await files.write(output, Buffer.from("normalized-fixture"));
    await db.query(
      "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime,created_at) VALUES($1,$2,$3,'ready','fixture',$4,$5,'image/webp',now()-interval '40 days')",
      [id, ALICE, slot, `quarantine/${id}.bin`, output],
    );
  }
  await service.saveDraft(ALICE, { ...DEFAULT_CONFIG, avatar }, 0);
  const revision = await service.submit(ALICE, 1);
  await service.decide(MOD, revision.id, "approve");
  await service.saveDraft(ALICE, { ...DEFAULT_CONFIG, avatar, banner }, 1);
  await maintain(service, files);
  const state = await service.editor(ALICE);
  expect(state.published?.config.avatar).toBe(avatar);
  expect(state.draft.avatar).toBe(avatar);
  expect(state.draft.banner).toBeNull();
  expect(await readFile(files.path(`processed/${avatar}.webp`), "utf8")).toBe("normalized-fixture");
  await expect(readFile(files.path(`processed/${banner}.webp`))).rejects.toMatchObject({ code: "ENOENT" });
});
test("former members can download their export media but cannot read another user's export files", async () => {
  const { service, db, permissions, app, files } = await context(),
    value = await token(service),
    asset = randomUUID();
  const output = `processed/${asset}.webp`;
  await files.write(output, Buffer.from("private-media-fixture"));
  await db.query(
    "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime) VALUES($1,$2,'avatar','ready','fixture',$3,$4,'image/webp')",
    [asset, ALICE, `quarantine/${asset}.bin`, output],
  );
  const other = await token(service, BOB);
  vi.spyOn(permissions, "member").mockRejectedValue(new AppError(403, "NOT_MEMBER", "Membership required."));
  const result = await app.inject({
    url: `/v1/privacy/media/${asset}`,
    headers: { authorization: `Bearer ${value}` },
  });
  expect(result.statusCode).toBe(200);
  expect(result.body).toBe("private-media-fixture");
  expect(
    (await app.inject({ url: `/v1/privacy/media/${asset}`, headers: { authorization: `Bearer ${other}` } }))
      .statusCode,
  ).toBe(404);
});
test("sessions are device scoped, unguessable, owner bound and individually revocable", async () => {
  const { service } = await context(),
    a = await token(service),
    b = await token(service),
    other = await token(service, BOB);
  const sessions = await service.sessions(ALICE, a);
  expect(sessions).toHaveLength(2);
  expect(JSON.stringify(sessions)).not.toContain(a);
  const current = sessions.find((v) => v.current)!;
  await service.revokeSession(BOB, current.id);
  expect(await service.authenticate(a)).toBe(ALICE);
  await service.revokeSession(ALICE, current.id);
  await expect(service.authenticate(a)).rejects.toMatchObject({ status: 401 });
  expect(await service.authenticate(b)).toBe(ALICE);
  await service.revokeSession(ALICE);
  await expect(service.authenticate(b)).rejects.toMatchObject({ status: 401 });
  expect(await service.authenticate(other)).toBe(BOB);
});
test("anonymous media/profiles/catalog are denied and logs contain route patterns only", async () => {
  const { app, service } = await context();
  for (const url of [`/v1/profiles?ids=${ALICE}`, `/v1/media/${randomUUID()}`, "/v1/catalog"])
    expect((await app.inject({ url })).statusCode).toBe(401);
  const logs = vi.spyOn(app.log, "info");
  const value = await token(service);
  expect(
    (await app.inject({ url: `/v1/profiles?ids=${ALICE}`, headers: { authorization: `Bearer ${value}` } }))
      .statusCode,
  ).toBe(200);
  const serialized = JSON.stringify(logs.mock.calls);
  expect(serialized).toContain("/v1/profiles");
  expect(serialized).not.toContain(ALICE);
  expect(serialized).not.toContain(value);
  expect(serialized).not.toContain("127.0.0.1");
});
test("spoofed forwarding headers cannot reset the pairing IP budget", async () => {
  const { app } = await context();
  for (let n = 0; n < 10; n++)
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/pair",
          headers: { "x-forwarded-for": `203.0.113.${n}` },
          payload: { userId: ALICE },
        })
      ).statusCode,
    ).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/auth/pair",
        headers: { "x-forwarded-for": "198.51.100.2" },
        payload: { userId: ALICE },
      })
    ).statusCode,
  ).toBe(429);
});
test("guild departure blocks viewing but preserves authenticated export and erasure", async () => {
  const { service, permissions, app, db, files } = await context(),
    value = await token(service);
  vi.spyOn(permissions, "member").mockRejectedValue(new AppError(403, "NOT_MEMBER", "Membership required."));
  const headers = { authorization: `Bearer ${value}` };
  expect((await app.inject({ url: `/v1/profiles?ids=${ALICE}`, headers })).statusCode).toBe(403);
  const exported = await app.inject({ url: "/v1/privacy/export", headers });
  expect(exported.statusCode).toBe(200);
  expect(exported.body).not.toContain(value);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/v1/privacy/account",
        headers,
        payload: { confirmation: "DELETE MY ACCOUNT" },
      })
    ).statusCode,
  ).toBe(200);
  await expect(service.authenticate(value)).rejects.toMatchObject({ status: 401 });
  await maintain(service, files);
  expect(await db.query("SELECT id FROM users WHERE id=$1", [ALICE])).toHaveLength(0);
});
test("a current external deletion journal fences an old restored account and every session", async () => {
  const { service, db, files } = await context(),
    value = await token(service);
  const path = join(files.root, "security", "journal.jsonl"),
    journal = new SecurityJournal(path);
  await journal.record("user", ALICE);
  expect(await readFile(path, "utf8")).not.toContain(ALICE);
  await journal.replay(db);
  await expect(service.authenticate(value)).rejects.toMatchObject({ status: 401 });
  expect(
    (await db.query("SELECT deleted_at,published_revision FROM users WHERE id=$1", [ALICE]))[0]?.deleted_at,
  ).toBeTruthy();
  await maintain(service, files);
  await expect(service.ensureUser(ALICE)).rejects.toMatchObject({ code: "ACCOUNT_DELETED" });
});
test("revision recovery fences cannot revoke a later legitimate publication", async () => {
  const { service, db, files } = await context();
  service.journal = new SecurityJournal(join(files.root, "security", "journal.jsonl"));
  const first = await ownerPublish(service, 0);
  await service.revokeProfile(MOD, OWNER, "Revoke this revision");
  await service.saveDraft(OWNER, { ...DEFAULT_CONFIG, colors: ["#111111", "#222222"] }, 0);
  const next = await ownerPublish(service, 1);
  await service.journal.replay(db);
  expect((await service.publicProfiles([OWNER]))[OWNER]?.revisionId).toBe(next.id);
  expect((await db.query("SELECT status FROM revisions WHERE id=$1", [first.id]))[0]?.status).toBe("revoked");
});
test("rolling upload, pending, byte and global queue quotas cannot be bypassed by filename or slot", async () => {
  const { service, db, files } = await context();
  const first = await enqueueMedia(service, files, ALICE, "banner", Buffer.from("x"), "x.png");
  await expect(
    enqueueMedia(service, files, ALICE, "audio", Buffer.from("x"), "another.wav"),
  ).rejects.toMatchObject({ code: "UPLOAD_PENDING" });
  await db.query("UPDATE media SET status='failed' WHERE id=$1", [first.id]);
  for (let n = 0; n < 9; n++)
    await db.query("INSERT INTO upload_events(id,user_id) VALUES($1,$2)", [randomUUID(), ALICE]);
  await expect(enqueueMedia(service, files, ALICE, "avatar", Buffer.from("x"), "x")).rejects.toMatchObject({
    code: "DAILY_QUOTA",
  });
  await db.query("DELETE FROM upload_events");
  await db.query("UPDATE media SET output_bytes=90*1024*1024 WHERE id=$1", [first.id]);
  await expect(enqueueMedia(service, files, ALICE, "avatar", Buffer.from("x"), "x")).rejects.toMatchObject({
    code: "MEDIA_QUOTA",
  });
  await db.query("UPDATE media SET output_bytes=0 WHERE id=$1", [first.id]);
  for (let n = 0; n < 10; n++)
    await db.query(
      "INSERT INTO media(id,owner_id,slot,status,original_name,input_key) VALUES($1,$2,'avatar','processing','x',$3)",
      [randomUUID(), ALICE, `quarantine/${randomUUID()}.bin`],
    );
  await expect(enqueueMedia(service, files, BOB, "banner", Buffer.from("x"), "x")).rejects.toMatchObject({
    code: "QUEUE_FULL",
  });
});
test("a single global decoder lease and one-use result token cannot publish arbitrary files", async () => {
  const { service, db, files } = await context();
  const asset = await enqueueMedia(service, files, ALICE, "avatar", Buffer.from("x"), "x");
  const [job] = await db.query("SELECT * FROM claim_media_job()");
  expect(await db.query("SELECT * FROM claim_media_job()")).toHaveLength(0);
  expect(
    (
      await db.query("SELECT report_media_job($1,$2,$3) AS ok", [
        asset.id,
        randomUUID(),
        JSON.stringify({ ok: false, error: "x" }),
      ])
    )[0]?.ok,
  ).toBe(false);
  await db.query("SELECT report_media_job($1,$2,$3)", [
    asset.id,
    job!.lease_token,
    JSON.stringify({
      ok: true,
      outputKey: "processed/../../../secrets",
      previewKey: null,
      mime: "image/webp",
      animated: false,
      duration: null,
      width: 1,
      height: 1,
    }),
  ]);
  await publishMediaResult(service, files);
  expect((await db.query("SELECT status FROM media WHERE id=$1", [asset.id]))[0]?.status).toBe("failed");
});
test("beta enrollment refuses a fifty-first account atomically", async () => {
  const { service, db } = await context();
  for (let n = 0; n < 46; n++) await service.ensureUser(String(200000000000000000n + BigInt(n)));
  await expect(service.ensureUser("299999999999999999")).rejects.toMatchObject({ code: "BETA_FULL" });
  expect(Number((await db.query("SELECT count(*) AS count FROM users"))[0]?.count)).toBe(50);
});
test("role reads cache at most thirty seconds; privileged checks and Discord failures fail closed", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ roles: ["beta", "mod"] })));
  vi.stubGlobal("fetch", fetch);
  const permissions = discordPermissions({
    GUILD_ID: "guild",
    BETA_ROLE_ID: "beta",
    MODERATOR_ROLE_ID: "mod",
    OWNER_ID: OWNER,
    DISCORD_BOT_TOKEN: "test",
  } as any);
  await permissions.member(ALICE, false);
  await permissions.member(ALICE, false);
  expect(fetch).toHaveBeenCalledTimes(1);
  await permissions.moderator(ALICE);
  expect(fetch).toHaveBeenCalledTimes(2);
  now = 30_001;
  fetch.mockRejectedValue(new Error("network"));
  await expect(permissions.member(ALICE, false)).rejects.toMatchObject({ status: 503 });
  fetch.mockResolvedValue(new Response(JSON.stringify({ roles: [] })));
  await expect(permissions.moderator(OWNER)).rejects.toMatchObject({ code: "BETA_ROLE_REQUIRED" });
});
