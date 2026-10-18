import { config as dotenv } from "dotenv";
import { z } from "zod";
import { resolve } from "node:path";
import { isIP } from "node:net";
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.string().url().default("http://localhost:3100"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  HOST: z.string().default("127.0.0.1"),
  MEDIA_ROOT: z.string().default("data/media"),
  PRIVACY_NOTICE_FILE: z.string().min(1).optional(),
  STUDIO_V2_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  TRUST_PROXY: z
    .string()
    .default("")
    .refine((v) => v === "" || isIP(v) !== 0, "Trust only an exact proxy IP address.")
    .transform((value) => value || (false as const)),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().regex(/^\d{17,20}$/),
  GUILD_ID: z.string().regex(/^\d{17,20}$/),
  MODERATOR_ROLE_ID: z.string().regex(/^\d{17,20}$/),
  MODERATION_CHANNEL_ID: z.string().regex(/^\d{17,20}$/),
  OWNER_ID: z.string().regex(/^\d{17,20}$/),
  BETA_ROLE_ID: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
  ),
  SUPPORTER_ROLE_ID: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
  ),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
});
export type Config = z.infer<typeof envSchema>;
export function loadConfig(role = "api"): Config {
  dotenv({ path: `secrets/${role}.env`, quiet: true });
  const config = envSchema.parse(process.env);
  config.MEDIA_ROOT = resolve(config.MEDIA_ROOT);
  const url = new URL(config.PUBLIC_URL);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("PUBLIC_URL must be a clean API origin.");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("PUBLIC_URL must use HTTPS in production.");
  return config;
}
export function loadWorkerConfig() {
  dotenv({ path: "secrets/worker.env", quiet: true });
  return z
    .object({
      DATABASE_URL: z.string().min(1),
      MEDIA_ROOT: z.string().default("data/media"),
      FFMPEG_PATH: z.string().default("ffmpeg"),
      FFPROBE_PATH: z.string().default("ffprobe"),
    })
    .parse(process.env);
}
export function loadMigrationConfig() {
  dotenv({ path: "secrets/migrate.env", quiet: true });
  return z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
}
