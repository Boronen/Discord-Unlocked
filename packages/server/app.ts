import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { AppError, invariant } from "./errors.js";
import type { ProfileService } from "./service.js";
import { FileStore, enqueueMedia } from "./media.js";
import { snowflake, uuid, mediaSlotSchema, MAX_UPLOAD_BYTES } from "../shared/schema.js";
import { resolveSong } from "./music.js";
import { AccountLimits } from "./limits.js";
import { StudioService } from "./studio.js";
import { studioRoutes } from "./studio-routes.js";
import { legacyConfig } from "../shared/domain/studio-model.js";
const versionBody = z.object({ version: z.number().int().min(0) }).strict();
const reasonBody = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
export async function createApp(
  service: ProfileService,
  files: FileStore,
  logger = false,
  trustProxy: false | string = false,
  studioEnabled = true,
) {
  const app = Fastify({
    logger: logger
      ? {
          serializers: {
            req: () => ({}),
            res: () => ({}),
            err: () => ({ type: "Error", message: "Internal request failure", stack: "" }),
          },
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    trustProxy,
  });
  await app.register(cors, {
    origin: ["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"],
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 2 } });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ code: "VALIDATION", message: error.issues[0]?.message ?? "Invalid input." });
    if (error instanceof AppError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500)
      return reply.code(statusCode).send({
        code: "REQUEST",
        message:
          statusCode === 413 ? "Files must be no larger than 15 MiB." : "The request could not be processed.",
      });
    request.log.error({ requestId: request.id, code: "INTERNAL" }, "Request failed");
    return reply.code(500).send({ code: "INTERNAL", message: "The action failed. Try again." });
  });
  const limits = new AccountLimits();
  const identities = new WeakMap<object, string>();
  let uploads = 0;
  const uploading = new WeakSet<object>();
  app.addHook("onResponse", async (request, reply) => {
    if (uploading.delete(request)) uploads--;
    request.log.info(
      { requestId: request.id, route: request.routeOptions.url ?? "unmatched", status: reply.statusCode },
      "Request completed",
    );
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff");
    return payload;
  });
  async function actor(headers: { authorization?: string }, beta = true, fresh = false) {
    invariant(
      headers.authorization && headers.authorization.startsWith("Bearer "),
      401,
      "UNAUTHORIZED",
      "Pair the plugin with the bot.",
    );
    let id = identities.get(headers);
    if (!id) {
      id = await service.authenticate(headers.authorization.slice(7));
      identities.set(headers, id);
    }
    if (beta) await service.permissions.member(id, fresh);
    return id;
  }
  app.addHook("preHandler", async (request) => {
    const route = request.routeOptions.url ?? "";
    if (
      !/^\/v[12]\//.test(route) ||
      ["/v1/auth/pair", "/v1/auth/poll", "/v1/auth/logout"].includes(route) ||
      route.startsWith("/v1/privacy/") ||
      route.startsWith("/v1/auth/sessions")
    )
      return;
    const id = await actor(request.headers, true, request.method !== "GET");
    const category = route.startsWith("/v1/media/")
      ? "media"
      : route === "/v1/me/media/:slot"
        ? "upload"
        : route === "/v1/music/resolve"
          ? "music"
          : "api";
    limits.check(
      id,
      category,
      category === "media" ? 600 : category === "upload" ? 10 : category === "music" ? 20 : 120,
    );
    if (category === "upload") {
      invariant(uploads < 2, 429, "UPLOAD_BUSY", "Uploads are busy. Try again shortly.");
      uploads++;
      uploading.add(request);
    }
  });
  app.get("/health", async () => {
    await service.db.query("SELECT 1");
    return { ok: true };
  });
  app.get(
    "/v1/music/resolve",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const id = await actor(request.headers);
      await service.permissions.member(id);
      const { url } = z.object({ url: z.string().max(1000) }).parse(request.query);
      try {
        return await resolveSong(url);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          400,
          "SONG_RESOLVE",
          error instanceof Error ? error.message : "Song details are unavailable.",
        );
      }
    },
  );
  app.post(
    "/v1/auth/pair",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const { userId } = z.object({ userId: snowflake }).strict().parse(request.body);
      return service.createPairing(userId);
    },
  );
  app.post("/v1/auth/poll", async (request) => {
    const body = z
      .object({ id: uuid, pollSecret: z.string().min(32).max(100) })
      .strict()
      .parse(request.body);
    return service.pollPairing(body.id, body.pollSecret);
  });
  app.post("/v1/auth/logout", async (request) => {
    await actor(request.headers, false);
    await service.logout(request.headers.authorization!.slice(7));
    return { ok: true };
  });
  app.get("/v1/auth/sessions", async (request) =>
    service.sessions(await actor(request.headers, false), request.headers.authorization!.slice(7)),
  );
  app.delete("/v1/auth/sessions/:id", async (request) => {
    await service.revokeSession(
      await actor(request.headers, false),
      z.object({ id: uuid }).parse(request.params).id,
    );
    return { ok: true };
  });
  app.delete("/v1/auth/sessions", async (request) => {
    await service.revokeSession(await actor(request.headers, false));
    return { ok: true };
  });
  app.get("/v1/privacy/export", async (request) => service.exportData(await actor(request.headers, false)));
  app.get("/v1/privacy/media/:id", async (request, reply) => {
    const id = z.object({ id: uuid }).parse(request.params).id,
      userId = await actor(request.headers, false);
    limits.check(userId, "export-media", 100);
    const [asset] = await service.db.query(
      "SELECT * FROM media WHERE id=$1 AND owner_id=$2 AND status='ready'",
      [id, userId],
    );
    invariant(asset?.output_key, 404, "NOT_FOUND", "File not found.");
    reply.type(asset.mime).header("Content-Security-Policy", "default-src 'none'; sandbox");
    return reply.send(createReadStream(files.path(asset.output_key)));
  });
  app.delete("/v1/privacy/account", async (request) => {
    z.object({ confirmation: z.literal("DELETE MY ACCOUNT") })
      .strict()
      .parse(request.body);
    await service.deleteAccount(await actor(request.headers, false));
    return { ok: true };
  });
  app.post("/v1/me/publish-confirmation", async (request) =>
    service.beginPublishConfirmation(await actor(request.headers), versionBody.parse(request.body).version),
  );
  app.get("/v1/profiles", async (request, reply) => {
    const { ids } = z.object({ ids: z.string().max(2200) }).parse(request.query);
    const list = z.array(snowflake).max(100).parse(ids.split(",").filter(Boolean));
    reply.header("Cache-Control", "no-store");
    const profiles = await service.publicProfiles([...new Set(list)]);
    return {
      profiles: Object.fromEntries(
        Object.entries(profiles).map(([id, profile]) => [
          id,
          profile ? { ...profile, config: legacyConfig(profile.config) } : null,
        ]),
      ),
    };
  });
  app.get("/v1/catalog", async (request) => {
    const { after } = z
      .object({
        after: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{0,100}$/)
          .default(""),
      })
      .parse(request.query);
    return service.catalogPage(after);
  });
  app.get("/v1/me", async (request) => {
    const value = await service.editor(await actor(request.headers));
    return {
      ...value,
      draft: legacyConfig(value.draft),
      published: value.published
        ? { ...value.published, config: legacyConfig(value.published.config) }
        : null,
      revisions: value.revisions.map((r) => ({ ...r, config: legacyConfig(r.config) })),
    };
  });
  app.put("/v1/me/draft", async (request) => {
    const userId = await actor(request.headers);
    const body = z
      .object({ version: z.number().int().min(0), config: z.unknown() })
      .strict()
      .parse(request.body);
    return service.saveDraft(userId, body.config, body.version);
  });
  app.post("/v1/me/submit", async (request) =>
    service.submit(await actor(request.headers), versionBody.parse(request.body).version),
  );
  app.post("/v1/me/publish", async (request) => {
    const body = z
      .object({ version: z.number().int().min(0), confirmationId: uuid })
      .strict()
      .parse(request.body);
    return service.submit(await actor(request.headers), body.version, true, body.confirmationId);
  });
  app.post(
    "/v1/me/media/:slot",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const userId = await actor(request.headers);
      await service.permissions.member(userId);
      const { slot } = z.object({ slot: mediaSlotSchema }).parse(request.params);
      const part = await request.file();
      invariant(part, 400, "FILE_REQUIRED", "Select a file.");
      const data = await part.toBuffer();
      invariant(!part.file.truncated, 413, "FILE_SIZE", "Files must be no larger than 15 MiB.");
      return enqueueMedia(service, files, userId, slot, data, part.filename);
    },
  );
  app.get("/v1/moderation/:id", async (request) =>
    service.review(await actor(request.headers), z.object({ id: uuid }).parse(request.params).id),
  );
  app.post("/v1/moderation/:id/decision", async (request) => {
    const userId = await actor(request.headers),
      { id } = z.object({ id: uuid }).parse(request.params);
    const body = z
      .object({ action: z.enum(["approve", "reject"]), reason: z.string().max(1000).optional() })
      .strict()
      .parse(request.body);
    const reviewed = await service.review(userId, id);
    invariant(
      reviewed.revision.config.configVersion !== 2,
      409,
      "CLIENT_UPDATE_REQUIRED",
      "Review this scene in the updated Studio Review tab before deciding.",
    );
    return service.decide(userId, id, body.action, body.reason);
  });
  app.post("/v1/moderation/:id/restore", async (request) => {
    await service.restore(await actor(request.headers), z.object({ id: uuid }).parse(request.params).id);
    return { ok: true };
  });
  app.post("/v1/moderation/users/:id/revoke", async (request) => {
    await service.revokeProfile(
      await actor(request.headers),
      z.object({ id: snowflake }).parse(request.params).id,
      reasonBody.parse(request.body).reason,
    );
    return { ok: true };
  });
  app.post("/v1/moderation/media/:id/revoke", async (request) => {
    await service.revokeMedia(
      await actor(request.headers),
      z.object({ id: uuid }).parse(request.params).id,
      reasonBody.parse(request.body).reason,
    );
    return { ok: true };
  });
  app.post("/v1/admin/catalog", async (request) => {
    await service.upsertCatalog(await actor(request.headers), request.body);
    return { ok: true };
  });
  app.post("/v1/admin/catalog/batch", async (request) => {
    const values = z.array(z.unknown()).min(1).max(100).parse(request.body);
    await service.upsertCatalogBatch(await actor(request.headers), values);
    return { ok: true, count: values.length };
  });
  async function mediaHandler(
    request: { params: unknown; headers: { authorization?: string } },
    reply: any,
    preview: boolean,
  ) {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const viewer = await actor(request.headers);
    const [asset] = await service.db.query("SELECT * FROM media WHERE id=$1 AND status='ready'", [id]);
    invariant(asset, 404, "NOT_FOUND", "File not found.");
    const [published] = await service.db.query(
      "SELECT u.id FROM users u JOIN revision_assets ra ON ra.revision_id=u.published_revision JOIN revisions r ON r.id=u.published_revision WHERE ra.asset_id=$1 AND r.status='approved' AND u.deleted_at IS NULL UNION ALL SELECT u.id FROM studio_shares s JOIN users u ON u.id=s.owner_id JOIN studio_share_variants sv ON sv.share_id=s.id JOIN revisions r ON r.id=sv.revision_id JOIN revision_assets ra ON ra.revision_id=r.id WHERE s.status='approved' AND r.status='approved' AND u.deleted_at IS NULL AND ra.asset_id=$1 LIMIT 1",
      [id],
    );
    if (!published) {
      if (viewer !== asset.owner_id) await service.permissions.moderator(viewer);
    }
    const key = preview ? asset.preview_key : asset.output_key;
    invariant(key, 404, "NOT_FOUND", "No preview is available for this file.");
    // Revalidate every request: a revoked asset must not remain public in caches.
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .type(preview ? "image/png" : asset.mime);
    return reply.send(createReadStream(files.path(key)));
  }
  app.get(
    "/v1/media/:id",
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    (request, reply) => mediaHandler(request, reply, false),
  );
  app.get(
    "/v1/media/:id/preview",
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    (request, reply) => mediaHandler(request, reply, true),
  );
  await studioRoutes(app, new StudioService(service, files), actor, studioEnabled);
  return app;
}
