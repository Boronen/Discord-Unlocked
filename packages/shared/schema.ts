import { z } from "zod";
import type { ProfileConfig, CatalogItem } from "./domain/model.js";
import { songLink, providerArtwork } from "./domain/music-links.js";
const songUrl = z
  .string()
  .max(1000)
  .refine((value) => {
    try {
      songLink(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid song link.");
export const snowflake = z.string().regex(/^[0-9]{17,20}$/, "Invalid Discord user ID.");
export const uuid = z.string().uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a six-digit hexadecimal color.");
const effect = {
  preset: z.enum(["none", "glow", "gradient", "particles"]),
  color,
  intensity: z.number().min(0).max(1),
  speed: z.number().min(0.25).max(3),
};
const tint = z
  .object({ color, intensity: z.number().min(0).max(1) })
  .strict()
  .nullable()
  .optional();
const layer = z
  .object({
    source: z.enum(["media", "discord"]),
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
  })
  .strict()
  .refine((value) => value.source !== "media" || uuid.safeParse(value.id).success, "Invalid media asset ID.");
export const legacyProfileObject = z
  .object({
    albumBackground: z
      .object({ enabled: z.boolean(), opacity: z.number().min(0).max(1), blur: z.number().min(0).max(32) })
      .strict()
      .optional(),
    effectTint: tint,
    decorationTint: tint,
    avatar: uuid.nullable(),
    decoration: layer.nullable(),
    banner: uuid.nullable(),
    nameplate: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .nullable()
      .optional(),
    effect: layer.nullable(),
    effectBlend: z.enum(["normal", "screen"]).default("normal"),
    colors: z.tuple([color, color]).nullable(),
    audio: uuid.nullable(),
    favoriteSong: z
      .object({
        url: songUrl,
        title: z.string().min(1).max(200),
        artist: z.string().max(200),
        artwork: z
          .string()
          .max(1000)
          .nullable()
          .refine((value) => value === null || providerArtwork(value), "Invalid artwork URL."),
      })
      .strict()
      .nullable()
      .optional(),
    profileEffect: z.object(effect).strict(),
    musicPriority: z.boolean().optional(),
    music: z.object({ ...effect, mode: z.enum(["manual", "artwork"]), background: color }).strict(),
  })
  .strict();
export const profileConfigSchema: z.ZodType<ProfileConfig> = legacyProfileObject;
const cdnUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  }, "Only Discord CDN media is allowed.");
export const catalogSchema: z.ZodType<CatalogItem> = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    kind: z.enum(["decoration", "effect", "nameplate"]),
    name: z.string().min(1).max(150),
    imageUrl: cdnUrl,
    staticUrl: cdnUrl,
    discordAsset: z
      .string()
      .regex(/^(?:[a-zA-Z0-9_]+|nameplates\/(?:[a-zA-Z0-9_-]+\/){1,6})$/)
      .nullable(),
    layers: z
      .array(
        z
          .object({
            src: cdnUrl,
            width: z.number().int().min(1).max(4096),
            height: z.number().int().min(1).max(4096),
            start: z.number().min(0).max(60000),
            duration: z.number().min(1).max(60000),
            loop: z.boolean(),
            loopDelay: z.number().min(0).max(60000),
            x: z.number().min(-4096).max(4096),
            y: z.number().min(-4096).max(4096),
            zIndex: z.number().int().min(0).max(10),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const mediaSlotSchema = z.enum(["avatar", "decoration", "banner", "effect", "audio"]);
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
