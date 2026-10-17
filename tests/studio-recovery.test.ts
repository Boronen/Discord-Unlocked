import { expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { setup, ALICE, BOB, MOD, token } from "./helpers.js";
import { StudioService } from "../packages/server/studio.js";
import { SecurityJournal } from "../packages/server/journal.js";
import { FileStore } from "../packages/server/media.js";
import type { Database } from "../packages/server/db.js";
import { normalizeStudio } from "../packages/plugin/studio-model.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
// @ts-expect-error Backup scripts are intentionally plain Node modules.
import { encrypt, decrypt } from "../scripts/backup-crypto.mjs";
test("workspace migration preserves an existing approved legacy profile and seeds its preset", async () => {
  const raw = new PGlite();
  try {
    const directory = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter((v) => /^00[1-5]_/.test(v)).sort())
      await raw.exec(await readFile(new URL(file, directory), "utf8"));
    const revision = randomUUID();
    await raw.query("INSERT INTO users(id,draft) VALUES($1,$2)", [ALICE, JSON.stringify(DEFAULT_CONFIG)]);
    await raw.query("INSERT INTO revisions(id,user_id,config,status) VALUES($1,$2,$3,'approved')", [
      revision,
      ALICE,
      JSON.stringify(DEFAULT_CONFIG),
    ]);
    await raw.query("UPDATE users SET published_revision=$1 WHERE id=$2", [revision, ALICE]);
    await raw.exec(await readFile(new URL("006_studio_workspace.sql", directory), "utf8"));
    const { rows } = await raw.query<any>(
      "SELECT u.published_revision,u.manual_revision_id,u.default_preset_id,p.id,p.draft,p.approved_revision_id FROM users u JOIN studio_presets p ON p.id=u.default_preset_id WHERE u.id=$1",
      [ALICE],
    );
    expect(rows[0].published_revision).toBe(revision);
    expect(rows[0].manual_revision_id).toBe(revision);
    expect(rows[0].approved_revision_id).toBe(revision);
    expect(rows[0].draft).toEqual(DEFAULT_CONFIG);
    expect(
      (await raw.query<any>("SELECT preset_id FROM revisions WHERE id=$1", [revision])).rows[0].preset_id,
    ).toBe(rows[0].id);
  } finally {
    await raw.close();
  }
});
test("encrypted v2 database snapshot restores all new tables and applies current descendant-erasure fences", async () => {
  const c = await setup(),
    directory = await mkdtemp(join(tmpdir(), "ps-v2-recovery-"));
  let recovered: PGlite | undefined;
  try {
    const files = new FileStore(directory);
    await files.init();
    const studio = new StudioService(c.service, files),
      p = await studio.createPreset(ALICE, "Shared design"),
      asset = randomUUID();
    await files.write(`processed/${asset}.webp`, Buffer.from("normalized fixture"));
    await c.db.query(
      "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,output_key,mime,output_bytes) VALUES($1,$2,'banner','ready','fixture',$3,$4,'image/webp',18)",
      [asset, ALICE, `quarantine/${asset}.bin`, `processed/${asset}.webp`],
    );
    await studio.savePreset(ALICE, p.id, 0, normalizeStudio({ ...DEFAULT_CONFIG, banner: asset }));
    const r = await studio.submitPreset(ALICE, p.id, 1, false);
    await c.service.decide(MOD, r.id, "approve");
    const share = await studio.submitShare(ALICE, "Matching design", "Recovery fixture", [p.id], true);
    await studio.decideShare(MOD, share.id, "approve");
    const imported = await studio.importStyle(BOB, share.id, r.id, randomUUID(), {
      avatar: false,
      panels: false,
      songs: false,
    });
    await token(c.service, BOB);
    await studio.saveLibrary(BOB, 0, {
      favorites: ["example"],
      recent: ["example"],
      collections: [{ id: randomUUID(), name: "Private", items: ["example"] }],
    });
    const snapshot = await c.raw.dumpDataDir(),
      key = randomBytes(32),
      archive = join(directory, "database.psb");
    await encrypt(Readable.from([Buffer.from(await snapshot.arrayBuffer())]), archive, key);
    const parts: Buffer[] = [];
    await decrypt(
      archive,
      new Writable({
        write(chunk, _encoding, done) {
          parts.push(chunk);
          done();
        },
      }),
      key,
    );
    recovered = new PGlite({ loadDataDir: new Blob([Uint8Array.from(Buffer.concat(parts))]) });
    const raw = recovered;
    function wrap(connection: Pick<PGlite, "query">): Database {
      return {
        async query<T extends Record<string, any>>(sql: string, values: unknown[] = []) {
          return (await connection.query<T>(sql, values)).rows;
        },
        async transaction<T>(run: (db: Database) => Promise<T>) {
          return raw.transaction((tx) => run(wrap(tx)));
        },
      };
    }
    const db = wrap(raw);
    expect((await db.query("SELECT count(*)::int AS n FROM studio_presets"))[0]!.n).toBeGreaterThan(2);
    expect(
      (await db.query("SELECT document FROM studio_library WHERE owner_id=$1", [BOB]))[0]!.document
        .collections[0].name,
    ).toBe("Private");
    const journal = new SecurityJournal(join(directory, "latest.jsonl"));
    await journal.record("user", ALICE);
    await journal.replay(db);
    expect((await db.query("SELECT status FROM media WHERE id=$1", [imported.draft.banner]))[0]!.status).toBe(
      "revoked",
    );
    expect((await db.query("SELECT status FROM studio_shares WHERE id=$1", [share.id]))[0]!.status).toBe(
      "revoked",
    );
    expect(await db.query("SELECT * FROM sessions")).toHaveLength(0);
    expect(
      (await db.query("SELECT deleted_at FROM users WHERE id=$1", [ALICE]))[0]!.deleted_at,
    ).not.toBeNull();
  } finally {
    await recovered?.close();
    await c.raw.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
