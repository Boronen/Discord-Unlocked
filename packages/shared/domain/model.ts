/** Public v1 contract. Browser-safe; no Discord or Node dependencies. */
export interface ProfileAccount {
  name: string;
  avatar?: string;
  original?: {
    bannerUrl?: string;
    decorationUrl?: string;
    colors?: [string, string];
    bio?: string;
    effectId?: string;
  };
}
export type MediaSlot = "avatar" | "decoration" | "banner" | "effect" | "audio";
export type EffectPreset = "none" | "glow" | "gradient" | "particles";
export interface EffectStyle {
  preset: EffectPreset;
  color: string;
  intensity: number;
  speed: number;
}
export interface MusicStyle extends EffectStyle {
  mode: "manual" | "artwork";
  background: string;
}
export interface LayerSelection {
  source: "media" | "discord";
  id: string;
}
export interface ProfileConfig {
  configVersion?: 2;
  studio?: import("./studio-model.js").StudioDocument;
  albumBackground?: { enabled: boolean; opacity: number; blur: number };
  effectTint?: import("./tint.js").TintStyle | null;
  decorationTint?: import("./tint.js").TintStyle | null;
  avatar: string | null;
  decoration: LayerSelection | null;
  banner: string | null;
  nameplate?: string | null;
  effect: LayerSelection | null;
  effectBlend?: "normal" | "screen";
  colors: [string, string] | null;
  audio: string | null;
  favoriteSong?: import("./music-links.js").FavoriteSong | null;
  musicPriority?: boolean;
  profileEffect: EffectStyle;
  music: MusicStyle;
}
export interface MediaAsset {
  id: string;
  ownerId: string;
  slot: MediaSlot;
  status: "processing" | "ready" | "failed" | "revoked";
  mime: string;
  animated: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  url: string;
  previewUrl: string | null;
  error: string | null;
  createdAt: string;
  bytes?: number;
}
export interface ProfileRevision {
  id: string;
  userId: string;
  config: ProfileConfig;
  status: "pending" | "approved" | "rejected" | "revoked";
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
  presetId?: string | null;
  baselineRevisionId?: string | null;
  activateOnApproval?: boolean;
}
export interface PublicProfile {
  userId: string;
  revisionId: string;
  config: ProfileConfig;
  media: Record<string, Pick<MediaAsset, "id" | "url" | "previewUrl" | "mime" | "animated">>;
  updatedAt: string;
  badges?: import("./studio-model.js").StudioBadge[];
}
export interface CatalogItem {
  id: string;
  kind: "decoration" | "effect" | "nameplate";
  name: string;
  imageUrl: string;
  staticUrl: string;
  discordAsset: string | null;
  layers: {
    src: string;
    width: number;
    height: number;
    start: number;
    duration: number;
    loop: boolean;
    loopDelay: number;
    x: number;
    y: number;
    zIndex: number;
  }[];
  metadata?: import("./studio-model.js").CatalogMetadata;
}
export interface ModerationDecision {
  revisionId: string;
  action: "approve" | "reject";
  reason?: string;
}
export interface EditorState {
  canUseCustomTint?: boolean;
  userId: string;
  isOwner: boolean;
  canModerate?: boolean;
  draft: ProfileConfig;
  draftVersion: number;
  revisions: ProfileRevision[];
  published: PublicProfile | null;
  assets: MediaAsset[];
}
export const DEFAULT_CONFIG: ProfileConfig = {
  albumBackground: { enabled: false, opacity: 0.25, blur: 12 },
  effectTint: null,
  decorationTint: null,
  avatar: null,
  decoration: null,
  banner: null,
  nameplate: null,
  effect: null,
  effectBlend: "normal",
  colors: null,
  audio: null,
  favoriteSong: null,
  profileEffect: { preset: "none", color: "#5865f2", intensity: 0.35, speed: 1 },
  music: {
    mode: "artwork",
    background: "#34353c",
    preset: "none",
    color: "#5865f2",
    intensity: 0.35,
    speed: 1,
  },
};
export function assetIds(config: ProfileConfig): string[] {
  return [
    ...new Set(
      [
        config.avatar,
        config.banner,
        ...(config.studio?.bannerLayers ?? []).map((layer) => layer.assetId),
        config.audio,
        config.decoration?.source === "media" ? config.decoration.id : null,
        config.effect?.source === "media" ? config.effect.id : null,
        ...[config.studio?.base, config.studio?.small, config.studio?.full].flatMap((scene) =>
          (scene?.layers ?? []).filter((layer) => layer.source === "media").map((layer) => layer.assetId),
        ),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
