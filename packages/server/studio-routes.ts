import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuid, snowflake } from "../shared/schema.js";
import { labelSchema } from "../shared/studio-schema.js";
import { FEATURE_GROUPS, configDiff } from "../shared/domain/studio-model.js";
import { StudioService } from "./studio.js";
import { invariant } from "./errors.js";
import { hash } from "./service.js";
const byId = z.object({ id: uuid });
const version = z.number().int().min(0);
const decision = z
  .object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(1000).optional() })
  .strict();
export async function studioRoutes(
  app: FastifyInstance,
  studio: StudioService,
  actor: (headers: { authorization?: string }) => Promise<string>,
  enabled = true,
) {
  const s = studio.service;
  app.get("/v2/capabilities", async () => ({
    version: 2,
    enabled,
    features: { ...Object.fromEntries(FEATURE_GROUPS.map((k) => [k, enabled])), musicPriority: enabled },
  }));
  app.addHook("preHandler", async (request) => {
    if (request.routeOptions.url?.startsWith("/v2/") && request.routeOptions.url !== "/v2/capabilities")
      invariant(enabled, 404, "FEATURE_UNAVAILABLE", "Studio v2 is disabled by the operator.");
  });
  app.get("/v2/me", async (request) => s.editor(await actor(request.headers)));
  app.get("/v2/me/workspace", async (request) => studio.workspace(await actor(request.headers)));
  app.get("/v2/me/automation", async (request) => {
    const user = await actor(request.headers);
    await s.permissions.member(user);
    const [row] = await s.db.query(
      "SELECT u.automation_enabled,a.rules,a.version FROM users u JOIN studio_automation a ON a.owner_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL",
      [user],
    );
    return { enabled: row?.automation_enabled ?? false, rules: row?.rules ?? [], version: row?.version ?? 0 };
  });
  app.post("/v2/me/presets/:id/publish-confirmation", async (request) => {
    const b = z.object({ version }).strict().parse(request.body);
    return studio.beginPresetConfirmation(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.version,
    );
  });
  app.post("/v2/me/presets/:id/test-publication", async (request) => {
    const b = z.object({ version, confirmationId: uuid }).strict().parse(request.body);
    return studio.submitPreset(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.version,
      true,
      b.confirmationId,
    );
  });
  app.get("/v2/me/presets/:id", async (request) =>
    studio.presetDto(await studio.preset(await actor(request.headers), byId.parse(request.params).id)),
  );
  app.get("/v2/profiles", async (request) => {
    const q = z.object({ ids: z.string().max(2200) }).parse(request.query);
    const ids = z.array(snowflake).max(100).parse(q.ids.split(",").filter(Boolean));
    return { profiles: await s.publicProfiles([...new Set(ids)]) };
  });
  app.get("/v2/catalog", async (request) => {
    const { after } = z
      .object({
        after: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{0,100}$/)
          .default(""),
      })
      .parse(request.query);
    const rows = await s.db.query(
      "SELECT id,item,metadata FROM catalog WHERE enabled=true AND id>$1 ORDER BY id LIMIT 251",
      [after],
    );
    return {
      items: rows.slice(0, 250).map((r) => ({ ...r.item, metadata: r.metadata })),
      nextCursor: rows.length > 250 ? rows[249]!.id : null,
    };
  });
  app.post("/v2/me/presets", async (request) => {
    const b = z.object({ name: labelSchema, sourceId: uuid.optional() }).strict().parse(request.body);
    return studio.createPreset(await actor(request.headers), b.name, b.sourceId);
  });
  app.put("/v2/me/presets/:id", async (request) => {
    const b = z
      .object({ version, config: z.unknown(), name: labelSchema.optional() })
      .strict()
      .parse(request.body);
    return studio.savePreset(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.version,
      b.config,
      b.name,
    );
  });
  app.post("/v2/me/presets/:id/rename", async (request) =>
    studio.renamePreset(
      await actor(request.headers),
      byId.parse(request.params).id,
      z.object({ name: labelSchema }).strict().parse(request.body).name,
    ),
  );
  app.delete("/v2/me/presets/:id", async (request) =>
    studio.deletePreset(await actor(request.headers), byId.parse(request.params).id),
  );
  app.post("/v2/me/presets/:id/submit", async (request) => {
    const b = z.object({ version, activate: z.boolean() }).strict().parse(request.body);
    return studio.submitPreset(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.version,
      b.activate,
    );
  });
  app.post("/v2/me/presets/:id/activate", async (request) =>
    studio.activate(await actor(request.headers), byId.parse(request.params).id),
  );
  app.put("/v2/me/library", async (request) => {
    const b = z.object({ version, document: z.unknown() }).strict().parse(request.body);
    return studio.saveLibrary(await actor(request.headers), b.version, b.document);
  });
  app.put("/v2/me/media/:id", async (request) =>
    studio.mediaMeta(await actor(request.headers), byId.parse(request.params).id, request.body),
  );
  app.delete("/v2/me/media/:id", async (request) =>
    studio.removeMedia(await actor(request.headers), byId.parse(request.params).id),
  );
  app.get("/v2/styles", async (request) => ({ items: await studio.shares(await actor(request.headers)) }));
  app.get("/v2/styles/:id", async (request) => {
    const user = await actor(request.headers);
    const [row] = await s.db.query(
      "SELECT sh.* FROM studio_shares sh JOIN users u ON u.id=sh.owner_id WHERE sh.id=$1 AND u.deleted_at IS NULL",
      [byId.parse(request.params).id],
    );
    invariant(row, 404, "NOT_FOUND", "Shared style not found.");
    if (row.status !== "approved" && row.owner_id !== user) await s.permissions.moderator(user);
    const share = await studio.shareDto(row);
    const assets = await s.db.query(
      "SELECT DISTINCT m.* FROM media m JOIN revision_assets ra ON ra.asset_id=m.id JOIN studio_share_variants sv ON sv.revision_id=ra.revision_id WHERE sv.share_id=$1 AND m.status='ready'",
      [row.id],
    );
    return { share, assets: assets.map((a) => s.media(a)) };
  });
  app.post("/v2/styles", async (request) => {
    const b = z
      .object({
        title: labelSchema,
        description: z.string().trim().max(500),
        presetIds: z
          .array(uuid)
          .min(1)
          .max(8)
          .refine((v) => new Set(v).size === v.length),
        copyUploads: z.boolean(),
      })
      .strict()
      .parse(request.body);
    return studio.submitShare(
      await actor(request.headers),
      b.title,
      b.description,
      b.presetIds,
      b.copyUploads,
    );
  });
  app.delete("/v2/styles/:id", async (request) =>
    studio.withdrawShare(await actor(request.headers), byId.parse(request.params).id),
  );
  app.post("/v2/styles/:id/import", async (request) => {
    const b = z
      .object({
        revisionId: uuid,
        requestId: uuid,
        keep: z.object({ avatar: z.boolean(), songs: z.boolean(), panels: z.boolean() }).strict(),
        preservePresetId: uuid.optional(),
      })
      .strict()
      .parse(request.body);
    return studio.importStyle(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.revisionId,
      b.requestId,
      b.keep,
      b.preservePresetId,
    );
  });
  app.put("/v2/me/automation", async (request) => {
    const b = z.object({ version, rules: z.unknown(), enabled: z.boolean() }).strict().parse(request.body);
    return studio.saveAutomation(
      await actor(request.headers),
      b.version,
      b.rules,
      b.enabled,
      hash(request.headers.authorization!.slice(7)),
    );
  });
  app.post("/v2/me/automation/activate", async (request) => {
    const b = z.object({ presetId: uuid }).strict().parse(request.body);
    return studio.activate(
      await actor(request.headers),
      b.presetId,
      hash(request.headers.authorization!.slice(7)),
    );
  });
  app.post("/v2/me/automation/release", async (request) =>
    studio.releaseAutomation(await actor(request.headers), hash(request.headers.authorization!.slice(7))),
  );
  app.get("/v2/moderation/queue", async (request) => studio.queue(await actor(request.headers)));
  app.get("/v2/moderation/:id", async (request) => {
    const reviewed = await s.review(await actor(request.headers), byId.parse(request.params).id);
    const [previous] = reviewed.revision.baselineRevisionId
      ? await s.db.query("SELECT * FROM revisions WHERE id=$1", [reviewed.revision.baselineRevisionId])
      : [];
    const baseline = previous ? s.revision(previous) : null;
    const assets = baseline
      ? await s.db.query(
          "SELECT m.* FROM media m JOIN revision_assets ra ON ra.asset_id=m.id WHERE ra.revision_id=$1 AND m.status='ready'",
          [baseline.id],
        )
      : [];
    return {
      ...reviewed,
      baseline,
      assets: [
        ...new Map([...reviewed.assets, ...assets.map((m) => s.media(m))].map((m) => [m.id, m])).values(),
      ],
      changes: configDiff(baseline?.config ?? null, reviewed.revision.config),
    };
  });
  app.post("/v2/moderation/:id/decision", async (request) => {
    const b = decision.parse(request.body);
    return s.decide(await actor(request.headers), byId.parse(request.params).id, b.action, b.reason);
  });
  app.post("/v2/moderation/styles/:id/decision", async (request) => {
    const b = decision.parse(request.body);
    return studio.decideShare(
      await actor(request.headers),
      byId.parse(request.params).id,
      b.action,
      b.reason,
    );
  });
  app.put("/v2/admin/catalog/:id", async (request) =>
    studio.catalogMetadata(
      await actor(request.headers),
      z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).parse(request.params).id,
      request.body,
    ),
  );
  app.get("/v2/admin/badges", async (request) => {
    const id = await actor(request.headers);
    invariant(s.permissions.isOwner(id), 403, "OWNER_REQUIRED", "Only the owner manages Studio badges.");
    return { items: await s.db.query("SELECT * FROM studio_badges ORDER BY name") };
  });
  app.post("/v2/admin/badges", async (request) => {
    const b = z
      .object({
        id: uuid.optional(),
        name: z.string().trim().min(1).max(32),
        icon: z.enum(["star", "heart", "flask", "crown", "leaf", "fire"]),
        description: z.string().max(140),
      })
      .strict()
      .parse(request.body);
    return studio.badge(await actor(request.headers), b.name, b.icon, b.description, b.id);
  });
  app.post("/v2/admin/badges/:id/assignment", async (request) => {
    const b = z.object({ userId: snowflake, grant: z.boolean() }).strict().parse(request.body);
    return studio.assignBadge(await actor(request.headers), byId.parse(request.params).id, b.userId, b.grant);
  });
}
