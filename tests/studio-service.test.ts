import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setup, ALICE, BOB, OWNER, MOD, token } from "./helpers.js";
import { StudioService } from "../packages/server/studio.js";
import { FileStore } from "../packages/server/media.js";
import { createApp } from "../packages/server/app.js";
import { normalizeStudio, EMPTY_LIBRARY } from "../packages/plugin/studio-model.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { maintain } from "../packages/server/maintenance.js";
import { SecurityJournal } from "../packages/server/journal.js";
import { newLayer } from "../packages/plugin/studio-model.js";
const cleanup: (() => Promise<unknown>)[] = [];

test("music priority survives preset save, immutable moderation and publication without listening metadata", async () => {
  const c = await context();
  const app = await createApp(c.service, c.files);
  cleanup.unshift(() => app.close());
  const capabilities = await app.inject({
    url: "/v2/capabilities",
    headers: { authorization: `Bearer ${await token(c.service, ALICE)}` },
  });
  expect(capabilities.statusCode).toBe(200);
  expect(capabilities.json().features.musicPriority).toBe(true);
  const preset = await c.studio.createPreset(ALICE, "Live music style");
  await c.studio.savePreset(ALICE, preset.id, 0, normalizeStudio({ ...DEFAULT_CONFIG, musicPriority: true }));
  const submitted = await c.studio.submitPreset(ALICE, preset.id, 1, true);
  expect((await c.service.publicProfiles([ALICE]))[ALICE]).toBeNull();
  await c.service.decide(MOD, submitted.id, "approve");
  const profile = (await c.service.publicProfiles([ALICE]))[ALICE]!;
  expect(profile.config.musicPriority).toBe(true);
  expect(profile.config).not.toHaveProperty("liveMusic");
});

