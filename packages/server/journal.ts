import { mkdir, open, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Database } from "./db.js";
export type TombstoneKind = "user" | "profile" | "media" | "revision" | "share" | "badge";
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
/** Separate durable volume, never overwritten by a database/media restore. No raw Discord IDs. */
export class SecurityJournal {
  constructor(public path: string) {}
  async record(kind: TombstoneKind, id: string) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ kind, hash: digest(id), at: new Date().toISOString() }) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async replay(db: Database) {
    const text = await readFile(this.path, "utf8").catch((e) => {
      if (e.code === "ENOENT") return "";
      throw e;
    });
    for (const line of text.split("\n").filter(Boolean)) {
      const entry = JSON.parse(line) as { kind: TombstoneKind; hash: string; at: string };
      if (
        !/^[a-f0-9]{64}$/.test(entry.hash) ||
        !["user", "media", "profile", "revision", "share", "badge"].includes(entry.kind) ||
        !Number.isFinite(Date.parse(entry.at))
      )
        throw new Error("Invalid security journal; recovery stopped.");
      if (entry.kind === "share") {
        for (const share of await db.query("SELECT id FROM studio_shares"))
          if (digest(share.id) === entry.hash)
            await db.query("UPDATE studio_shares SET status='withdrawn' WHERE id=$1", [share.id]);
        continue;
      }
      if (entry.kind === "badge") {
        for (const badge of await db.query("SELECT badge_id,user_id FROM studio_badge_assignments"))
          if (digest(`${badge.badge_id}:${badge.user_id}`) === entry.hash)
            await db.query("DELETE FROM studio_badge_assignments WHERE badge_id=$1 AND user_id=$2", [
              badge.badge_id,
              badge.user_id,
            ]);
        continue;
      }
      if (entry.kind === "user") {
        await db.query("INSERT INTO erasures(user_hash,created_at) VALUES($1,$2) ON CONFLICT DO NOTHING", [
          entry.hash,
          entry.at,
        ]);
        await db.query("UPDATE moderation_messages SET erase=true WHERE owner_hash=$1", [entry.hash]);
      }
      const rows = await db.query(
        entry.kind === "media"
          ? "SELECT id FROM media"
          : entry.kind === "revision"
            ? "SELECT id FROM revisions"
            : "SELECT id FROM users",
      );
      for (const row of rows.filter((v) => digest(v.id) === entry.hash)) {
        if (entry.kind === "user") {
          await db.query(
            "UPDATE users SET deleted_at=COALESCE(deleted_at,now()),published_revision=NULL WHERE id=$1",
            [row.id],
          );
          await db.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
          const roots = await db.query("SELECT id FROM media WHERE owner_id=$1", [row.id]);
          await this.revokeMedia(
            db,
            roots.map((m) => m.id),
            true,
          );
          await db.query("UPDATE studio_shares SET status='revoked' WHERE owner_id=$1", [row.id]);
        } else if (entry.kind === "revision") {
          await db.query("UPDATE revisions SET status='revoked' WHERE id=$1", [row.id]);
          await db.query("UPDATE users SET published_revision=NULL WHERE published_revision=$1", [row.id]);
        } else if (entry.kind === "profile") {
          await db.query("UPDATE users SET published_revision=NULL WHERE id=$1", [row.id]);
          await db.query("UPDATE revisions SET status='revoked' WHERE user_id=$1", [row.id]);
        } else {
          await this.revokeMedia(db, [row.id]);
        }
      }
    }
    await db.query("DELETE FROM sessions");
    await db.query("DELETE FROM pairings");
    await db.query("DELETE FROM admin_confirmations");
    await db.query(
      "UPDATE users SET manual_revision_id=NULL WHERE manual_revision_id IN(SELECT id FROM revisions WHERE status<>'approved')",
    );
    await db.query(
      "UPDATE users SET published_revision=manual_revision_id,auto_revision_id=NULL,auto_session_hash=NULL,auto_lease_until=NULL,automation_enabled=false",
    );
  }
  async revokeMedia(db: Database, roots: string[], erase = false) {
    if (!roots.length) return;
    const ids = (
      await db.query(
        "WITH RECURSIVE affected(id) AS(SELECT unnest($1::uuid[]) UNION SELECT d.child_id FROM media_derivations d JOIN affected a ON d.parent_id=a.id) SELECT id FROM affected",
        [roots],
      )
    ).map((v) => v.id);
    await db.query(
      "UPDATE media SET status='revoked',erase_after=CASE WHEN $2 THEN now() ELSE erase_after END WHERE id=ANY($1::uuid[])",
      [ids, erase],
    );
    await db.query(
      "UPDATE revisions SET status='revoked' WHERE id IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[]))",
      [ids],
    );
    await db.query(
      "UPDATE users SET published_revision=NULL,manual_revision_id=NULL,auto_revision_id=NULL WHERE published_revision IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[])) OR manual_revision_id IN(SELECT revision_id FROM revision_assets WHERE asset_id=ANY($1::uuid[]))",
      [ids],
    );
    await db.query(
      "UPDATE studio_shares SET status='revoked' WHERE id IN(SELECT sv.share_id FROM studio_share_variants sv JOIN revision_assets ra ON ra.revision_id=sv.revision_id WHERE ra.asset_id=ANY($1::uuid[]))",
      [ids],
    );
  }
  /** Caller holds the shared database journal lock, including all bot writers. */
  async prune() {
    const text = await readFile(this.path, "utf8");
    const lines = text
      .split("\n")
      .filter(Boolean)
      .filter((line) => Date.parse(JSON.parse(line).at) >= Date.now() - 31 * 86400000);
    await writeFile(this.path + ".next", lines.length ? lines.join("\n") + "\n" : "", { mode: 0o600 });
    await rename(this.path + ".next", this.path);
  }
}
