import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { setup, ALICE, BOB, MOD, OWNER, ownerPublish } from "./helpers.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { randomUUID } from "node:crypto";
describe("PostgreSQL profile lifecycle", () => {
  let context: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    context = await setup();
  });
  afterAll(async () => {
    await context.raw.close();
  });
  it("binds pairing to the Discord account and consumes it once", async () => {
    const { service } = context,
      pair = await service.createPairing(ALICE);
    await expect(service.connect(pair.code, BOB)).rejects.toMatchObject({ code: "WRONG_ACCOUNT" });
    expect(await service.pollPairing(pair.id, pair.pollSecret)).toEqual({ ready: false });
    await service.connect(pair.code, ALICE);
    const result = await service.pollPairing(pair.id, pair.pollSecret);
    expect(result.ready).toBe(true);
    if (result.ready) expect(await service.authenticate(result.token)).toBe(ALICE);
    await expect(service.pollPairing(pair.id, pair.pollSecret)).rejects.toMatchObject({ status: 410 });
  });
  it("preserves the published profile until exact revision approval", async () => {
    const { service } = context;
    const a = await service.saveDraft(ALICE, { ...DEFAULT_CONFIG, colors: ["#112233", "#445566"] }, 0);
    const first = await service.submit(ALICE, a.version);
    expect((await service.publicProfiles([ALICE]))[ALICE]).toBeNull();
    await service.decide(MOD, first.id, "approve");
    const b = await service.saveDraft(
      ALICE,
      { ...DEFAULT_CONFIG, colors: ["#770000", "#110000"] },
      a.version,
    );
    const second = await service.submit(ALICE, b.version);
    expect((await service.publicProfiles([ALICE]))[ALICE]?.revisionId).toBe(first.id);
    await service.decide(MOD, second.id, "reject", "Másik bannert kérünk.");
    expect((await service.publicProfiles([ALICE]))[ALICE]?.revisionId).toBe(first.id);
    expect((await service.editor(ALICE)).revisions[0]?.reason).toBe("Másik bannert kérünk.");
  });
  it("rejects stale draft writes and duplicate pending submissions", async () => {
    const { service } = context;
    await expect(service.saveDraft(ALICE, DEFAULT_CONFIG, 0)).rejects.toMatchObject({
      code: "DRAFT_CONFLICT",
    });
    const { version } = await service.saveDraft(BOB, DEFAULT_CONFIG, 0);
    const revision = await service.submit(BOB, version);
    await expect(service.submit(BOB, version)).rejects.toMatchObject({ code: "ALREADY_PENDING" });
    const results = await Promise.allSettled([
      service.decide(MOD, revision.id, "approve"),
      service.decide(OWNER, revision.id, "reject", "Másik moderátor döntése."),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("blocks unauthorized moderation and quick publication", async () => {
    await expect(context.service.decide(ALICE, randomUUID(), "approve")).rejects.toMatchObject({
      status: 403,
    });
    await expect(context.service.submit(ALICE, 2, true)).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
  });
  it("owner publication is audited, supports restore and revocation", async () => {
    const { service, db } = context;
    const a = await ownerPublish(service, 0);
    const draft = await service.saveDraft(OWNER, { ...DEFAULT_CONFIG, colors: ["#222222", "#333333"] }, 0);
    await ownerPublish(service, draft.version);
    await service.restore(MOD, a.id);
    expect((await service.publicProfiles([OWNER]))[OWNER]?.revisionId).toBe(a.id);
    await service.revokeProfile(MOD, OWNER, "Teszt vége");
    expect((await service.publicProfiles([OWNER]))[OWNER]).toBeNull();
    expect((await db.query("SELECT * FROM audit WHERE action='owner_publish'")).length).toBe(2);
    await expect(service.restore(MOD, a.id)).rejects.toMatchObject({ code: "INVALID_REVISION" });
  });
  it("rejects another account's media and wrong media slots", async () => {
    const id = randomUUID();
    await context.db.query(
      "INSERT INTO media(id,owner_id,slot,status,original_name,input_key) VALUES($1,$2,'banner','ready','x','x')",
      [id, ALICE],
    );
    await expect(context.service.saveDraft(BOB, { ...DEFAULT_CONFIG, banner: id }, 1)).rejects.toMatchObject({
      code: "INVALID_ASSET",
    });
    await expect(
      context.service.saveDraft(ALICE, { ...DEFAULT_CONFIG, avatar: id }, 2),
    ).rejects.toMatchObject({ code: "INVALID_ASSET" });
  });
  it("revokes old media URLs and blocks restoration of affected profiles", async () => {
    const id = randomUUID();
    await context.db.query(
      "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime) VALUES($1,$2,'avatar','ready','x','x','processed/x.webp','image/webp')",
      [id, OWNER],
    );
    const { version } = await context.service.saveDraft(OWNER, { ...DEFAULT_CONFIG, avatar: id }, 1);
    const revision = await ownerPublish(context.service, version);
    await context.service.revokeMedia(MOD, id, "Visszavonás");
    expect((await context.service.publicProfiles([OWNER]))[OWNER]).toBeNull();
    await expect(context.service.restore(MOD, revision.id)).rejects.toMatchObject({ code: "INVALID_ASSET" });
  });
});
