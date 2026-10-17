import {
  DEFAULT_CONFIG,
  type ProfileConfig,
  type ProfileRevision,
  type PublicProfile,
  type MediaAsset,
  type CatalogItem,
} from "./model.js";
import type { TintStyle } from "./tint.js";
import type { FavoriteSong } from "./music-links.js";

export const TEXTURES = ["grain", "vhs", "rain", "snow", "stars", "paper"] as const;
export type Texture = (typeof TEXTURES)[number];
export type Surface = "small" | "full";
export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}
export interface SceneLayer {
  id: string;
  source: "media" | "discord" | "texture" | "preset";
  assetId: string | null;
  texture: Texture;
  preset: "glow" | "gradient" | "particles";
  color: string;
  phase: "intro" | "idle" | "hover";
  delayMs: number;
  durationMs: number;
  plane: "behind" | "front";
  transform: LayerTransform;
  tint: TintStyle | null;
  blend: "normal" | "screen";
}
export interface StudioBlock {
  id: string;
  kind: "text" | "interests" | "games" | "setup" | "quote" | "links" | "music";
  title: string;
  text: string;
  links: { label: string; url: string }[];
  visible: boolean;
}
export interface SceneConfig {
  layers: SceneLayer[];
  blocks: StudioBlock[];
  colors: [string, string] | null;
  albumBackground: { enabled: boolean; opacity: number; blur: number };
  parallax: { enabled: boolean; amount: number };
}
export interface StudioDocument {
  base: SceneConfig;
  small: Partial<SceneConfig>;
  full: Partial<SceneConfig>;
  songs: FavoriteSong[];
  hiddenBadges: string[];
}
export interface ProfileConfigV2 extends ProfileConfig {
  configVersion: 2;
  studio: StudioDocument;
}
export interface Preset {
  id: string;
  name: string;
  version: number;
  draft: ProfileConfig;
  approvedRevisionId: string | null;
  approved: ProfileRevision | null;
  updatedAt: string;
}
export interface PersonalLibrary {
  favorites: string[];
  recent: string[];
  collections: { id: string; name: string; items: string[] }[];
}
export interface AutomationRule {
  id: string;
  kind: "game" | "music" | "online" | "idle" | "dnd";
  applicationId: string;
  presetId: string;
  enabled: boolean;
}
export interface AutomationState {
  enabled: boolean;
  rules: AutomationRule[];
  version: number;
}
export interface StudioBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
}
export interface StyleShare {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  copyUploads: boolean;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "revoked";
  variants: { name: string; revisionId: string; config: ProfileConfig }[];
  createdAt: string;
  reason: string | null;
}
export interface MediaMetadata {
  label: string;
  folder: string;
  tags: string[];
}
export interface CatalogMetadata {
  colors: string[];
  tags: string[];
  moods: string[];
}
export interface WorkspaceState {
  presets: Preset[];
  library: PersonalLibrary;
  libraryVersion: number;
  automation: AutomationState;
  manualRevisionId: string | null;
  activeRevisionId: string | null;
  capacity: number;
  canUseCustomTint: boolean;
  shares: StyleShare[];
  badges: StudioBadge[];
  mediaMetadata: Record<string, MediaMetadata>;
  usage: Record<string, string[]>;
}
export interface Capabilities {
  version: 2;
  enabled: boolean;
  features: Record<string, boolean>;
}
export const FEATURE_GROUPS = [
  "presets",
  "library",
  "scenes",
  "blocks",
  "music",
  "sharing",
  "badges",
  "automation",
  "export",
] as const;
export const EMPTY_LIBRARY: PersonalLibrary = { favorites: [], recent: [], collections: [] };
export const DEFAULT_TRANSFORM: LayerTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export function newLayer(source: SceneLayer["source"] = "texture"): SceneLayer {
  return {
    id: crypto.randomUUID(),
    source,
    assetId: null,
    texture: "stars",
    preset: "glow",
    color: "#5865f2",
    phase: "idle",
    delayMs: 0,
    durationMs: 3000,
    plane: "front",
    transform: { ...DEFAULT_TRANSFORM },
    tint: null,
    blend: "normal",
  };
}
export function normalizeStudio(config: ProfileConfig): ProfileConfigV2 {
  if (config.configVersion === 2 && config.studio) return structuredClone(config) as ProfileConfigV2;
  const layers: SceneLayer[] = [];
  if (config.effect)
    layers.push({
      ...newLayer(config.effect.source),
      id: "legacy-effect",
      assetId: config.effect.id,
      tint: config.effectTint ?? null,
      blend: config.effectBlend ?? "normal",
    });
  if (config.profileEffect.preset !== "none")
    layers.push({
      ...newLayer("preset"),
      id: "legacy-preset",
      preset: config.profileEffect.preset,
      color: config.profileEffect.color,
      transform: { ...DEFAULT_TRANSFORM, opacity: config.profileEffect.intensity },
    });
  return {
    ...structuredClone(config),
    configVersion: 2,
    studio: {
      base: {
        layers,
        blocks: [
          {
            id: "favorite-music",
            kind: "music",
            title: "Favorite songs",
            text: "",
            links: [],
            visible: true,
          },
        ],
        colors: config.colors,
        albumBackground: config.albumBackground ?? { enabled: false, opacity: 0.25, blur: 12 },
        parallax: { enabled: false, amount: 1 },
      },
      small: {},
      full: {},
      songs: config.favoriteSong ? [config.favoriteSong] : [],
      hiddenBadges: [],
    },
  };
}
export function resolveScene(config: ProfileConfig, surface: Surface): SceneConfig {
  const doc = normalizeStudio(config).studio;
  const scene = { ...doc.base, ...doc[surface] };
  return { ...scene, blocks: scene.blocks.filter((b) => b.visible).slice(0, surface === "small" ? 3 : 8) };
}
export function legacyConfig(config: ProfileConfig): ProfileConfig {
  const { configVersion: _version, studio: _studio, ...base } = config;
  if (!_studio) return base;
  const scene = resolveScene(config, "small");
  const image = scene.layers.find((l) => l.source === "media" || l.source === "discord");
  const preset = scene.layers.find((l) => l.source === "preset");
  return {
    ...base,
    colors: scene.colors,
    albumBackground: scene.albumBackground,
    favoriteSong: _studio.songs[0] ?? null,
    effect: image?.assetId ? { source: image.source as "media" | "discord", id: image.assetId } : null,
    effectTint: image?.tint ?? null,
    effectBlend: image?.blend ?? "normal",
    profileEffect: preset
      ? { preset: preset.preset, color: preset.color, intensity: preset.transform.opacity, speed: 1 }
      : { ...DEFAULT_CONFIG.profileEffect, preset: "none" },
  };
}
export function tintEntries(config: ProfileConfig): [string, TintStyle][] {
  const entries: [string, TintStyle][] = config.decorationTint ? [["decoration", config.decorationTint]] : [];
  if (config.effectTint) entries.push(["legacyEffect", config.effectTint]);
  const doc = normalizeStudio(config).studio;
  for (const [surface, scene] of [
    ["base", doc.base],
    ["small", doc.small],
    ["full", doc.full],
  ] as const)
    for (const layer of scene.layers ?? [])
      if (layer.tint) entries.push([`${surface}:${layer.id}`, layer.tint]);
  return entries;
}
export function configDiff(before: ProfileConfig | null, after: ProfileConfig): string[] {
  const left = before ? normalizeStudio(before) : null,
    right = normalizeStudio(after);
  const changes: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b))
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk((a as any)[key], (b as any)[key], path ? `${path}.${key}` : key);
    else changes.push(path);
  };
  walk(left, right, "");
  return changes;
}
export type ViewerOverride = Partial<
  Record<"background" | "effects" | "decoration" | "tint" | "parallax", boolean>
>;
export function applyViewerOverride(config: ProfileConfig, override: ViewerOverride): ProfileConfig {
  const next = normalizeStudio(config);
  if (override.background === false) {
    next.banner = null;
    next.colors = null;
  }
  if (override.tint === false) next.effectTint = null;
  for (const scene of [next.studio.base, next.studio.small, next.studio.full]) {
    if (override.background === false) {
      scene.albumBackground = { enabled: false, opacity: 0.25, blur: 12 };
      scene.colors = null;
    }
    if (override.effects === false) scene.layers = [];
    if (override.parallax === false) scene.parallax = { enabled: false, amount: 1 };
    if (override.tint === false && scene.layers)
      scene.layers = scene.layers.map((l) => ({ ...l, tint: null }));
  }
  if (override.decoration === false) next.decoration = null;
  if (override.tint === false) next.decorationTint = null;
  return next;
}
