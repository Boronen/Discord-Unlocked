import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setup, token, ALICE, BOB, MOD, OWNER } from "./helpers.js";
import { createApp } from "../packages/server/app.js";
import { FileStore, enqueueMedia, processMediaJob, downloadAttachment } from "../packages/server/media.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { publishMediaResult } from "../packages/server/publisher.js";
const require = createRequire(import.meta.url);
const tools = {
  ffmpeg: process.env.TEST_FFMPEG ?? (require("ffmpeg-static") as string),
  ffprobe: process.env.TEST_FFPROBE ?? (require("ffprobe-static").path as string),
};
function wav(seconds: number) {
  const samples = Math.round(8000 * seconds),
    data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  return data;
}
describe("API and actual media codecs", () => {
  let context: Awaited<ReturnType<typeof setup>>,
    files: FileStore,
    app: Awaited<ReturnType<typeof createApp>>,
    aliceToken: string,
    bobToken: string;
  beforeAll(async () => {
    context = await setup();
    files = new FileStore(await mkdtemp(join(tmpdir(), "profile-studio-test-")));
    await files.init();
    app = await createApp(context.service, files);
    aliceToken = await token(context.service);
    bobToken = await token(context.service, BOB);
  });
  afterAll(async () => {
    await app?.close();
    await context?.raw.close();
  });
  const auth = () => ({ authorization: `Bearer ${aliceToken}` });
  it("exposes no private state without pairing", async () => {
    expect((await app.inject({ url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ url: `/v1/profiles?ids=${ALICE}` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/v1/profiles?ids=${ALICE}`, headers: auth() })).json()).toEqual({
      profiles: { [ALICE]: null },
    });
    expect((await app.inject({ url: "/v1/profiles?ids=not-an-id", headers: auth() })).statusCode).toBe(400);
  });
  it("rejects expired pairing and unsupported fields", async () => {
    const pair = await context.service.createPairing(ALICE);
    await context.db.query("UPDATE pairings SET expires_at=now()-interval '1 minute' WHERE id=$1", [pair.id]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/poll",
          payload: { id: pair.id, pollSecret: pair.pollSecret },
        })
      ).statusCode,
    ).toBe(410);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/me/draft",
          headers: auth(),
          payload: { version: 0, config: { ...DEFAULT_CONFIG, css: "body{display:none}" } },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/me/draft",
          headers: auth(),
          payload: { version: 0, config: { ...DEFAULT_CONFIG, effect: { source: "media", id: "not-uuid" } } },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("processes an image, protects the pending preview, then publishes it", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#224488" } })
      .png()
      .toBuffer();
    const asset = await enqueueMedia(context.service, files, ALICE, "avatar", png, "avatar.png");
    await processMediaJob(context.service, files, tools);
    expect((await context.db.query("SELECT status FROM media WHERE id=$1", [asset.id]))[0]?.status).toBe(
      "processing",
    );
    await publishMediaResult(context.service, files);
    const [row] = await context.db.query("SELECT * FROM media WHERE id=$1", [asset.id]);
    expect(row?.status).toBe("ready");
    expect((await app.inject({ url: `/v1/media/${asset.id}/preview` })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: `/v1/media/${asset.id}/preview`,
          headers: { authorization: `Bearer ${bobToken}` },
        })
      ).statusCode,
    ).toBe(403);
    const privateResponse = await app.inject({ url: `/v1/media/${asset.id}/preview`, headers: auth() });
    expect(privateResponse.statusCode).toBe(200);
    expect(privateResponse.headers["cache-control"]).toBe("no-store");
    const saved = await context.service.saveDraft(ALICE, { ...DEFAULT_CONFIG, avatar: asset.id }, 0);
    const revision = await context.service.submit(ALICE, saved.version);
    expect((await context.service.editor(ALICE)).canModerate).toBe(false);
    expect((await context.service.editor(MOD)).canModerate).toBe(true);
    await expect(context.service.review(BOB, revision.id)).rejects.toMatchObject({ status: 403 });
    const review = await context.service.review(MOD, revision.id);
    expect(review.revision.status).toBe("pending");
    expect(review.assets[0]?.id).toBe(asset.id);
    await context.service.decide(MOD, revision.id, "approve");
    expect((await app.inject({ url: `/v1/media/${asset.id}` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/v1/media/${asset.id}`, headers: auth() })).statusCode).toBe(200);
    await context.service.revokeMedia(MOD, asset.id, "Visszavont fájl");
    expect((await app.inject({ url: `/v1/media/${asset.id}`, headers: auth() })).statusCode).toBe(404);
    expect(
      (await app.inject({ url: `/v1/profiles?ids=${ALICE}`, headers: auth() })).json().profiles[ALICE],
    ).toBeNull();
  });
  it("decodes and normalizes a valid 3.5-second WAV to Opus", async () => {
    const asset = await enqueueMedia(context.service, files, BOB, "audio", wav(3.5), "sound.wav");
    await processMediaJob(context.service, files, tools);
    await publishMediaResult(context.service, files);
    const [row] = await context.db.query("SELECT * FROM media WHERE id=$1", [asset.id]);
    expect(row?.status).toBe("ready");
    expect(row?.duration).toBeCloseTo(3.5);
    expect(row?.mime).toBe("audio/ogg");
    expect((await readFile(files.path(row!.output_key))).toString("ascii", 0, 4)).toBe("OggS");
  });
  it.each(["gif", "apng"])("preserves animated %s frames and creates a static preview", async (format) => {
    const { stdout } = await promisify(execFile)(
      tools.ffmpeg,
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=32x32:rate=2:duration=1",
        "-f",
        format,
        "pipe:1",
      ],
      { encoding: "buffer", timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const asset = await enqueueMedia(context.service, files, BOB, "banner", stdout, `banner.${format}`);
    await processMediaJob(context.service, files, tools);
    await publishMediaResult(context.service, files);
    const [row] = await context.db.query("SELECT * FROM media WHERE id=$1", [asset.id]);
    expect(row?.error).toBeNull();
    expect(row?.status).toBe("ready");
    expect(row?.animated).toBe(true);
    const normalized = await sharp(files.path(row!.output_key), { animated: true }).metadata();
    expect(normalized.pages).toBeGreaterThan(1);
    expect((await sharp(files.path(row!.preview_key)).metadata()).pages ?? 1).toBe(1);
    if (format === "gif") {
      const expected = await sharp(stdout, { page: 1, pages: 1 }).ensureAlpha().raw().toBuffer();
      const preview = await sharp(files.path(row!.preview_key)).ensureAlpha().raw().toBuffer();
      expect(preview).toEqual(expected);
    }
  });
  it("rejects short, long and disguised media while retaining a readable error", async () => {
    for (const [slot, data] of [
      ["audio", wav(2)],
      ["audio", wav(6)],
      ["avatar", Buffer.from("<script>alert(1)</script>")],
    ] as const) {
      const asset = await enqueueMedia(context.service, files, BOB, slot, data, "fake.gif");
      await processMediaJob(context.service, files, tools);
      await publishMediaResult(context.service, files);
      const [row] = await context.db.query("SELECT * FROM media WHERE id=$1", [asset.id]);
      expect(row?.status).toBe("failed");
      expect(row?.error).toBeTruthy();
    }
    await expect(
      enqueueMedia(context.service, files, BOB, "avatar", Buffer.alloc(15 * 1024 * 1024 + 1), "large.png"),
    ).rejects.toMatchObject({ status: 413 });
    await expect(downloadAttachment("https://127.0.0.1/private")).rejects.toMatchObject({
      code: "INVALID_ATTACHMENT",
    });
    await expect(
      downloadAttachment("https://cdn.discordapp.com.evil.example/attachments/a"),
    ).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
  });
  it("does not resurrect a revoked job and forbids filesystem traversal", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    const asset = await enqueueMedia(context.service, files, BOB, "banner", png, "b.png");
    await context.service.revokeMedia(MOD, asset.id, "Teszt");
    await processMediaJob(context.service, files, tools);
    expect((await context.db.query("SELECT status FROM media WHERE id=$1", [asset.id]))[0]?.status).toBe(
      "revoked",
    );
    expect(() => files.path("../../secret")).toThrow();
  });
  it("requires the owner for catalogue changes and validates CDN hosts", async () => {
    const item = {
      id: "decoration_test",
      kind: "decoration",
      name: "Teszt",
      imageUrl: "https://cdn.discordapp.com/avatar-decoration-presets/a_x.png",
      staticUrl: "https://cdn.discordapp.com/avatar-decoration-presets/a_x.png?passthrough=false",
      discordAsset: "a_x",
      layers: [],
    };
    await expect(context.service.upsertCatalog(ALICE, item)).rejects.toMatchObject({ status: 403 });
    await expect(
      context.service.upsertCatalog(OWNER, { ...item, imageUrl: "https://example.com/tracker" }),
    ).rejects.toThrow();
    await context.service.upsertCatalog(OWNER, item);
    expect((await context.service.catalog())[0]?.id).toBe(item.id);
  });
  it("revokes a logged-out session", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: auth() });
    expect(response.statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/me", headers: auth() })).statusCode).toBe(401);
  });
});
