import { parse } from "dotenv";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
await mkdir("secrets", { recursive: true, mode: 0o700 });
const read = async (path) =>
  readFile(path, "utf8").catch((e) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
const old = parse((await read("secrets/legacy.env")) || (await read(".env")));
if (!(await read("secrets/backup.key")))
  await writeFile("secrets/backup.key", randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 });
await writeFile(
  "secrets/readiness.json",
  JSON.stringify(
    {
      ...JSON.parse(await readFile("deploy/readiness.example.json", "utf8")),
      ...JSON.parse((await read("secrets/readiness.json")) || "{}"),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
if (!(await read("secrets/legacy.env")) && (await read(".env"))) await copyFile(".env", "secrets/legacy.env");
let passwords = JSON.parse((await read("secrets/database-passwords.json")) || "null");
if (!passwords) {
  passwords = Object.fromEntries(
    ["postgres", "profile_migrator", "profile_api", "profile_bot", "profile_worker"].map((role) => [
      role,
      randomBytes(32).toString("hex"),
    ]),
  );
  await writeFile("secrets/database-passwords.json", JSON.stringify(passwords), { mode: 0o600, flag: "wx" });
}
const save = async (name, values) => {
  if (!(await read(`secrets/${name}.env`)))
    await writeFile(
      `secrets/${name}.env`,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
};
const connection = (role) => `postgresql://${role}:${passwords[role]}@172.30.0.2:5432/profile`;
const common = Object.fromEntries(
  [
    "DISCORD_BOT_TOKEN",
    "DISCORD_APPLICATION_ID",
    "GUILD_ID",
    "MODERATOR_ROLE_ID",
    "MODERATION_CHANNEL_ID",
    "OWNER_ID",
  ].map((key) => [key, old[key] ?? "REPLACE_LOCALLY"]),
);
const access = {
  ...common,
  PUBLIC_URL: old.PUBLIC_URL ?? "http://localhost:3100",
  BETA_ROLE_ID: old.BETA_ROLE_ID ?? "",
  SUPPORTER_ROLE_ID: old.SUPPORTER_ROLE_ID ?? "",
  TOKEN_ROTATED: "false",
};
// Empty beta role deliberately keeps every shared read/write closed until configured.
delete access.BETA_ROLE_ID;
if (old.BETA_ROLE_ID) access.BETA_ROLE_ID = old.BETA_ROLE_ID;
await save("api", { ...access, DATABASE_URL: connection("profile_api") });
await save("bot", { ...access, DATABASE_URL: connection("profile_bot") });
await save("worker", { DATABASE_URL: connection("profile_worker") });
await save("migrate", { DATABASE_URL: connection("profile_migrator") });
await save("db", {
  POSTGRES_DB: "profile",
  POSTGRES_USER: "postgres",
  POSTGRES_PASSWORD: passwords.postgres,
});
let sql = "";
for (const [role, password] of Object.entries(passwords)) {
  sql += `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN; END IF; END $$;\n`;
  sql += `ALTER ROLE ${role} PASSWORD '${password}' ${role === "postgres" ? "SUPERUSER" : "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"};\n`;
}
sql += `ALTER DATABASE profile OWNER TO profile_migrator;
ALTER SCHEMA public OWNER TO profile_migrator;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','S','v','m') LOOP
    EXECUTE format('ALTER %s public.%I OWNER TO profile_migrator',CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,item.relname);
  END LOOP;
  FOR item IN SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) OWNER TO profile_migrator',item.proname,item.args);
  END LOOP;
  -- PostgreSQL 17 requires the original bootstrap role to retain SUPERUSER.
  -- Disable login instead; no application receives this role or its password.
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='profile') THEN ALTER ROLE profile NOLOGIN NOCREATEDB NOCREATEROLE; END IF;
END $$;
`;
await writeFile("secrets/bootstrap.sql", sql, { mode: 0o600 });
if (!(await read(".env")) || /POSTGRES_PASSWORD=/.test(await read(".env")))
  await writeFile(
    ".env",
    `# Public Compose settings only. Secrets belong in secrets/*.env.\nCADDY_DOMAIN=${old.CADDY_DOMAIN ?? "localhost"}\n`,
    { mode: 0o600 },
  );
console.log(
  "Service configurations prepared. The beta stays closed until its role and launch gates are configured. Never commit secrets/.",
);
