import { z } from "zod";
import { legacyProfileObject, uuid } from "./schema.js";
import {
  TEXTURES,
  type ProfileConfigV2,
  type SceneConfig,
  type PersonalLibrary,
  type AutomationRule,
} from "../plugin/studio-model.js";
import type { ProfileConfig } from "../plugin/model.js";
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const labelSchema = z.string().trim().min(1).max(64);
export const httpsLink = z
  .string()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.port;
    } catch {
      return false;
    }
  }, "Enter an HTTPS link without credentials or a custom port.");
const tint = z
  .object({ color, intensity: z.number().min(0).max(1) })
  .strict()
  .nullable();
const layer = z
  .object({
    id,
    source: z.enum(["media", "discord", "texture", "preset"]),
    assetId: id.nullable(),
    texture: z.enum(TEXTURES),
    preset: z.enum(["glow", "gradient", "particles"]),
    color,
    phase: z.enum(["intro", "idle", "hover"]),
    delayMs: z.number().int().min(0).max(10000),
    durationMs: z.number().int().min(100).max(10000),
    plane: z.enum(["behind", "front"]),
    transform: z
      .object({
        x: z.number().min(-1).max(1),
        y: z.number().min(-1).max(1),
        scale: z.number().min(0.1).max(3),
        rotation: z.number().min(-180).max(180),
        opacity: z.number().min(0).max(1),
      })
      .strict(),
    tint,
    blend: z.enum(["normal", "screen"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === "media" && value.assetId && !uuid.safeParse(value.assetId).success)
      context.addIssue({ code: "custom", message: "Invalid uploaded layer reference." });
  });
const block = z
  .object({
    id,
    kind: z.enum(["text", "interests", "games", "setup", "quote", "links", "music"]),
    title: z.string().max(64),
    text: z.string().max(1000),
    links: z.array(z.object({ label: z.string().min(1).max(80), url: httpsLink }).strict()).max(8),
    visible: z.boolean(),
  })
  .strict();
const uniqueIds = (values: { id: string }[]) =>
  new Set(values.map((value) => value.id)).size === values.length;
export const sceneSchema = z
  .object({
    layers: z.array(layer).max(3).refine(uniqueIds, "Layer IDs must be unique."),
    blocks: z.array(block).max(8).refine(uniqueIds, "Block IDs must be unique."),
    colors: z.tuple([color, color]).nullable(),
    albumBackground: z
      .object({ enabled: z.boolean(), opacity: z.number().min(0).max(1), blur: z.number().min(0).max(32) })
      .strict(),
    parallax: z.object({ enabled: z.boolean(), amount: z.number().min(0).max(1) }).strict(),
  })
  .strict();
export const profileV2Schema: z.ZodType<ProfileConfigV2> = legacyProfileObject
  .extend({
    configVersion: z.literal(2),
    studio: z
      .object({
        base: sceneSchema,
        small: sceneSchema.partial(),
        full: sceneSchema.partial(),
        songs: z
          .array(legacyProfileObject.shape.favoriteSong.unwrap().unwrap())
          .max(3)
          .refine(
            (values) => new Set(values.map((v) => v.url)).size === values.length,
            "Choose different songs.",
          ),
        hiddenBadges: z.array(uuid).max(100),
      })
      .strict(),
  })
  .strict();
export function parseStoredProfile(value: unknown): ProfileConfig {
  return (value as { configVersion?: number })?.configVersion === 2
    ? profileV2Schema.parse(value)
    : legacyProfileObject.parse(value);
}
export const librarySchema: z.ZodType<PersonalLibrary> = z
  .object({
    favorites: z.array(id).max(1000),
    recent: z.array(id).max(20),
    collections: z
      .array(z.object({ id: uuid, name: labelSchema, items: z.array(id).max(1000) }).strict())
      .max(20)
      .refine(uniqueIds, "Collection IDs must be unique."),
  })
  .strict();
export const automationRulesSchema: z.ZodType<AutomationRule[]> = z
  .array(
    z
      .object({
        id: uuid,
        kind: z.enum(["game", "music", "online", "idle", "dnd"]),
        applicationId: z.string().regex(/^(?:[0-9]{17,20})?$/),
        presetId: uuid,
        enabled: z.boolean(),
      })
      .strict()
      .refine((v) => v.kind !== "game" || !!v.applicationId, "Select a game application ID."),
  )
  .max(20)
  .refine(uniqueIds, "Rule IDs must be unique.");
export const metadataSchema = z
  .object({
    label: z.string().trim().max(64),
    folder: z.string().trim().max(64),
    tags: z.array(z.string().trim().min(1).max(24)).max(10),
  })
  .strict();
export const catalogMetadataSchema = z
  .object({
    colors: z.array(color).max(12),
    tags: z.array(z.string().trim().min(1).max(24)).max(10),
    moods: z.array(z.string().trim().min(1).max(24)).max(10),
  })
  .strict();
