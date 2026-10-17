import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProfileService } from "./service.js";
import { FileStore } from "./media.js";
import { assetIds } from "../plugin/model.js";
function withoutAsset(value: any, id: string) {
  const config = structuredClone(value);
  for (const slot of ["avatar", "banner", "audio"]) if (config[slot] === id) config[slot] = null;
  for (const slot of ["decoration", "effect"])
    if (config[slot]?.source === "media" && config[slot].id === id) config[slot] = null;
  for (const scene of [config.studio?.base, config.studio?.small, config.studio?.full])
    if (scene?.layers)
      scene.layers = scene.layers.filter((l: any) => l.source !== "media" || l.assetId !== id);
  return config;
}
/** Invoked every minute by the single API instance; idempotent after interruptions. */
export async function maintain(service: ProfileService, files: FileStore) {
  for (const row of await service.db.query(
    "SELECT id,output_key,preview_key FROM media WHERE status='ready' AND output_bytes=0",
  )) {
    const size = async (key: string | null) =>
      key ? (await stat(files.path(key)).catch(() => ({ size: 0 }))).size : 0;
    await service.db.query("UPDATE media SET output_bytes=$1,preview_bytes=$2,input_bytes=0 WHERE id=$3", [
      await size(row.output_key),
      await size(row.preview_key),
      row.id,
    ]);
  }
  await service.db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(73812026)");
    await tx.query(
      "DELETE FROM studio_shares WHERE owner_id IN(SELECT id FROM users WHERE deleted_at IS NOT NULL) OR(status IN('rejected','withdrawn','revoked') AND created_at<now()-interval '30 days')",
    );
    await tx.query(
      "DELETE FROM studio_presets WHERE owner_id IN(SELECT id FROM users WHERE deleted_at IS NOT NULL)",
    );
    await tx.query(
      "UPDATE studio_presets SET approved_revision_id=NULL WHERE approved_revision_id IN(SELECT id FROM revisions WHERE status='revoked')",
    );
    await tx.query(
      "UPDATE revisions SET status='rejected',reason='Submission expired after 30 days.',decided_at=now() WHERE status='pending' AND created_at<now()-interval '30 days'",
    );
    await tx.query(
      "UPDATE moderation_messages SET erase=true WHERE created_at<now()-interval '30 days' OR revision_id IN(SELECT id FROM revisions WHERE status='rejected' AND decided_at<now()-interval '7 days')",
    );
    const old = await tx.query(
      "SELECT r.id FROM revisions r JOIN users u ON u.id=r.user_id WHERE u.deleted_at IS NOT NULL OR(r.created_at<now()-interval '30 days' AND r.status<>'pending' AND r.id IS DISTINCT FROM u.published_revision AND r.id IS DISTINCT FROM u.manual_revision_id AND NOT EXISTS(SELECT 1 FROM studio_presets p WHERE p.approved_revision_id=r.id) AND NOT EXISTS(SELECT 1 FROM studio_share_variants v WHERE v.revision_id=r.id) AND NOT EXISTS(SELECT 1 FROM revisions pending WHERE pending.baseline_revision_id=r.id AND pending.status='pending'))",
    );
    for (const row of old) {
      await tx.query("DELETE FROM audit WHERE target_id=$1", [row.id]);
      await tx.query("DELETE FROM revision_assets WHERE revision_id=$1", [row.id]);
      await tx.query("DELETE FROM revisions WHERE id=$1", [row.id]);
    }
    const assets = await tx.query(
      `SELECT m.*,u.deleted_at,u.draft FROM media m JOIN users u ON u.id=m.owner_id
       WHERE u.deleted_at IS NOT NULL OR m.erase_after<=now() OR(m.status IN('failed','revoked') AND m.created_at<now()-interval '7 days')
       OR(m.status='ready' AND m.created_at<now()-interval '30 days'
          AND NOT EXISTS(SELECT 1 FROM studio_preset_assets pa WHERE pa.asset_id=m.id)
          AND NOT EXISTS(SELECT 1 FROM revision_assets ra JOIN revisions r ON r.id=ra.revision_id WHERE ra.asset_id=m.id AND
            (r.status='pending' OR r.id=u.published_revision OR r.id=u.manual_revision_id
             OR EXISTS(SELECT 1 FROM studio_presets p WHERE p.approved_revision_id=r.id)
             OR EXISTS(SELECT 1 FROM studio_share_variants v WHERE v.revision_id=r.id)
             OR EXISTS(SELECT 1 FROM revisions pending WHERE pending.baseline_revision_id=r.id AND pending.status='pending'))))
       ORDER BY m.id FOR UPDATE OF m`,
    );
    for (const row of assets) {
      const [current] = await tx.query("SELECT draft FROM users WHERE id=$1 FOR UPDATE", [row.owner_id]);
      if (!row.deleted_at && assetIds(current!.draft).includes(row.id)) {
        const config = withoutAsset(current!.draft, row.id);
        await tx.query("UPDATE users SET draft=$1,draft_version=draft_version+1 WHERE id=$2", [
          JSON.stringify(config),
          row.owner_id,
        ]);
        await tx.query("DELETE FROM admin_confirmations WHERE user_id=$1", [row.owner_id]);
      }
      for (const p of await tx.query(
        "SELECT p.id,p.draft FROM studio_presets p JOIN studio_preset_assets a ON a.preset_id=p.id WHERE a.asset_id=$1 FOR UPDATE OF p",
        [row.id],
      ))
        await tx.query("UPDATE studio_presets SET draft=$1,version=version+1,updated_at=now() WHERE id=$2", [
          JSON.stringify(withoutAsset(p.draft, row.id)),
          p.id,
        ]);
      for (const key of [row.input_key, row.output_key, row.preview_key])
        if (key && /^(quarantine|processed)\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(key))
          await tx.query("INSERT INTO file_deletions(key) VALUES($1) ON CONFLICT DO NOTHING", [key]);
      await tx.query("DELETE FROM worker_results WHERE asset_id=$1", [row.id]);
      await tx.query("DELETE FROM revision_assets WHERE asset_id=$1", [row.id]);
      await tx.query("DELETE FROM audit WHERE target_id=$1", [row.id]);
      await tx.query("DELETE FROM media WHERE id=$1", [row.id]);
    }
    const deleted = await tx.query("SELECT id FROM users WHERE deleted_at IS NOT NULL");
    for (const row of deleted) {
      await tx.query("UPDATE revisions SET decided_by=NULL WHERE decided_by=$1", [row.id]);
      await tx.query("DELETE FROM upload_events WHERE user_id=$1", [row.id]);
      await tx.query("DELETE FROM outbox WHERE payload->>'userId'=$1", [row.id]);
      await tx.query("DELETE FROM audit WHERE actor_id=$1 OR target_id=$1", [row.id]);
      await tx.query("DELETE FROM users WHERE id=$1", [row.id]);
    }
    await tx.query("DELETE FROM audit WHERE created_at<now()-interval '30 days'");
    await tx.query("DELETE FROM outbox WHERE created_at<now()-interval '30 days'");
    await tx.query("DELETE FROM upload_events WHERE created_at<now()-interval '30 days'");
    await tx.query("DELETE FROM pairings WHERE expires_at<now()");
    await tx.query("DELETE FROM sessions WHERE expires_at<now()");
    await tx.query("DELETE FROM admin_confirmations WHERE expires_at<now()");
    await tx.query("DELETE FROM erasures WHERE created_at<now()-interval '31 days'");
    if (service.journal) {
      await tx.query("SELECT pg_advisory_xact_lock(73812027)");
      await service.journal.prune();
    }
  });
  for (const row of await service.db.query("SELECT key FROM file_deletions ORDER BY created_at LIMIT 1000")) {
    await files.remove(row.key);
    await service.db.query("UPDATE media SET input_bytes=0 WHERE input_key=$1", [row.key]);
    await service.db.query("DELETE FROM file_deletions WHERE key=$1", [row.key]);
  }
  // A decoder killed before reporting can leave an orphan. Never remove a live lease.
  const leases = await service.db.query(
    "SELECT lease_token FROM media WHERE status='processing' AND lease_until>now()",
  );
  const live = new Set(leases.map((row) => row.lease_token));
  for (const name of await readdir(join(files.root, "staging"))) {
    if (!/^[0-9a-f-]{36}\.(webp|ogg|png)$/.test(name) || live.has(name.slice(0, 36))) continue;
    const info = await stat(files.path(`staging/${name}`));
    if (info.mtimeMs < Date.now() - 3 * 60_000) await files.remove(`staging/${name}`);
  }
  // Interrupted uploads can leave inputs that were never committed.
  const inputs = new Set(
    (await service.db.query("SELECT input_key FROM media WHERE status='processing'")).map(
      (row) => row.input_key,
    ),
  );
  for (const name of await readdir(join(files.root, "quarantine"))) {
    if (!/^[0-9a-f-]{36}\.bin$/.test(name) || inputs.has(`quarantine/${name}`)) continue;
    if ((await stat(files.path(`quarantine/${name}`))).mtimeMs < Date.now() - 3 * 60_000)
      await files.remove(`quarantine/${name}`);
  }
}
