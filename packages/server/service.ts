import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import type { Permissions } from "./permissions.js";
import { invariant, AppError } from "./errors.js";
import { displayMediaError } from "./media-errors.js";
import { SecurityJournal, type TombstoneKind } from "./journal.js";
import { profileConfigSchema, catalogSchema } from "../shared/schema.js";
import { isBasicTint } from "../shared/domain/tint.js";
import { parseStoredProfile } from "../shared/studio-schema.js";
import { tintEntries } from "../shared/domain/studio-model.js";
import {
  DEFAULT_CONFIG,
  assetIds,
  type ProfileConfig,
  type PublicProfile,
  type MediaAsset,
  type EditorState,
  type ProfileRevision,
  type CatalogItem,
} from "../shared/domain/model.js";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: Date | string) => new Date(value).toISOString();
export class ProfileService {
  async tintAccess(userId: string, fresh = true) {
    return (
      this.permissions.isOwner(userId) || (await this.permissions.canUseCustomTint?.(userId, fresh)) === true
    );
  }
  async validateTints(
    db: Database,
    userId: string,
    config: ProfileConfig,
    allowed: boolean,
    reference?: ProfileConfig | null,
  ) {
    if (allowed) return;
    const custom = tintEntries(config).filter(([, tint]) => !isBasicTint(tint.color));
    if (!custom.length) return;
    const [row] =
      reference === undefined
        ? await db.query(
            "SELECT r.config FROM users u JOIN revisions r ON r.id=u.published_revision WHERE u.id=$1 AND r.status='approved'",
            [userId],
          )
        : [];
    const approved = new Map(reference || row?.config ? tintEntries(reference ?? row!.config) : []);
    for (const [key, tint] of custom)
      invariant(
        approved.get(key)?.color.toLowerCase() === tint.color.toLowerCase(),
        403,
        "SUPPORTER_REQUIRED",
        "A supporter role is required to choose a new custom tint. Select a basic color or keep your published color.",
      );
  }
  constructor(
    public db: Database,
    public permissions: Permissions,
    public publicUrl: string,
    public journal?: SecurityJournal,
  ) {}
  async ensureUser(id: string, db = this.db): Promise<void> {
    if (db === this.db) return this.db.transaction((tx) => this.ensureUser(id, tx));
    await db.query("SELECT pg_advisory_xact_lock(73812024)");
    invariant(
      !(await db.query("SELECT user_hash FROM erasures WHERE user_hash=$1", [hash(id)])).length,
      403,
      "ACCOUNT_DELETED",
      "This account was deleted. Contact the operator to rejoin.",
    );
    const [count] = await db.query("SELECT count(*)::integer AS count FROM users WHERE deleted_at IS NULL");
    invariant(
      count!.count < 50 ||
        (await db.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL", [id])).length,
      403,
      "BETA_FULL",
      "The 50-person beta is full.",
    );
    await db.query("INSERT INTO users(id,draft,admitted_at) VALUES($1,$2,now()) ON CONFLICT(id) DO NOTHING", [
      id,
      JSON.stringify(DEFAULT_CONFIG),
    ]);
  }
  async audit(db: Database, actor: string, action: string, target: string, detail: unknown = {}) {
    await db.query("INSERT INTO audit(id,actor_id,action,target_id,detail) VALUES($1,$2,$3,$4,$5)", [
      randomUUID(),
      actor,
      action,
      target,
      JSON.stringify(detail),
    ]);
  }
  async tombstone(kind: TombstoneKind, id: string, tx?: Database) {
    if (this.journal) {
      const write = async (tx: Database) => {
        await tx.query("SELECT pg_advisory_xact_lock(73812027)");
        await this.journal!.record(kind, id);
      };
      if (tx) await write(tx);
      else await this.db.transaction(write);
    }
  }
  async event(db: Database, kind: string, payload: unknown) {
    await db.query("INSERT INTO outbox(id,kind,payload) VALUES($1,$2,$3)", [
      randomUUID(),
      kind,
      JSON.stringify(payload),
    ]);
  }
  async createPairing(expectedUserId: string) {
    const id = randomUUID(),
      code = randomBytes(16).toString("hex"),
      pollSecret = randomBytes(32).toString("base64url");
    await this.db.query("DELETE FROM pairings WHERE expires_at < now()");
    await this.db.query(
      "INSERT INTO pairings(id,code_hash,poll_hash,expected_user_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
      [id, hash(code), hash(pollSecret), expectedUserId],
    );
    return { id, code, pollSecret, expiresIn: 300 };
  }
  async connect(code: string, actor: string) {
    await this.permissions.member(actor);
    await this.db.transaction(async (tx) => {
      const [pair] = await tx.query(
        "SELECT * FROM pairings WHERE code_hash=$1 AND expires_at>now() AND NOT consumed FOR UPDATE",
        [hash(code)],
      );
      invariant(pair && !pair.user_id, 400, "INVALID_CODE", "The code is invalid, expired or already used.");
      invariant(
        pair.expected_user_id === actor,
        403,
        "WRONG_ACCOUNT",
        "The code belongs to another Discord account.",
      );
      await tx.query("SELECT pg_advisory_xact_lock(73812024)");
      await this.ensureUser(actor, tx);
      const [current] = await tx.query("SELECT admitted_at,deleted_at FROM users WHERE id=$1 FOR UPDATE", [
        actor,
      ]);
      invariant(!current!.deleted_at, 403, "ACCOUNT_DELETED", "This account was deleted.");
      if (!current!.admitted_at) {
        const [count] = await tx.query(
          "SELECT count(*)::integer AS count FROM users WHERE admitted_at IS NOT NULL AND deleted_at IS NULL",
        );
        invariant(count!.count < 50, 403, "BETA_FULL", "The 50-person beta is full.");
        await tx.query("UPDATE users SET admitted_at=now() WHERE id=$1", [actor]);
      }
      await tx.query("UPDATE pairings SET user_id=$1 WHERE id=$2", [actor, pair.id]);
    });
  }
  async pollPairing(id: string, secret: string) {
    return this.db.transaction(async (tx) => {
      const [pair] = await tx.query(
        "SELECT * FROM pairings WHERE id=$1 AND poll_hash=$2 AND expires_at>now() AND NOT consumed FOR UPDATE",
        [id, hash(secret)],
      );
      invariant(pair, 410, "PAIR_EXPIRED", "Pairing expired. Request a new code.");
      if (!pair.user_id) return { ready: false as const };
      await this.permissions.member(pair.user_id, true);
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [pair.user_id]);
      const token = randomBytes(32).toString("base64url");
      await tx.query("DELETE FROM sessions WHERE expires_at<now()");
      await tx.query("UPDATE pairings SET consumed=true WHERE id=$1", [id]);
      await tx.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '90 days')",
        [hash(token), pair.user_id],
      );
      await tx.query(
        "DELETE FROM sessions WHERE token_hash IN(SELECT token_hash FROM sessions WHERE user_id=$1 ORDER BY created_at DESC,id DESC OFFSET 10)",
        [pair.user_id],
      );
      return { ready: true as const, token, userId: pair.user_id as string };
    });
  }
  async authenticate(token: string) {
    invariant(
      token.length >= 32 && token.length <= 100,
      401,
      "UNAUTHORIZED",
      "Pair the plugin with the bot again.",
    );
    const [session] = await this.db.query(
      "UPDATE sessions SET expires_at=now()+interval '90 days',last_seen_at=now() WHERE token_hash=$1 AND expires_at>now() AND EXISTS(SELECT 1 FROM users u WHERE u.id=sessions.user_id AND u.deleted_at IS NULL) RETURNING user_id",
      [hash(token)],
    );
    invariant(session, 401, "SESSION_EXPIRED", "Your session expired. Pair the plugin again.");
    return session.user_id as string;
  }
  async logout(token: string) {
    await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [hash(token)]);
  }
  async sessions(userId: string, currentToken: string) {
    const rows = await this.db.query(
      "SELECT id,device_name,created_at,last_seen_at,expires_at,token_hash=$2 AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_seen_at DESC",
      [userId, hash(currentToken)],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.device_name,
      createdAt: iso(row.created_at),
      lastSeenAt: iso(row.last_seen_at),
      expiresAt: iso(row.expires_at),
      current: row.current,
    }));
  }
  async revokeSession(userId: string, id?: string) {
    await this.db.query(
      id ? "DELETE FROM sessions WHERE user_id=$1 AND id=$2" : "DELETE FROM sessions WHERE user_id=$1",
      id ? [userId, id] : [userId],
    );
    await this.audit(this.db, userId, "session_revoke", userId);
  }
  async beginPublishConfirmation(userId: string, version: number) {
    await this.permissions.member(userId, true);
    invariant(
      this.permissions.isOwner(userId),
      403,
      "OWNER_REQUIRED",
      "Only the owner can publish immediately.",
    );
    const [user] = await this.db.query(
      "SELECT draft,draft_version FROM users WHERE id=$1 AND deleted_at IS NULL",
      [userId],
    );
    invariant(user && user.draft_version === version, 409, "DRAFT_CONFLICT", "Save the current draft first.");
    const id = randomUUID(),
      code = randomBytes(16).toString("hex");
    await this.db.query("DELETE FROM admin_confirmations WHERE user_id=$1", [userId]);
    await this.db.query(
      "INSERT INTO admin_confirmations(id,user_id,action,target_id,draft_version,config_hash,code_hash,expires_at) VALUES($1,$2,'publish',$2,$3,$4,$5,now()+interval '5 minutes')",
      [id, userId, version, hash(JSON.stringify(user.draft)), hash(code)],
    );
    return { id, code, expiresIn: 300 };
  }
  async confirmPublish(userId: string, code: string) {
    await this.permissions.member(userId, true);
    invariant(
      this.permissions.isOwner(userId),
      403,
      "OWNER_REQUIRED",
      "Only the owner can confirm publication.",
    );
    const rows = await this.db.query(
      "UPDATE admin_confirmations c SET confirmed_at=now() FROM users u WHERE c.code_hash=$1 AND c.user_id=$2 AND c.action='publish' AND u.id=c.user_id AND ((c.target_id=$2 AND u.draft_version=c.draft_version) OR EXISTS(SELECT 1 FROM studio_presets p WHERE p.owner_id=$2 AND 'preset:'||p.id::text=c.target_id AND p.version=c.draft_version)) AND c.expires_at>now() AND c.confirmed_at IS NULL AND c.consumed_at IS NULL RETURNING c.id",
      [hash(code), userId],
    );
    invariant(
      rows.length,
      400,
      "INVALID_CONFIRMATION",
      "The confirmation is invalid, expired or already used.",
    );
  }
  async exportData(userId: string) {
    const [user] = await this.db.query(
      "SELECT id,draft,draft_version,updated_at FROM users WHERE id=$1 AND deleted_at IS NULL",
      [userId],
    );
    invariant(user, 404, "NOT_FOUND", "Account not found.");
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      revisions: (await this.db.query("SELECT * FROM revisions WHERE user_id=$1", [userId])).map((v) =>
        this.revision(v),
      ),
      media: (await this.db.query("SELECT * FROM media WHERE owner_id=$1", [userId])).map((v) => ({
        ...this.media(v),
        url: `${this.publicUrl.replace(/\/$/, "")}/v1/privacy/media/${v.id}`,
        previewUrl: null,
      })),
      sessions: await this.sessions(userId, ""),
      studio: {
        presets: await this.db.query("SELECT * FROM studio_presets WHERE owner_id=$1", [userId]),
        library: await this.db.query("SELECT document FROM studio_library WHERE owner_id=$1", [userId]),
        automation: await this.db.query("SELECT rules FROM studio_automation WHERE owner_id=$1", [userId]),
        shares: await this.db.query(
          "SELECT id,title,description,status,copy_uploads,created_at FROM studio_shares WHERE owner_id=$1",
          [userId],
        ),
        mediaMetadata: await this.db.query(
          "SELECT sm.* FROM studio_media_meta sm JOIN media m ON m.id=sm.media_id WHERE m.owner_id=$1",
          [userId],
        ),
        badges: await this.db.query("SELECT badge_id FROM studio_badge_assignments WHERE user_id=$1", [
          userId,
        ]),
      },
      moderation: await this.db.query(
        "SELECT action,created_at,detail FROM audit WHERE actor_id=$1 OR target_id=$1 OR target_id IN(SELECT id::text FROM revisions WHERE user_id=$1 UNION ALL SELECT id::text FROM media WHERE owner_id=$1)",
        [userId],
      ),
    };
  }
  async deleteAccount(userId: string) {
    await this.tombstone("user", userId);
    await this.db.transaction(async (tx) => {
      const owned = await tx.query("SELECT id FROM media WHERE owner_id=$1", [userId]);
      const descendants = await this.mediaDescendants(
        tx,
        owned.map((v) => v.id),
      );
      for (const id of descendants) await this.tombstone("media", id, tx);
      await tx.query("UPDATE media SET status='revoked',erase_after=now() WHERE id=ANY($1::uuid[])", [
        descendants,
      ]);
      await tx.query(
        "UPDATE users SET published_revision=NULL,manual_revision_id=NULL,auto_revision_id=NULL WHERE published_revision IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[])) OR manual_revision_id IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[]))",
        [descendants],
      );
      await tx.query(
        "UPDATE studio_shares SET status='revoked' WHERE id IN(SELECT sv.share_id FROM studio_share_variants sv JOIN revision_assets ra ON ra.revision_id=sv.revision_id WHERE ra.asset_id=ANY($1::uuid[]))",
        [descendants],
      );
      await tx.query("UPDATE users SET deleted_at=now(),published_revision=NULL WHERE id=$1", [userId]);
      await tx.query("INSERT INTO erasures(user_hash) VALUES($1) ON CONFLICT DO NOTHING", [hash(userId)]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      await tx.query("DELETE FROM pairings WHERE expected_user_id=$1 OR user_id=$1", [userId]);
      await tx.query("DELETE FROM admin_confirmations WHERE user_id=$1", [userId]);
      await tx.query("UPDATE media SET status='revoked' WHERE owner_id=$1", [userId]);
      await tx.query("UPDATE moderation_messages SET erase=true WHERE owner_hash=$1", [hash(userId)]);
      await this.audit(tx, userId, "account_delete", userId);
    });
  }
  media(row: Record<string, any>): MediaAsset {
    const base = this.publicUrl.replace(/\/$/, "");
    return {
      id: row.id,
      ownerId: row.owner_id,
      slot: row.slot,
      status: row.status,
      mime: row.mime,
      animated: row.animated,
      duration: row.duration,
      width: row.width,
      height: row.height,
      url: `${base}/v1/media/${row.id}`,
      previewUrl: row.preview_key ? `${base}/v1/media/${row.id}/preview` : null,
      error: displayMediaError(row.error),
      createdAt: iso(row.created_at),
      bytes: Number(row.input_bytes ?? 0) + Number(row.output_bytes ?? 0) + Number(row.preview_bytes ?? 0),
    };
  }
  revision(row: Record<string, any>): ProfileRevision {
    return {
      id: row.id,
      userId: row.user_id,
      config: row.config,
      status: row.status,
      createdAt: iso(row.created_at),
      decidedAt: row.decided_at ? iso(row.decided_at) : null,
      reason: row.reason,
      presetId: row.preset_id ?? null,
      baselineRevisionId: row.baseline_revision_id ?? null,
      activateOnApproval: row.activate_on_approval ?? true,
    };
  }
  async publicProfiles(ids: string[], db = this.db): Promise<Record<string, PublicProfile | null>> {
    const result: Record<string, PublicProfile | null> = Object.fromEntries(ids.map((id) => [id, null]));
    if (!ids.length) return result;
    await db.query(
      "UPDATE users SET published_revision=manual_revision_id,auto_revision_id=NULL,auto_session_hash=NULL,auto_lease_until=NULL,updated_at=now() WHERE id=ANY($1::text[]) AND auto_revision_id IS NOT NULL AND auto_lease_until<now()",
      [ids],
    );
    const rows = await db.query(
      "SELECT r.*,u.updated_at FROM users u JOIN revisions r ON r.id=u.published_revision WHERE u.id=ANY($1::text[]) AND u.deleted_at IS NULL AND r.status='approved'",
      [ids],
    );
    for (const row of rows) {
      const assets = await db.query(
        "SELECT m.* FROM media m JOIN revision_assets ra ON ra.asset_id=m.id WHERE ra.revision_id=$1 AND m.status='ready'",
        [row.id],
      );
      if (assets.length !== assetIds(row.config).length) continue;
      result[row.user_id] = {
        userId: row.user_id,
        revisionId: row.id,
        config: row.config,
        media: Object.fromEntries(
          assets.map((a) => {
            const m = this.media(a);
            return [
              a.id,
              { id: m.id, url: m.url, previewUrl: m.previewUrl, mime: m.mime, animated: m.animated },
            ];
          }),
        ),
        updatedAt: iso(row.updated_at),
      };
      const badges = await db.query(
        "SELECT b.* FROM studio_badges b JOIN studio_badge_assignments a ON a.badge_id=b.id WHERE a.user_id=$1 AND b.enabled=true ORDER BY b.name",
        [row.user_id],
      );
      if (badges.length)
        result[row.user_id]!.badges = badges
          .filter((b) => !row.config.studio?.hiddenBadges?.includes(b.id))
          .map((b) => ({
            id: b.id,
            name: b.name,
            icon: b.icon,
            description: b.description,
            enabled: b.enabled,
          }));
    }
    return result;
  }
  async editor(userId: string): Promise<EditorState> {
    await this.permissions.member(userId);
    let canModerate = this.permissions.isOwner(userId);
    if (!canModerate) {
      try {
        await this.permissions.moderator(userId);
        canModerate = true;
      } catch (error) {
        if (!(error instanceof AppError && error.status === 403)) throw error;
      }
    }
    await this.ensureUser(userId);
    const [user] = await this.db.query("SELECT * FROM users WHERE id=$1", [userId]);
    const revisions = await this.db.query(
      "SELECT * FROM revisions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
      [userId],
    );
    const assets = await this.db.query(
      "SELECT * FROM media WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 200",
      [userId],
    );
    return {
      userId,
      isOwner: this.permissions.isOwner(userId),
      canModerate,
      canUseCustomTint: await this.tintAccess(userId, false),
      draft: user!.draft,
      draftVersion: user!.draft_version,
      revisions: revisions.map((row) => this.revision(row)),
      published: (await this.publicProfiles([userId]))[userId] ?? null,
      assets: assets.map((row) => this.media(row)),
    };
  }
  async validateAssets(db: Database, userId: string, config: ProfileConfig) {
    const slots: [string | null, string][] = [
      [config.avatar, "avatar"],
      [config.banner, "banner"],
      [config.audio, "audio"],
      [config.decoration?.source === "media" ? config.decoration.id : null, "decoration"],
      [config.effect?.source === "media" ? config.effect.id : null, "effect"],
      ...[config.studio?.base, config.studio?.small, config.studio?.full].flatMap((scene) =>
        (scene?.layers ?? [])
          .filter((l) => l.source === "media" && l.assetId)
          .map((l) => [l.assetId, "effect"] as [string | null, string]),
      ),
    ];
    // Sorted row locks serialize asset revocation and approval without deadlocks.
    const ids = assetIds(config).sort();
    const assets = ids.length
      ? await db.query("SELECT * FROM media WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids])
      : [];
    for (const [id, slot] of slots) {
      if (!id) continue;
      const asset = assets.find((row) => row.id === id);
      invariant(
        asset && asset.owner_id === userId && asset.slot === slot && asset.status === "ready",
        400,
        "INVALID_ASSET",
        "Select one of your processed files for the matching profile layer.",
      );
    }
    for (const [selection, kind] of [
      [config.decoration, "decoration"],
      [config.effect, "effect"],
      [config.nameplate ? { source: "discord", id: config.nameplate } : null, "nameplate"],
    ] as const) {
      if (selection?.source !== "discord") continue;
      invariant(
        (
          await db.query("SELECT id FROM catalog WHERE id=$1 AND kind=$2 AND enabled=true", [
            selection.id,
            kind,
          ])
        ).length,
        400,
        "INVALID_CATALOG",
        "This Discord effect is not currently available in the catalog.",
      );
    }
    for (const scene of [config.studio?.base, config.studio?.small, config.studio?.full])
      for (const layer of scene?.layers ?? [])
        if (layer.source === "discord" && layer.assetId)
          invariant(
            (
              await db.query("SELECT id FROM catalog WHERE id=$1 AND kind='effect' AND enabled=true", [
                layer.assetId,
              ])
            ).length,
            400,
            "INVALID_CATALOG",
            "Select an available profile effect.",
          );
  }
  async saveDraft(userId: string, value: unknown, version: number) {
    await this.permissions.member(userId);
    const config = profileConfigSchema.parse(value);
    const customTint = await this.tintAccess(userId);
    return this.db.transaction(async (tx) => {
      const [current] = await tx.query("SELECT draft,published_revision FROM users WHERE id=$1 FOR UPDATE", [
        userId,
      ]);
      const [published] = current?.published_revision
        ? await tx.query("SELECT config FROM revisions WHERE id=$1", [current.published_revision])
        : [];
      invariant(
        current?.draft?.configVersion !== 2 && published?.config.configVersion !== 2,
        409,
        "CLIENT_UPDATE_REQUIRED",
        "Update Profile Studio to edit this profile without losing Studio v2 settings.",
      );
      await this.ensureUser(userId, tx);
      await this.validateTints(tx, userId, config, customTint);
      await this.validateAssets(tx, userId, config);
      const [saved] = await tx.query(
        "UPDATE users SET draft=$1,draft_version=draft_version+1 WHERE id=$2 AND draft_version=$3 RETURNING draft_version",
        [JSON.stringify(config), userId, version],
      );
      invariant(
        saved,
        409,
        "DRAFT_CONFLICT",
        "The draft changed in another window. Your local changes are preserved; load the server draft to continue.",
      );
      await tx.query("DELETE FROM admin_confirmations WHERE user_id=$1", [userId]);
      const [preset] = await tx.query(
        "UPDATE studio_presets SET draft=$1,version=$2,updated_at=now() WHERE id=(SELECT default_preset_id FROM users WHERE id=$3) RETURNING id",
        [JSON.stringify(config), saved.draft_version, userId],
      );
      if (preset) {
        await tx.query("DELETE FROM studio_preset_assets WHERE preset_id=$1", [preset.id]);
        for (const id of assetIds(config))
          await tx.query("INSERT INTO studio_preset_assets(preset_id,asset_id) VALUES($1,$2)", [
            preset.id,
            id,
          ]);
      }
      return { version: saved.draft_version as number };
    });
  }
  async submit(userId: string, version: number, quickPublish = false, confirmationId?: string) {
    await this.permissions.member(userId);
    const customTint = await this.tintAccess(userId);
    if (quickPublish)
      invariant(
        this.permissions.isOwner(userId),
        403,
        "OWNER_REQUIRED",
        "Only the owner can publish immediately.",
      );
    return this.db.transaction(async (tx) => {
      const [user] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
      invariant(
        user && user.draft_version === version,
        409,
        "DRAFT_CONFLICT",
        "Save your current draft before submitting.",
      );
      const [active] = user.published_revision
        ? await tx.query("SELECT config FROM revisions WHERE id=$1", [user.published_revision])
        : [];
      invariant(
        user.draft.configVersion !== 2 && active?.config.configVersion !== 2,
        409,
        "CLIENT_UPDATE_REQUIRED",
        "Use the updated Studio workspace to submit this profile.",
      );
      if (quickPublish) {
        const [confirmation] = await tx.query(
          "UPDATE admin_confirmations SET consumed_at=now() WHERE id=$1 AND user_id=$2 AND target_id=$2 AND action='publish' AND draft_version=$3 AND config_hash=$4 AND confirmed_at IS NOT NULL AND consumed_at IS NULL AND expires_at>now() RETURNING id",
          [confirmationId ?? null, userId, version, hash(JSON.stringify(user.draft))],
        );
        invariant(
          confirmation,
          403,
          "CONFIRMATION_REQUIRED",
          "Confirm this exact draft with /profile confirm before publishing.",
        );
      }
      invariant(
        !(await tx.query("SELECT id FROM revisions WHERE user_id=$1 AND status='pending'", [userId])).length,
        409,
        "ALREADY_PENDING",
        "You already have a revision awaiting review.",
      );
      const config = profileConfigSchema.parse(user.draft);
      await this.validateTints(tx, userId, config, customTint);
      await this.validateAssets(tx, userId, config);
      const id = randomUUID();
      const [row] = await tx.query(
        "INSERT INTO revisions(id,user_id,config,status,decided_at,decided_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          id,
          userId,
          JSON.stringify(config),
          quickPublish ? "approved" : "pending",
          quickPublish ? new Date() : null,
          quickPublish ? userId : null,
        ],
      );
      for (const assetId of assetIds(config))
        await tx.query("INSERT INTO revision_assets VALUES($1,$2)", [id, assetId]);
      if (quickPublish)
        await tx.query(
          "UPDATE users SET published_revision=$1,manual_revision_id=$1,auto_revision_id=NULL,automation_enabled=false,updated_at=now() WHERE id=$2",
          [id, userId],
        );
      await tx.query(
        "UPDATE studio_presets SET draft=$1,version=$2,approved_revision_id=CASE WHEN $3 THEN $4::uuid ELSE approved_revision_id END WHERE id=$5",
        [JSON.stringify(config), user.draft_version, quickPublish, id, user.default_preset_id],
      );
      await tx.query("UPDATE revisions SET preset_id=$1,baseline_revision_id=$2 WHERE id=$3", [
        user.default_preset_id,
        user.published_revision,
        id,
      ]);
      await this.audit(tx, userId, quickPublish ? "owner_publish" : "submit", id);
      await this.event(tx, quickPublish ? "published" : "moderation", { revisionId: id, userId });
      return this.revision(row!);
    });
  }
  async review(actor: string, revisionId: string) {
    await this.permissions.moderator(actor);
    const [row] = await this.db.query(
      "SELECT r.* FROM revisions r JOIN users u ON u.id=r.user_id WHERE r.id=$1 AND u.deleted_at IS NULL",
      [revisionId],
    );
    invariant(row, 404, "NOT_FOUND", "Revision not found.");
    const assets = await this.db.query(
      "SELECT m.* FROM media m JOIN revision_assets ra ON ra.asset_id=m.id WHERE ra.revision_id=$1 AND m.status='ready'",
      [revisionId],
    );
    return { revision: this.revision(row), assets: assets.map((asset) => this.media(asset)) };
  }
  async decide(actor: string, revisionId: string, action: "approve" | "reject", reason?: string) {
    await this.permissions.moderator(actor);
    const [target] =
      action === "approve"
        ? await this.db.query("SELECT user_id FROM revisions WHERE id=$1", [revisionId])
        : [];
    const customTint = target ? await this.tintAccess(target.user_id) : false;
    invariant(
      action !== "reject" || reason?.trim(),
      400,
      "REASON_REQUIRED",
      "A rejection reason is required.",
    );
    return this.db.transaction(async (tx) => {
      const [revision] = await tx.query("SELECT * FROM revisions WHERE id=$1 FOR UPDATE", [revisionId]);
      if (revision)
        invariant(
          (await tx.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL", [revision.user_id]))
            .length,
          404,
          "NOT_FOUND",
          "Account not found.",
        );
      invariant(revision, 404, "NOT_FOUND", "Revision not found.");
      invariant(
        revision.status === "pending",
        409,
        "ALREADY_DECIDED",
        "This revision has already been reviewed.",
      );
      if (action === "approve") {
        await this.validateTints(
          tx,
          revision.user_id,
          parseStoredProfile(revision.config),
          customTint,
          revision.preset_id
            ? ((
                await tx.query(
                  "SELECT r.config FROM studio_presets p JOIN revisions r ON r.id=p.approved_revision_id WHERE p.id=$1 AND r.status='approved'",
                  [revision.preset_id],
                )
              )[0]?.config ?? null)
            : undefined,
        );
        await this.validateAssets(tx, revision.user_id, parseStoredProfile(revision.config));
        if (revision.preset_id)
          await tx.query(
            "UPDATE studio_presets SET approved_revision_id=$1,updated_at=now() WHERE id=$2 AND owner_id=$3",
            [revisionId, revision.preset_id, revision.user_id],
          );
        if (revision.activate_on_approval !== false)
          await tx.query(
            "UPDATE users SET published_revision=$1,manual_revision_id=$1,auto_revision_id=NULL,automation_enabled=false,updated_at=now() WHERE id=$2",
            [revisionId, revision.user_id],
          );
      }
      const [row] = await tx.query(
        "UPDATE revisions SET status=$1,decided_at=now(),decided_by=$2,reason=$3 WHERE id=$4 RETURNING *",
        [action === "approve" ? "approved" : "rejected", actor, reason ?? null, revisionId],
      );
      await this.audit(tx, actor, action, revisionId, { reason });
      await this.event(tx, action === "approve" ? "published" : "rejected", {
        revisionId,
        userId: revision.user_id,
        reason,
      });
      return this.revision(row!);
    });
  }
  async restore(actor: string, revisionId: string) {
    await this.permissions.moderator(actor);
    await this.db.transaction(async (tx) => {
      const [revision] = await tx.query("SELECT * FROM revisions WHERE id=$1 FOR UPDATE", [revisionId]);
      invariant(
        revision?.status === "approved",
        400,
        "INVALID_REVISION",
        "Only a previously approved revision can be restored.",
      );
      await this.validateAssets(tx, revision.user_id, parseStoredProfile(revision.config));
      await tx.query(
        "UPDATE users SET published_revision=$1,manual_revision_id=$1,auto_revision_id=NULL,automation_enabled=false,updated_at=now() WHERE id=$2",
        [revisionId, revision.user_id],
      );
      await this.audit(tx, actor, "restore", revisionId);
    });
  }
  async revokeProfile(actor: string, userId: string, reason: string) {
    await this.permissions.moderator(actor);
    await this.db.transaction(async (tx) => {
      const [user] = await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
      invariant(user, 404, "NOT_FOUND", "Profile not found.");
      if (user.published_revision) await this.tombstone("revision", user.published_revision, tx);
      if (user.published_revision)
        await tx.query("UPDATE revisions SET status='revoked',reason=$1 WHERE id=$2", [
          reason,
          user.published_revision,
        ]);
      await tx.query(
        "UPDATE users SET published_revision=null,manual_revision_id=null,auto_revision_id=null,automation_enabled=false,updated_at=now() WHERE id=$1",
        [userId],
      );
      await this.audit(tx, actor, "revoke_profile", userId, { reason });
    });
  }
  async revokeMedia(actor: string, id: string, reason: string) {
    await this.permissions.moderator(actor);
    await this.tombstone("media", id);
    await this.db.transaction(async (tx) => {
      const [asset] = await tx.query("SELECT * FROM media WHERE id=$1 FOR UPDATE", [id]);
      invariant(asset, 404, "NOT_FOUND", "File not found.");
      const affected = await this.mediaDescendants(tx, [id]);
      for (const child of affected) if (child !== id) await this.tombstone("media", child, tx);
      await tx.query("UPDATE media SET status='revoked' WHERE id=ANY($1::uuid[])", [affected]);
      await tx.query(
        "UPDATE studio_shares SET status='revoked' WHERE id IN(SELECT sv.share_id FROM studio_share_variants sv JOIN revision_assets ra ON ra.revision_id=sv.revision_id WHERE ra.asset_id=ANY($1::uuid[]))",
        [affected],
      );
      await tx.query(
        "UPDATE users SET published_revision=null,manual_revision_id=null,auto_revision_id=null,updated_at=now() WHERE published_revision IN (SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[]))",
        [affected],
      );
      await this.audit(tx, actor, "revoke_media", id, { reason });
    });
  }
  async catalog(): Promise<CatalogItem[]> {
    return (await this.db.query("SELECT item FROM catalog WHERE enabled=true ORDER BY id")).map(
      (row) => row.item as CatalogItem,
    );
  }
  async upsertCatalog(actor: string, value: unknown) {
    return this.upsertCatalogBatch(actor, [value]);
  }
  async catalogPage(after = "") {
    const rows = await this.db.query(
      "SELECT id,item FROM catalog WHERE enabled=true AND id>$1 ORDER BY id LIMIT 251",
      [after],
    );
    const page = rows.slice(0, 250);
    return {
      items: page.map((row) => row.item as CatalogItem),
      nextCursor: rows.length > 250 ? String(page[page.length - 1]!.id) : null,
    };
  }
  async mediaDescendants(db: Database, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    return (
      await db.query(
        "WITH RECURSIVE affected(id) AS (SELECT unnest($1::uuid[]) UNION SELECT d.child_id FROM media_derivations d JOIN affected a ON a.id=d.parent_id) SELECT id FROM affected",
        [ids],
      )
    ).map((v) => v.id);
  }
  async upsertCatalogBatch(actor: string, values: unknown[]) {
    await this.permissions.member(actor, true);
    invariant(
      this.permissions.isOwner(actor),
      403,
      "OWNER_REQUIRED",
      "Only the owner can update the catalog.",
    );
    const items = values.map((value) => catalogSchema.parse(value));
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx.query(
          "INSERT INTO catalog(id,kind,item) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET kind=$2,item=$3,enabled=true",
          [item.id, item.kind, JSON.stringify(item)],
        );
        await this.audit(tx, actor, "catalog_upsert", item.id);
      }
    });
  }
}
