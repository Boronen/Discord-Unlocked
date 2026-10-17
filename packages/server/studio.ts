import { randomUUID, randomBytes } from "node:crypto";
import { copyFile, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { Database } from "./db.js";
import { ProfileService, hash } from "./service.js";
import { FileStore } from "./media.js";
import { invariant } from "./errors.js";
import { DEFAULT_CONFIG, assetIds, type ProfileConfig } from "../plugin/model.js";
import {
  normalizeStudio,
  legacyConfig,
  EMPTY_LIBRARY,
  type WorkspaceState,
  type Preset,
  type StyleShare,
  type AutomationRule,
} from "../plugin/studio-model.js";
import {
  profileV2Schema,
  librarySchema,
  automationRulesSchema,
  metadataSchema,
  catalogMetadataSchema,
} from "../shared/studio-schema.js";
import { TINT_PALETTE, isBasicTint } from "../plugin/tint.js";

export class StudioService {
  constructor(
    public service: ProfileService,
    public files: FileStore,
  ) {}
  get db() {
    return this.service.db;
  }
  async capacity(user: string) {
    return (await this.service.tintAccess(user)) ? 20 : 5;
  }
  async ensure(user: string, db = this.db): Promise<void> {
    if (db === this.db) {
      await this.service.ensureUser(user);
      return db.transaction((tx) => this.ensure(user, tx));
    }
    const [row] = await db.query("SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [user]);
    invariant(row, 404, "NOT_FOUND", "Account not found.");
    if (!row.default_preset_id) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO studio_presets(id,owner_id,name,draft,version,approved_revision_id) VALUES($1,$2,'My profile',$3,$4,$5)",
        [id, user, JSON.stringify(row.draft), row.draft_version, row.published_revision],
      );
      await db.query(
        "UPDATE users SET default_preset_id=$1,manual_revision_id=published_revision WHERE id=$2",
        [id, user],
      );
      await db.query("UPDATE revisions SET preset_id=$1 WHERE user_id=$2 AND preset_id IS NULL", [id, user]);
      await this.refs(db, id, row.draft);
    }
    await db.query("INSERT INTO studio_library(owner_id) VALUES($1) ON CONFLICT DO NOTHING", [user]);
    await db.query("INSERT INTO studio_automation(owner_id) VALUES($1) ON CONFLICT DO NOTHING", [user]);
  }
  async preset(user: string, id: string, db = this.db, lock = false) {
    const [row] = await db.query(
      `SELECT * FROM studio_presets WHERE id=$1 AND owner_id=$2${lock ? " FOR UPDATE" : ""}`,
      [id, user],
    );
    invariant(row, 404, "NOT_FOUND", "Preset not found.");
    return row;
  }
  async presetDto(row: Record<string, any>, db = this.db, full = true): Promise<Preset> {
    const [approved] = row.approved_revision_id
      ? await db.query("SELECT * FROM revisions WHERE id=$1 AND status='approved'", [
          row.approved_revision_id,
        ])
      : [];
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      draft: full ? row.draft : legacyConfig(row.draft),
      approvedRevisionId: approved?.id ?? null,
      approved: approved
        ? {
            ...this.service.revision(approved),
            config: full ? approved.config : legacyConfig(approved.config),
          }
        : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
  async workspace(user: string): Promise<WorkspaceState> {
    await this.service.permissions.member(user);
    await this.ensure(user);
    await this.service.publicProfiles([user]); // expire a disconnected automation lease
    const [account] = await this.db.query("SELECT * FROM users WHERE id=$1", [user]);
    const presets = await this.db.query(
      "SELECT * FROM studio_presets WHERE owner_id=$1 ORDER BY created_at,id",
      [user],
    );
    const [library] = await this.db.query("SELECT * FROM studio_library WHERE owner_id=$1", [user]);
    const [automation] = await this.db.query("SELECT * FROM studio_automation WHERE owner_id=$1", [user]);
    const meta = await this.db.query(
      "SELECT mm.* FROM studio_media_meta mm JOIN media m ON m.id=mm.media_id WHERE m.owner_id=$1",
      [user],
    );
    const usage: Record<string, string[]> = {};
    for (const p of presets) for (const id of assetIds(p.draft)) (usage[id] ??= []).push(`${p.name} · draft`);
    for (const row of await this.db.query(
      "SELECT ra.asset_id,p.name FROM revision_assets ra JOIN studio_presets p ON p.approved_revision_id=ra.revision_id WHERE p.owner_id=$1 UNION SELECT ra.asset_id,sh.title AS name FROM revision_assets ra JOIN studio_share_variants v ON v.revision_id=ra.revision_id JOIN studio_shares sh ON sh.id=v.share_id WHERE sh.owner_id=$1 AND sh.status IN('pending','approved')",
      [user],
    ))
      (usage[row.asset_id] ??= []).push(`${row.name} · retained version`);
    const canUseCustomTint = await this.service.tintAccess(user, false);
    return {
      presets: await Promise.all(presets.map((p) => this.presetDto(p, this.db, false))),
      library: library!.document,
      libraryVersion: library!.version,
      automation: {
        enabled: account!.automation_enabled,
        rules: automation!.rules,
        version: automation!.version,
      },
      manualRevisionId: account!.manual_revision_id,
      activeRevisionId: account!.published_revision,
      capacity: canUseCustomTint ? 20 : 5,
      canUseCustomTint,
      shares: await this.shares(user, true),
      badges: (await this.db.query(
        "SELECT b.* FROM studio_badges b JOIN studio_badge_assignments a ON a.badge_id=b.id WHERE a.user_id=$1 AND b.enabled=true",
        [user],
      )) as any,
      mediaMetadata: Object.fromEntries(meta.map((m) => [m.media_id, m.document])),
      usage,
    };
  }
  async createPreset(user: string, name: string, sourceId?: string) {
    await this.service.permissions.member(user);
    await this.ensure(user);
    const capacity = await this.capacity(user);
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
      const [count] = await tx.query("SELECT count(*)::int AS n FROM studio_presets WHERE owner_id=$1", [
        user,
      ]);
      invariant(count!.n < capacity, 429, "PRESET_LIMIT", `Your ${capacity}-preset allowance is full.`);
      const config = sourceId
        ? (await this.preset(user, sourceId, tx)).draft
        : structuredClone(DEFAULT_CONFIG);
      const id = randomUUID();
      await tx.query("INSERT INTO studio_presets(id,owner_id,name,draft) VALUES($1,$2,$3,$4)", [
        id,
        user,
        name,
        JSON.stringify(config),
      ]);
      await this.refs(tx, id, config);
      return this.presetDto(await this.preset(user, id, tx), tx);
    });
  }
  async savePreset(user: string, id: string, version: number, value: unknown, name?: string) {
    await this.service.permissions.member(user);
    const config = profileV2Schema.parse(value),
      custom = await this.service.tintAccess(user);
    invariant(
      Buffer.byteLength(JSON.stringify(config), "utf8") <= 64 * 1024,
      413,
      "PROFILE_SIZE",
      "This preset exceeds its 64 KiB configuration limit. Shorten its links or text.",
    );
    return this.db.transaction(async (tx) => {
      const p = await this.preset(user, id, tx, true);
      invariant(
        p.version === version,
        409,
        "DRAFT_CONFLICT",
        "This preset changed on another device. Keep your local draft or reload the saved version.",
      );
      const [approved] = p.approved_revision_id
        ? await tx.query("SELECT config FROM revisions WHERE id=$1 AND status='approved'", [
            p.approved_revision_id,
          ])
        : [];
      await this.service.validateTints(tx, user, config, custom, approved?.config ?? null);
      await this.service.validateAssets(tx, user, config);
      await tx.query(
        "UPDATE studio_presets SET draft=$1,name=COALESCE($2,name),version=version+1,updated_at=now() WHERE id=$3",
        [JSON.stringify(config), name ?? null, id],
      );
      await this.refs(tx, id, config);
      await tx.query("UPDATE users SET draft=$1,draft_version=$2 WHERE id=$3 AND default_preset_id=$4", [
        JSON.stringify(config),
        version + 1,
        user,
        id,
      ]);
      await tx.query("DELETE FROM admin_confirmations WHERE user_id=$1", [user]);
      return { version: version + 1 };
    });
  }
  async renamePreset(user: string, id: string, name: string) {
    await this.service.permissions.member(user);
    await this.preset(user, id);
    await this.db.query("UPDATE studio_presets SET name=$1,updated_at=now() WHERE id=$2 AND owner_id=$3", [
      name,
      id,
      user,
    ]);
    return { ok: true };
  }
  async deletePreset(user: string, id: string) {
    await this.service.permissions.member(user);
    await this.db.transaction(async (tx) => {
      const [account] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user]);
      await this.preset(user, id, tx, true);
      invariant(
        account!.default_preset_id !== id,
        409,
        "DEFAULT_PRESET",
        "Keep your original preset. You can rename it or reset its appearance.",
      );
      invariant(
        !(
          await tx.query(
            "SELECT id FROM revisions WHERE preset_id=$1 AND (status='pending' OR id=$2 OR id=$3)",
            [id, account!.published_revision, account!.manual_revision_id],
          )
        ).length,
        409,
        "PRESET_IN_USE",
        "Activate a different preset and finish its pending review before deleting this preset.",
      );
      await tx.query("DELETE FROM studio_presets WHERE id=$1", [id]);
      await tx.query(
        "UPDATE studio_automation SET rules=COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(rules) v WHERE v->>'presetId'<>$1),'[]'::jsonb),version=version+1 WHERE owner_id=$2",
        [id, user],
      );
    });
    return { ok: true };
  }
  async submitPreset(user: string, id: string, version: number, activate: boolean, confirmationId?: string) {
    await this.service.permissions.member(user, !!confirmationId);
    if (confirmationId)
      invariant(
        this.service.permissions.isOwner(user),
        403,
        "OWNER_REQUIRED",
        "Only the owner can publish a confirmed test preset.",
      );
    const custom = await this.service.tintAccess(user);
    return this.db.transaction(async (tx) => {
      const [account] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user]);
      const p = await this.preset(user, id, tx, true);
      if (confirmationId) {
        const [confirmed] = await tx.query(
          "UPDATE admin_confirmations SET consumed_at=now() WHERE id=$1 AND user_id=$2 AND target_id=$3 AND action='publish' AND draft_version=$4 AND config_hash=$5 AND confirmed_at IS NOT NULL AND consumed_at IS NULL AND expires_at>now() RETURNING id",
          [confirmationId, user, `preset:${id}`, version, hash(JSON.stringify(p.draft))],
        );
        invariant(
          confirmed,
          403,
          "CONFIRMATION_REQUIRED",
          "Confirm this exact saved preset with /profile confirm before publishing.",
        );
      }
      invariant(p.version === version, 409, "DRAFT_CONFLICT", "Save the current preset before submitting.");
      invariant(
        !(await tx.query("SELECT id FROM revisions WHERE user_id=$1 AND status='pending'", [user])).length,
        409,
        "ALREADY_PENDING",
        "You already have a preset awaiting review.",
      );
      const config = profileV2Schema.parse(normalizeStudio(p.draft));
      const [reference] = p.approved_revision_id
        ? await tx.query("SELECT config FROM revisions WHERE id=$1 AND status='approved'", [
            p.approved_revision_id,
          ])
        : [];
      await this.service.validateTints(tx, user, config, custom, reference?.config ?? null);
      await this.service.validateAssets(tx, user, config);
      const revision = randomUUID();
      const [row] = await tx.query(
        "INSERT INTO revisions(id,user_id,config,status,preset_id,baseline_revision_id,activate_on_approval) VALUES($1,$2,$3,'pending',$4,$5,$6) RETURNING *",
        [revision, user, JSON.stringify(config), id, account!.published_revision, activate],
      );
      for (const asset of assetIds(config))
        await tx.query("INSERT INTO revision_assets(revision_id,asset_id) VALUES($1,$2)", [revision, asset]);
      if (confirmationId) {
        await tx.query("UPDATE revisions SET status='approved',decided_at=now(),decided_by=$1 WHERE id=$2", [
          user,
          revision,
        ]);
        await tx.query("UPDATE studio_presets SET approved_revision_id=$1 WHERE id=$2", [revision, id]);
        await tx.query(
          "UPDATE users SET published_revision=$1,manual_revision_id=$1,auto_revision_id=NULL,auto_session_hash=NULL,auto_lease_until=NULL,automation_enabled=false,updated_at=now() WHERE id=$2",
          [revision, user],
        );
        await this.service.audit(tx, user, "admin_publish", revision);
        return this.service.revision((await tx.query("SELECT * FROM revisions WHERE id=$1", [revision]))[0]!);
      }
      await this.service.audit(tx, user, "submit", revision);
      await this.service.event(tx, "moderation", { revisionId: revision, userId: user });
      return this.service.revision(row!);
    });
  }
  async beginPresetConfirmation(user: string, id: string, version: number) {
    await this.service.permissions.member(user, true);
    invariant(
      this.service.permissions.isOwner(user),
      403,
      "OWNER_REQUIRED",
      "Only the owner can prepare test publication.",
    );
    return this.db.transaction(async (tx) => {
      const p = await this.preset(user, id, tx, true);
      invariant(p.version === version, 409, "DRAFT_CONFLICT", "Save the current preset first.");
      const confirmation = randomUUID(),
        code = randomBytes(16).toString("hex");
      await tx.query("DELETE FROM admin_confirmations WHERE user_id=$1", [user]);
      await tx.query(
        "INSERT INTO admin_confirmations(id,user_id,action,target_id,draft_version,config_hash,code_hash,expires_at) VALUES($1,$2,'publish',$3,$4,$5,$6,now()+interval '5 minutes')",
        [confirmation, user, `preset:${id}`, version, hash(JSON.stringify(p.draft)), hash(code)],
      );
      return { id: confirmation, code, expiresIn: 300 };
    });
  }
  async activate(user: string, id: string, sessionHash?: string) {
    await this.service.permissions.member(user);
    return this.db.transaction(async (tx) => {
      const [account] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user]);
      const p = await this.preset(user, id, tx);
      const [revision] = await tx.query(
        "SELECT * FROM revisions WHERE id=$1 AND user_id=$2 AND status='approved'",
        [p.approved_revision_id, user],
      );
      invariant(revision, 409, "NOT_APPROVED", "This preset has no approved version.");
      await this.service.validateAssets(tx, user, revision.config);
      if (sessionHash) {
        invariant(
          account!.automation_enabled,
          409,
          "AUTOMATION_OFF",
          "Enable automation before switching automatically.",
        );
        const [rules] = await tx.query("SELECT rules FROM studio_automation WHERE owner_id=$1", [user]);
        invariant(
          rules?.rules.some((r: AutomationRule) => r.enabled && r.presetId === id),
          403,
          "INVALID_RULE",
          "Automation can only activate an enabled approved preset rule.",
        );
        invariant(
          !account!.auto_session_hash ||
            account!.auto_session_hash === sessionHash ||
            new Date(account!.auto_lease_until).getTime() < Date.now(),
          409,
          "AUTOMATION_DEVICE",
          "Automation is controlled by another device.",
        );
        await tx.query(
          "UPDATE users SET published_revision=$1,auto_revision_id=$1,auto_session_hash=$2,auto_lease_until=now()+interval '90 seconds',updated_at=CASE WHEN published_revision IS DISTINCT FROM $1 THEN now() ELSE updated_at END WHERE id=$3",
          [revision.id, sessionHash, user],
        );
      } else {
        await tx.query(
          "UPDATE users SET published_revision=$1,manual_revision_id=$1,auto_revision_id=NULL,auto_session_hash=NULL,auto_lease_until=NULL,automation_enabled=false,updated_at=now() WHERE id=$2",
          [revision.id, user],
        );
        await this.service.audit(tx, user, "preset_activate", id);
      }
      return { ok: true, revisionId: revision.id };
    });
  }
  async saveLibrary(user: string, version: number, value: unknown) {
    await this.service.permissions.member(user);
    await this.ensure(user);
    const doc = librarySchema.parse(value),
      capacity = await this.capacity(user);
    return this.db.transaction(async (tx) => {
      const [old] = await tx.query("SELECT * FROM studio_library WHERE owner_id=$1 FOR UPDATE", [user]);
      invariant(
        old!.version === version,
        409,
        "LIBRARY_CONFLICT",
        "Your library changed on another device. Refresh before saving.",
      );
      invariant(
        doc.collections.length <= capacity ||
          (doc.collections.length <= old!.document.collections.length &&
            doc.collections.every((c) => old!.document.collections.some((v: any) => v.id === c.id))),
        429,
        "COLLECTION_LIMIT",
        `Your ${capacity}-collection allowance is full.`,
      );
      await tx.query("UPDATE studio_library SET document=$1,version=version+1 WHERE owner_id=$2", [
        JSON.stringify(doc),
        user,
      ]);
      return { version: version + 1 };
    });
  }
  async mediaMeta(user: string, id: string, value: unknown) {
    await this.service.permissions.member(user);
    const doc = metadataSchema.parse(value);
    invariant(
      (await this.db.query("SELECT id FROM media WHERE id=$1 AND owner_id=$2", [id, user])).length,
      404,
      "NOT_FOUND",
      "Upload not found.",
    );
    await this.db.query(
      "INSERT INTO studio_media_meta(media_id,document) VALUES($1,$2) ON CONFLICT(media_id) DO UPDATE SET document=excluded.document",
      [id, JSON.stringify(doc)],
    );
    return { ok: true };
  }
  async removeMedia(user: string, id: string) {
    await this.service.permissions.member(user);
    invariant(
      (await this.db.query("SELECT id FROM media WHERE id=$1 AND owner_id=$2", [id, user])).length,
      404,
      "NOT_FOUND",
      "Upload not found.",
    );
    await this.service.tombstone("media", id);
    await this.db.transaction(async (tx) => {
      const ids = await this.service.mediaDescendants(tx, [id]);
      for (const child of ids) if (child !== id) await this.service.tombstone("media", child, tx);
      await tx.query("UPDATE media SET status='revoked' WHERE id=ANY($1::uuid[])", [ids]);
      await tx.query(
        "UPDATE users SET published_revision=NULL,manual_revision_id=NULL,auto_revision_id=NULL WHERE published_revision IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[])) OR manual_revision_id IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[]))",
        [ids],
      );
      await tx.query(
        "UPDATE studio_shares SET status='revoked' WHERE id IN(SELECT sv.share_id FROM studio_share_variants sv JOIN revision_assets ra ON ra.revision_id=sv.revision_id WHERE ra.asset_id=ANY($1::uuid[]))",
        [ids],
      );
      await this.service.audit(tx, user, "media_delete", id);
    });
    return { ok: true };
  }
  async shares(user: string, own = false): Promise<StyleShare[]> {
    await this.service.permissions.member(user);
    const rows = await this.db.query(
      own
        ? "SELECT * FROM studio_shares WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100"
        : "SELECT s.* FROM studio_shares s JOIN users u ON u.id=s.owner_id WHERE s.status='approved' AND u.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 100",
      own ? [user] : [],
    );
    return Promise.all(rows.map((r) => this.shareDto(r, this.db, true)));
  }
  async shareDto(row: Record<string, any>, db = this.db, summary = false): Promise<StyleShare> {
    const variants = await db.query(
      "SELECT v.name,r.id,r.config FROM studio_share_variants v JOIN revisions r ON r.id=v.revision_id WHERE v.share_id=$1 ORDER BY v.position",
      [row.id],
    );
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description,
      copyUploads: row.copy_uploads,
      status: row.status,
      reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(),
      variants: variants.map((v) => ({
        name: v.name,
        revisionId: v.id,
        config: summary
          ? {
              ...DEFAULT_CONFIG,
              colors: v.config.colors,
              decoration: v.config.decoration,
              effect: v.config.effect,
              nameplate: v.config.nameplate,
              profileEffect: v.config.profileEffect,
            }
          : v.config,
      })),
    };
  }
  async submitShare(
    user: string,
    title: string,
    description: string,
    presetIds: string[],
    copyUploads: boolean,
  ) {
    await this.service.permissions.member(user);
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
      invariant(
        !(await tx.query("SELECT id FROM studio_shares WHERE owner_id=$1 AND status='pending'", [user]))
          .length,
        409,
        "ALREADY_PENDING",
        "One shared style is already awaiting review.",
      );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO studio_shares(id,owner_id,title,description,copy_uploads,status) VALUES($1,$2,$3,$4,$5,'pending')",
        [id, user, title, description, copyUploads],
      );
      for (const [position, presetId] of presetIds.entries()) {
        const p = await this.preset(user, presetId, tx);
        const [rev] = await tx.query("SELECT * FROM revisions WHERE id=$1 AND status='approved'", [
          p.approved_revision_id,
        ]);
        invariant(rev, 409, "NOT_APPROVED", "Every shared variant must already be approved.");
        await this.service.validateAssets(tx, user, rev.config);
        await tx.query(
          "INSERT INTO studio_share_variants(share_id,revision_id,name,position) VALUES($1,$2,$3,$4)",
          [id, rev.id, p.name, position],
        );
      }
      await this.service.audit(tx, user, "style_submit", id);
      await this.service.event(tx, "style_moderation", { shareId: id, userId: user, title });
      return this.shareDto((await tx.query("SELECT * FROM studio_shares WHERE id=$1", [id]))[0]!, tx);
    });
  }
  async decideShare(actor: string, id: string, action: "approve" | "reject", reason?: string) {
    await this.service.permissions.moderator(actor);
    invariant(action !== "reject" || reason?.trim(), 400, "REASON_REQUIRED", "Enter a rejection reason.");
    await this.db.transaction(async (tx) => {
      const [share] = await tx.query(
        "SELECT s.* FROM studio_shares s JOIN users u ON u.id=s.owner_id WHERE s.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF s",
        [id],
      );
      invariant(share, 404, "NOT_FOUND", "Shared style not found.");
      invariant(
        share.status === "pending",
        409,
        "ALREADY_DECIDED",
        "This shared style has already been reviewed.",
      );
      if (action === "approve")
        for (const variant of (await this.shareDto(share, tx)).variants)
          await this.service.validateAssets(tx, share.owner_id, variant.config);
      await tx.query(
        "UPDATE studio_shares SET status=$1,reason=$2,decided_by=$3,decided_at=now() WHERE id=$4",
        [action === "approve" ? "approved" : "rejected", reason ?? null, actor, id],
      );
      await this.service.audit(tx, actor, `style_${action}`, id);
    });
    return { ok: true };
  }
  async withdrawShare(user: string, id: string) {
    await this.service.permissions.member(user);
    const rows = await this.db.query(
      "UPDATE studio_shares SET status='withdrawn' WHERE id=$1 AND owner_id=$2 AND status IN('pending','approved') RETURNING id",
      [id, user],
    );
    invariant(rows.length, 404, "NOT_FOUND", "Shared style not found.");
    await this.service.tombstone("share", id);
    return { ok: true };
  }
  restrictCustom(config: ProfileConfig, allowed: boolean) {
    const next = normalizeStudio(config);
    if (allowed) return next;
    const nearest = (hex: string) =>
      TINT_PALETTE.reduce((best, item) => {
        const distance = (v: string) =>
          [1, 3, 5].reduce(
            (n, p) => n + (parseInt(v.slice(p, p + 2), 16) - parseInt(hex.slice(p, p + 2), 16)) ** 2,
            0,
          );
        return distance(item.color) < distance(best.color) ? item : best;
      }).color;
    for (const scene of [next.studio.base, next.studio.small, next.studio.full])
      for (const l of scene.layers ?? [])
        if (l.tint && !isBasicTint(l.tint.color)) l.tint.color = nearest(l.tint.color);
    if (next.decorationTint && !isBasicTint(next.decorationTint.color))
      next.decorationTint.color = nearest(next.decorationTint.color);
    return { ...legacyConfig(next), configVersion: 2 as const, studio: next.studio };
  }
  async importStyle(
    user: string,
    shareId: string,
    revisionId: string,
    requestId: string,
    keep: { avatar: boolean; songs: boolean; panels: boolean },
    preservePresetId?: string,
  ) {
    await this.service.permissions.member(user);
    await this.ensure(user);
    const capacity = await this.capacity(user),
      custom = await this.service.tintAccess(user);
    const created: string[] = [];
    try {
      return await this.db.transaction(async (tx) => {
        // A serialization retry rolled back its rows, but not its copied files.
        for (const key of created) await this.files.remove(key);
        created.length = 0;
        await tx.query("SELECT pg_advisory_xact_lock(73812025)");
        const [account] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user]);
        const [existing] = await tx.query(
          "SELECT * FROM studio_imports WHERE owner_id=$1 AND request_id=$2",
          [user, requestId],
        );
        if (existing) return this.presetDto(await this.preset(user, existing.preset_id, tx), tx);
        const [share] = await tx.query(
          "SELECT s.* FROM studio_shares s JOIN users u ON u.id=s.owner_id WHERE s.id=$1 AND s.status='approved' AND u.deleted_at IS NULL FOR SHARE OF s",
          [shareId],
        );
        invariant(share, 404, "NOT_FOUND", "This shared style is no longer available.");
        const [variant] = await tx.query(
          "SELECT r.config,v.name FROM studio_share_variants v JOIN revisions r ON r.id=v.revision_id WHERE v.share_id=$1 AND r.id=$2 AND r.status='approved'",
          [shareId, revisionId],
        );
        invariant(variant, 404, "NOT_FOUND", "Shared variant not found.");
        await this.service.validateAssets(tx, share.owner_id, variant.config);
        const [count] = await tx.query("SELECT count(*)::int AS n FROM studio_presets WHERE owner_id=$1", [
          user,
        ]);
        invariant(count!.n < capacity, 429, "PRESET_LIMIT", `Your ${capacity}-preset allowance is full.`);
        let config = this.restrictCustom(variant.config, custom);
        const original = normalizeStudio(
          preservePresetId ? (await this.preset(user, preservePresetId, tx)).draft : account!.draft,
        );
        if (keep.avatar) config.avatar = original.avatar;
        if (keep.songs) config.studio.songs = original.studio.songs;
        if (keep.panels)
          for (const key of ["base", "small", "full"] as const) {
            if (original.studio[key].blocks)
              config.studio[key].blocks = structuredClone(original.studio[key].blocks);
            else delete config.studio[key].blocks;
          }
        config.studio.hiddenBadges = [];
        const shared = assetIds(config).filter((id) => !assetIds(original).includes(id));
        const mapping = new Map<string, string>();
        const sourceAssets = shared.length
          ? await tx.query(
              "SELECT * FROM media WHERE id=ANY($1::uuid[]) AND status='ready' ORDER BY id FOR SHARE",
              [shared],
            )
          : [];
        const copies = share.copy_uploads ? sourceAssets : [];
        const bytes = copies.reduce((n, m) => n + Number(m.output_bytes) + Number(m.preview_bytes), 0);
        const [quota] = await tx.query(
          "SELECT count(*)::int AS n,COALESCE(sum(input_bytes+output_bytes+preview_bytes),0)::bigint AS bytes FROM media WHERE owner_id=$1",
          [user],
        );
        const [daily] = await tx.query(
          "SELECT count(*)::int AS n FROM upload_events WHERE user_id=$1 AND created_at>now()-interval '24 hours'",
          [user],
        );
        invariant(
          Number(quota!.bytes) + bytes <= 100 * 1024 * 1024 && quota!.n + copies.length <= 200,
          429,
          "MEDIA_QUOTA",
          "Your media allowance cannot fit this style.",
        );
        invariant(
          daily!.n + copies.length <= 10,
          429,
          "DAILY_QUOTA",
          "Copying this style would exceed your daily 10-file allowance.",
        );
        if (copies.length) {
          const space = await statfs(join(this.files.root, "processed"));
          invariant(
            space.bavail * space.bsize - bytes >= 256 * 1024 * 1024,
            507,
            "STORAGE_FULL",
            "Style imports are paused because storage is low.",
          );
        }
        for (const m of copies) {
          const id = randomUUID(),
            ext = m.mime === "audio/ogg" ? "ogg" : "webp",
            output = `processed/${id}.${ext}`,
            preview = m.preview_key ? `processed/${id}.png` : null;
          await copyFile(this.files.path(m.output_key), this.files.path(output), constants.COPYFILE_EXCL);
          created.push(output);
          if (preview) {
            await copyFile(this.files.path(m.preview_key), this.files.path(preview), constants.COPYFILE_EXCL);
            created.push(preview);
          }
          await tx.query(
            "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,preview_key,mime,animated,duration,width,height,output_bytes,preview_bytes) VALUES($1,$2,$3,'ready','shared upload',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            [
              id,
              user,
              m.slot,
              `quarantine/${id}.bin`,
              output,
              preview,
              m.mime,
              m.animated,
              m.duration,
              m.width,
              m.height,
              m.output_bytes,
              m.preview_bytes,
            ],
          );
          await tx.query("INSERT INTO media_derivations(parent_id,child_id) VALUES($1,$2)", [m.id, id]);
          await tx.query("INSERT INTO upload_events(id,user_id) VALUES($1,$2)", [id, user]);
          mapping.set(m.id, id);
        }
        const replace = (id: string | null) =>
          !id ? null : assetIds(original).includes(id) ? id : (mapping.get(id) ?? null);
        config.avatar = replace(config.avatar);
        config.banner = replace(config.banner);
        config.audio = replace(config.audio);
        for (const key of ["effect", "decoration"] as const)
          if (config[key]?.source === "media") {
            const id = replace(config[key]!.id);
            config[key] = id ? { source: "media", id } : null;
          }
        for (const scene of [config.studio.base, config.studio.small, config.studio.full])
          if (scene.layers)
            scene.layers = scene.layers
              .filter((l) => l.source !== "media" || !!replace(l.assetId))
              .map((l) => (l.source === "media" ? { ...l, assetId: replace(l.assetId) } : l));
        config = profileV2Schema.parse({ ...legacyConfig(config), configVersion: 2, studio: config.studio });
        await this.service.validateAssets(tx, user, config);
        const id = randomUUID();
        await tx.query("INSERT INTO studio_presets(id,owner_id,name,draft) VALUES($1,$2,$3,$4)", [
          id,
          user,
          variant.name,
          JSON.stringify(config),
        ]);
        await this.refs(tx, id, config);
        await tx.query(
          "INSERT INTO studio_imports(owner_id,request_id,share_id,preset_id) VALUES($1,$2,$3,$4)",
          [user, requestId, shareId, id],
        );
        await this.service.audit(tx, user, "style_import", shareId);
        return this.presetDto(await this.preset(user, id, tx), tx);
      });
    } catch (error) {
      for (const key of created) await this.files.remove(key);
      throw error;
    }
  }
  async saveAutomation(
    user: string,
    version: number,
    rulesValue: unknown,
    enabled: boolean,
    sessionHash?: string,
  ) {
    await this.service.permissions.member(user);
    await this.ensure(user);
    const rules = automationRulesSchema.parse(rulesValue);
    return this.db.transaction(async (tx) => {
      const [current] = await tx.query("SELECT * FROM studio_automation WHERE owner_id=$1 FOR UPDATE", [
        user,
      ]);
      invariant(
        current!.version === version,
        409,
        "AUTOMATION_CONFLICT",
        "Automation rules changed. Reload them before saving.",
      );
      for (const rule of rules) {
        const p = await this.preset(user, rule.presetId, tx);
        if (rule.enabled) {
          const [r] = await tx.query("SELECT * FROM revisions WHERE id=$1 AND status='approved'", [
            p.approved_revision_id,
          ]);
          invariant(r, 409, "NOT_APPROVED", "Automation targets must be approved.");
          await this.service.validateAssets(tx, user, r.config);
        }
      }
      await tx.query("UPDATE studio_automation SET rules=$1,version=version+1 WHERE owner_id=$2", [
        JSON.stringify(rules),
        user,
      ]);
      await tx.query(
        "UPDATE users SET automation_enabled=$1,published_revision=manual_revision_id,auto_revision_id=NULL,auto_session_hash=CASE WHEN $1 THEN $3 ELSE NULL END,auto_lease_until=CASE WHEN $1 AND $3 IS NOT NULL THEN now()+interval '90 seconds' ELSE NULL END,updated_at=now() WHERE id=$2",
        [enabled, user, sessionHash ?? null],
      );
      return { version: version + 1 };
    });
  }
  async releaseAutomation(user: string, sessionHash: string) {
    await this.service.permissions.member(user);
    await this.db.transaction(async (tx) => {
      const [account] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user]);
      invariant(account?.automation_enabled, 409, "AUTOMATION_OFF", "Automation is disabled.");
      invariant(
        !account.auto_session_hash ||
          account.auto_session_hash === sessionHash ||
          new Date(account.auto_lease_until).getTime() < Date.now(),
        409,
        "AUTOMATION_DEVICE",
        "Automation is controlled by another device.",
      );
      await tx.query(
        "UPDATE users SET published_revision=manual_revision_id,auto_revision_id=NULL,auto_session_hash=$1,auto_lease_until=now()+interval '90 seconds',updated_at=CASE WHEN published_revision IS DISTINCT FROM manual_revision_id THEN now() ELSE updated_at END WHERE id=$2",
        [sessionHash, user],
      );
    });
    return { ok: true };
  }
  async catalogMetadata(actor: string, id: string, value: unknown) {
    await this.service.permissions.member(actor);
    invariant(
      this.service.permissions.isOwner(actor),
      403,
      "OWNER_REQUIRED",
      "Only the owner can tag catalog items.",
    );
    const doc = catalogMetadataSchema.parse(value);
    invariant(
      (
        await this.db.query("UPDATE catalog SET metadata=$1 WHERE id=$2 RETURNING id", [
          JSON.stringify(doc),
          id,
        ])
      ).length,
      404,
      "NOT_FOUND",
      "Catalog item not found.",
    );
    return { ok: true };
  }
  async badge(actor: string, name: string, icon: string, description: string, id?: string) {
    await this.service.permissions.member(actor);
    invariant(
      this.service.permissions.isOwner(actor),
      403,
      "OWNER_REQUIRED",
      "Only the owner manages Studio badges.",
    );
    const target = id ?? randomUUID();
    await this.db.query(
      "INSERT INTO studio_badges(id,name,icon,description) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,icon=$3,description=$4",
      [target, name, icon, description],
    );
    await this.service.audit(this.db, actor, "badge_define", target);
    return { id: target };
  }
  async assignBadge(actor: string, badge: string, user: string, grant: boolean) {
    await this.service.permissions.member(actor);
    invariant(
      this.service.permissions.isOwner(actor),
      403,
      "OWNER_REQUIRED",
      "Only the owner awards Studio badges.",
    );
    invariant(
      (await this.db.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL", [user])).length,
      404,
      "NOT_FOUND",
      "Member not found.",
    );
    invariant(
      (await this.db.query("SELECT id FROM studio_badges WHERE id=$1 AND enabled=true", [badge])).length,
      404,
      "NOT_FOUND",
      "Badge not found.",
    );
    if (grant)
      await this.db.query(
        "INSERT INTO studio_badge_assignments(badge_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [badge, user],
      );
    else {
      await this.service.tombstone("badge", `${badge}:${user}`);
      await this.db.query("DELETE FROM studio_badge_assignments WHERE badge_id=$1 AND user_id=$2", [
        badge,
        user,
      ]);
    }
    await this.service.audit(this.db, actor, grant ? "badge_grant" : "badge_revoke", badge, { userId: user });
    return { ok: true };
  }
  async queue(actor: string) {
    await this.service.permissions.moderator(actor);
    return {
      profiles: (
        await this.db.query(
          "SELECT r.* FROM revisions r JOIN users u ON u.id=r.user_id WHERE r.status='pending' AND u.deleted_at IS NULL ORDER BY r.created_at LIMIT 50",
        )
      ).map((r) => ({ ...this.service.revision(r), config: legacyConfig(r.config) })),
      shares: await Promise.all(
        (
          await this.db.query(
            "SELECT s.* FROM studio_shares s JOIN users u ON u.id=s.owner_id WHERE s.status='pending' AND u.deleted_at IS NULL ORDER BY s.created_at LIMIT 50",
          )
        ).map((r) => this.shareDto(r, this.db, true)),
      ),
    };
  }
  async refs(db: Database, id: string, config: ProfileConfig) {
    await db.query("DELETE FROM studio_preset_assets WHERE preset_id=$1", [id]);
    for (const asset of assetIds(config))
      await db.query(
        "INSERT INTO studio_preset_assets(preset_id,asset_id) SELECT $1,id FROM media WHERE id=$2 ON CONFLICT DO NOTHING",
        [id, asset],
      );
  }
}
