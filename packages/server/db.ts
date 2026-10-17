import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
export interface Database {
  query<T extends Record<string, any> = Record<string, any>>(sql: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(run: (db: Database) => Promise<T>): Promise<T>;
}
export function postgres(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 20000,
  });
  function wrap(client: Pick<pg.PoolClient, "query">): Database {
    return {
      async query<T extends Record<string, any>>(sql: string, values: unknown[] = []) {
        return (await client.query(sql, values)).rows as T[];
      },
      async transaction<T>(run: (db: Database) => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
          const connection = await pool.connect();
          try {
            await connection.query("BEGIN");
            const result = await run(wrap(connection));
            await connection.query("COMMIT");
            return result;
          } catch (error) {
            await connection.query("ROLLBACK");
            if (attempt >= 2 || !["40P01", "40001"].includes((error as { code: string }).code)) throw error;
          } finally {
            connection.release();
          }
          await setTimeout(20 + Math.random() * 50);
        }
      },
    };
  }
  return { db: wrap(pool), close: () => pool.end() };
}
export async function migrate(db: Database) {
  const directory = new URL("../../migrations/", import.meta.url);
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(73812021)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of (await readdir(directory))
      .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
      .sort()) {
      const id = file.slice(0, -4);
      if ((await tx.query("SELECT id FROM migrations WHERE id=$1", [id])).length) continue;
      await tx.query(await readFile(new URL(file, directory), "utf8"));
      await tx.query("INSERT INTO migrations(id) VALUES ($1)", [id]);
    }
  });
}
