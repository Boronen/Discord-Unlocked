import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import type { Database } from "../packages/server/db.js";
import { ProfileService } from "../packages/server/service.js";
export const OWNER = "100000000000000001",
  ALICE = "100000000000000002",
  BOB = "100000000000000003",
  MOD = "100000000000000004";
export async function setup() {
  const raw = new PGlite();
  for (const file of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((v) => /^\d{3}_.*\.sql$/.test(v))
    .sort())
    await raw.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  function wrap(connection: Pick<PGlite, "query">): Database {
    return {
      async query<T extends Record<string, any>>(sql: string, values: unknown[] = []) {
        return (await connection.query<T>(sql, values)).rows;
      },
      async transaction<T>(run: (db: Database) => Promise<T>): Promise<T> {
        return raw.transaction((tx) => run(wrap(tx)));
      },
    };
  }
  const permissions = {
    async member(id: string) {
      if (![OWNER, ALICE, BOB, MOD].includes(id)) throw new Error("not a member");
    },
    async moderator(id: string) {
      if (id !== OWNER && id !== MOD) {
        const { AppError } = await import("../packages/server/errors.js");
        throw new AppError(403, "FORBIDDEN", "Moderátor szükséges.");
      }
    },
    isOwner: (id: string) => id === OWNER,
    async canUseCustomTint(id: string) {
      return id === OWNER;
    },
  };
  const db = wrap(raw);
  const service = new ProfileService(db, permissions, "http://localhost:3100");
  for (const id of [OWNER, ALICE, BOB, MOD]) await service.ensureUser(id);
  return { raw, db, service, permissions };
}
export async function token(service: ProfileService, id = ALICE) {
  const pair = await service.createPairing(id);
  await service.connect(pair.code, id);
  const result = await service.pollPairing(pair.id, pair.pollSecret);
  if (!result.ready) throw new Error("not paired");
  return result.token;
}
export async function ownerPublish(service: ProfileService, version: number) {
  const confirmation = await service.beginPublishConfirmation(OWNER, version);
  await service.confirmPublish(OWNER, confirmation.code);
  return service.submit(OWNER, version, true, confirmation.id);
}