test("review is limited to owner/moderators and admin routes reject ordinary members and reviewers", async () => {
  const c = await context();
  const app = await createApp(c.service, c.files);
  cleanup.unshift(() => app.close());
  for (const user of [ALICE, MOD, OWNER]) {
    const bearer = await token(c.service, user);
    const headers = { authorization: `Bearer ${bearer}` };
    const editor = await c.service.editor(user);
    expect(editor.isOwner).toBe(user === OWNER);
    expect(editor.canModerate).toBe(user === OWNER || user === MOD);
    expect((await app.inject({ url: "/v2/moderation/queue", headers })).statusCode).toBe(
      user === ALICE ? 403 : 200,
    );
    expect((await app.inject({ url: "/v2/admin/badges", headers })).statusCode).toBe(
      user === OWNER ? 200 : 403,
    );
    expect((await app.inject({ url: `/v2/moderation/${randomUUID()}`, headers })).statusCode).toBe(
      user === ALICE ? 403 : 404,
    );
  }
});
test("test publication is bound to one saved preset and consumes one fresh bot confirmation", async () => {
  const c = await context(),
    p = await c.studio.createPreset(OWNER, "Owner test"),
    other = await c.studio.createPreset(OWNER, "Other");
  await c.studio.savePreset(OWNER, p.id, 0, normalizeStudio(DEFAULT_CONFIG));
  const confirmation = await c.studio.beginPresetConfirmation(OWNER, p.id, 1);
  await expect(c.studio.submitPreset(OWNER, p.id, 1, true, confirmation.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  await c.service.confirmPublish(OWNER, confirmation.code);
  await expect(c.studio.submitPreset(OWNER, other.id, 0, true, confirmation.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  const r = await c.studio.submitPreset(OWNER, p.id, 1, true, confirmation.id);
  expect(r.status).toBe("approved");
  await expect(c.studio.submitPreset(OWNER, p.id, 1, true, confirmation.id)).rejects.toMatchObject({
    code: "CONFIRMATION_REQUIRED",
  });
  expect((await c.service.publicProfiles([OWNER]))[OWNER]!.revisionId).toBe(r.id);
});
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});
async function context() {
  const c = await setup();
  const path = await mkdtemp(join(tmpdir(), "studio-v2-"));
  const files = new FileStore(path);
  await files.init();
  cleanup.push(
    () => c.raw.close(),
    () => rm(path, { recursive: true, force: true }),
  );
  return { ...c, files, path, studio: new StudioService(c.service, files) };
}
async function approved(c: Awaited<ReturnType<typeof context>>, user = ALICE, name = "My design") {
  const p = await c.studio.createPreset(user, name);
  await c.studio.savePreset(user, p.id, 0, normalizeStudio(DEFAULT_CONFIG));
  const r = await c.studio.submitPreset(user, p.id, 1, false);
  await c.service.decide(MOD, r.id, "approve");
  return { ...p, revision: r.id };
}
test("preset ownership, immutable reviews, explicit activation and legacy write protection", async () => {
  const c = await context();
  const w = await c.studio.workspace(ALICE);
  const p = w.presets[0]!;
  const config = normalizeStudio(p.draft);
  config.studio.base.blocks.push({
    id: "about",
    kind: "text",
    title: "About me",
    text: "Hello",
    links: [],
    visible: true,
  });
  await c.studio.savePreset(ALICE, p.id, p.version, config);
  await expect(c.studio.savePreset(BOB, p.id, p.version, config)).rejects.toMatchObject({ status: 404 });
  await expect(c.studio.savePreset(ALICE, p.id, p.version, config)).rejects.toMatchObject({
    code: "DRAFT_CONFLICT",
  });
  await expect(c.service.saveDraft(ALICE, DEFAULT_CONFIG, 1)).rejects.toMatchObject({
    code: "CLIENT_UPDATE_REQUIRED",
  });
  const r = await c.studio.submitPreset(ALICE, p.id, 1, false);
  config.studio.base.blocks[1]!.text = "Changed after submission";
  await c.studio.savePreset(ALICE, p.id, 1, config);
  await c.service.decide(MOD, r.id, "approve");
  expect((await c.service.publicProfiles([ALICE]))[ALICE]).toBeNull();
  await c.studio.activate(ALICE, p.id);
  expect((await c.service.publicProfiles([ALICE]))[ALICE]!.config.studio!.base.blocks[1]!.text).toBe("Hello");
  await expect(c.service.decide(MOD, r.id, "approve")).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
});
test("capacity is enforced on the server and collections survive supporter role loss", async () => {
  const c = await context();
  await c.studio.workspace(ALICE);
  for (let i = 0; i < 4; i++) await c.studio.createPreset(ALICE, `Preset ${i}`);
  await expect(c.studio.createPreset(ALICE, "Sixth")).rejects.toMatchObject({ code: "PRESET_LIMIT" });
  let supporter = true;
  c.permissions.canUseCustomTint = async () => supporter;
  await c.studio.createPreset(ALICE, "Supporter preset");
  const document = {
    ...EMPTY_LIBRARY,
    collections: Array.from({ length: 6 }, (_, i) => ({ id: randomUUID(), name: `Set ${i}`, items: [] })),
  };
  await c.studio.saveLibrary(ALICE, 0, document);
  supporter = false;
  expect((await c.studio.workspace(ALICE)).presets).toHaveLength(6);
  await c.studio.saveLibrary(ALICE, 1, document);
  await expect(
    c.studio.saveLibrary(ALICE, 2, {
      ...document,
      collections: [...document.collections, { id: randomUUID(), name: "New", items: [] }],
    }),
  ).rejects.toMatchObject({ code: "COLLECTION_LIMIT" });
});
test("approved sharing copies only consented uploads, counts bytes, is idempotent and cascades erasure", async () => {
  const c = await context();
  const p = await c.studio.createPreset(ALICE, "Shared");
  const asset = randomUUID();
  await c.files.write(`processed/${asset}.webp`, Buffer.from("normalized image"));
  await c.db.query(
    "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime,output_bytes) VALUES($1,$2,'banner','ready','upload',$3,$4,'image/webp',16)",
    [asset, ALICE, `quarantine/${asset}.bin`, `processed/${asset}.webp`],
  );
  const config = normalizeStudio({ ...DEFAULT_CONFIG, banner: asset });
  await c.studio.savePreset(ALICE, p.id, 0, config);
  const r = await c.studio.submitPreset(ALICE, p.id, 1, false);
  await c.service.decide(MOD, r.id, "approve");
  const share = await c.studio.submitShare(ALICE, "Shared style", "Description", [p.id], true);
  expect(await c.studio.shares(BOB)).toHaveLength(0);
  await c.studio.decideShare(MOD, share.id, "approve");
  const request = randomUUID();
  const copied = await c.studio.importStyle(BOB, share.id, r.id, request, {
    avatar: true,
    songs: true,
    panels: true,
  });
  expect(copied.draft.banner).not.toBe(asset);
  expect(
    (await c.studio.importStyle(BOB, share.id, r.id, request, { avatar: true, songs: true, panels: true }))
      .id,
  ).toBe(copied.id);
  const [media] = await c.db.query("SELECT * FROM media WHERE id=$1", [copied.draft.banner]);
  expect(media!.owner_id).toBe(BOB);
  expect(Number(media!.output_bytes)).toBe(16);
  expect((await readFile(c.files.path(media!.output_key))).toString()).toBe("normalized image");
  const settingsOnly = await c.studio.submitShare(ALICE, "Settings only", "No copying", [p.id], false);
  await c.studio.decideShare(MOD, settingsOnly.id, "approve");
  const stripped = await c.studio.importStyle(BOB, settingsOnly.id, r.id, randomUUID(), {
    avatar: false,
    songs: false,
    panels: false,
  });
  expect(stripped.draft.banner).toBeNull();
  for (let i = 0; i < 9; i++)
    await c.db.query("INSERT INTO upload_events(id,user_id) VALUES($1,$2)", [randomUUID(), BOB]);
  await expect(
    c.studio.importStyle(BOB, share.id, r.id, randomUUID(), { avatar: true, songs: true, panels: true }),
  ).rejects.toMatchObject({ code: "DAILY_QUOTA" });
  expect((await c.db.query("SELECT count(*)::int AS n FROM media WHERE owner_id=$1", [BOB]))[0]!.n).toBe(1);
  await c.studio.withdrawShare(ALICE, share.id);
  expect((await c.db.query("SELECT status FROM media WHERE id=$1", [copied.draft.banner]))[0]!.status).toBe(
    "ready",
  );
  await c.service.deleteAccount(ALICE);
  expect((await c.db.query("SELECT status FROM media WHERE id=$1", [copied.draft.banner]))[0]!.status).toBe(
    "revoked",
  );
  await maintain(c.service, c.files);
  expect(await c.db.query("SELECT id FROM media WHERE id=$1", [copied.draft.banner])).toHaveLength(0);
});
test("automation targets only approved owned presets and leases expire to the manual profile", async () => {
  const c = await context();
  const manual = await approved(c, ALICE, "Manual"),
    auto = await approved(c, ALICE, "Automatic");
  await c.studio.activate(ALICE, manual.id);
  const rule = { id: randomUUID(), kind: "music", applicationId: "", presetId: auto.id, enabled: true };
  await c.studio.saveAutomation(ALICE, 0, [rule], true);
  await c.studio.activate(ALICE, auto.id, "device-a");
  await expect(c.studio.activate(ALICE, auto.id, "device-b")).rejects.toMatchObject({
    code: "AUTOMATION_DEVICE",
  });
  expect((await c.service.publicProfiles([ALICE]))[ALICE]!.revisionId).toBe(auto.revision);
  await c.db.query("UPDATE users SET auto_lease_until=now()-interval '1 second' WHERE id=$1", [ALICE]);
  expect((await c.service.publicProfiles([ALICE]))[ALICE]!.revisionId).toBe(manual.revision);
  await c.studio.activate(ALICE, manual.id);
  await expect(c.studio.activate(ALICE, auto.id, "device-a")).rejects.toMatchObject({
    code: "AUTOMATION_OFF",
  });
});
test("v2 routes require pairing, beta membership and owner verification; v1 reads stay projected", async () => {
  const c = await context();
  const app = await createApp(c.service, c.files);
  cleanup.unshift(() => app.close());
  expect((await app.inject({ method: "GET", url: "/v2/capabilities" })).statusCode).toBe(401);
  const auth = { authorization: `Bearer ${await token(c.service)}` };
  expect((await app.inject({ method: "GET", url: "/v2/me/workspace", headers: auth })).statusCode).toBe(200);
  expect(
    Object.keys((await app.inject({ method: "GET", url: "/v2/me/automation", headers: auth })).json()).sort(),
  ).toEqual(["enabled", "rules", "version"]);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v2/admin/badges",
        headers: auth,
        payload: { name: "Tester", description: "Beta", icon: "flask" },
      })
    ).statusCode,
  ).toBe(403);
  const p = await approved(c);
  await c.studio.activate(ALICE, p.id);
  const legacy = (
    await app.inject({ method: "GET", url: `/v1/profiles?ids=${ALICE}`, headers: auth })
  ).json();
  expect(legacy.profiles[ALICE].config.studio).toBeUndefined();
  const modern = (
    await app.inject({ method: "GET", url: `/v2/profiles?ids=${ALICE}`, headers: auth })
  ).json();
  expect(modern.profiles[ALICE].config.configVersion).toBe(2);
});
test("nested custom tints cannot be introduced by ordinary clients; approved colors survive role loss", async () => {
  const c = await context(),
    p = await c.studio.createPreset(ALICE, "Tinted");
  const config = normalizeStudio(DEFAULT_CONFIG);
  config.studio.base.layers = [{ ...newLayer("texture"), tint: { color: "#123456", intensity: 0.5 } }];
  await expect(c.studio.savePreset(ALICE, p.id, 0, config)).rejects.toMatchObject({
    code: "SUPPORTER_REQUIRED",
  });
  c.permissions.canUseCustomTint = async () => true;
  await c.studio.savePreset(ALICE, p.id, 0, config);
  const r = await c.studio.submitPreset(ALICE, p.id, 1, false);
  await c.service.decide(MOD, r.id, "approve");
  c.permissions.canUseCustomTint = async () => false;
  await c.studio.savePreset(ALICE, p.id, 1, config);
  config.studio.base.layers[0]!.tint!.color = "#654321";
  await expect(c.studio.savePreset(ALICE, p.id, 2, config)).rejects.toMatchObject({
    code: "SUPPORTER_REQUIRED",
  });
});
test("retention pins saved and shared media, and security revocation removes nested references", async () => {
  const c = await context(),
    p = await c.studio.createPreset(ALICE, "Retained"),
    id = randomUUID();
  await c.files.write(`processed/${id}.webp`, Buffer.from("image"));
  await c.db.query(
    "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime,output_bytes,created_at) VALUES($1,$2,'effect','ready','effect',$3,$4,'image/webp',5,now()-interval '40 days')",
    [id, ALICE, `quarantine/${id}.bin`, `processed/${id}.webp`],
  );
  const config = normalizeStudio(DEFAULT_CONFIG);
  config.studio.full.layers = [{ ...newLayer("media"), assetId: id }];
  await c.studio.savePreset(ALICE, p.id, 0, config);
  await maintain(c.service, c.files);
  expect(await c.db.query("SELECT id FROM media WHERE id=$1", [id])).toHaveLength(1);
  await c.studio.removeMedia(ALICE, id);
  await c.db.query("UPDATE media SET erase_after=now() WHERE id=$1", [id]);
  await maintain(c.service, c.files);
  expect((await c.studio.preset(ALICE, p.id)).draft.studio.full.layers).toEqual([]);
  await c.studio.savePreset(ALICE, p.id, 2, normalizeStudio((await c.studio.preset(ALICE, p.id)).draft));
});
test("current recovery journal withdraws galleries, revokes badges and invalidates automation and sessions", async () => {
  const c = await context(),
    p = await approved(c);
  const share = await c.studio.submitShare(ALICE, "Style", "Recovery", [p.id], false);
  await c.studio.decideShare(MOD, share.id, "approve");
  const badge = await c.studio.badge(OWNER, "Tester", "flask", "Studio badge");
  await c.studio.assignBadge(OWNER, badge.id, BOB, true);
  await token(c.service, BOB);
  const journal = new SecurityJournal(join(c.path, "current.jsonl"));
  await journal.record("share", share.id);
  await journal.record("badge", `${badge.id}:${BOB}`);
  await journal.replay(c.db);
  expect((await c.db.query("SELECT status FROM studio_shares WHERE id=$1", [share.id]))[0]!.status).toBe(
    "withdrawn",
  );
  expect(await c.db.query("SELECT * FROM studio_badge_assignments")).toHaveLength(0);
  expect(await c.db.query("SELECT * FROM sessions")).toHaveLength(0);
  expect(
    (await c.db.query("SELECT automation_enabled FROM users WHERE id=$1", [ALICE]))[0]!.automation_enabled,
  ).toBe(false);
});
