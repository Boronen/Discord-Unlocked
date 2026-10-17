import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
export const settings = definePluginSettings({
  apiUrl: {
    type: OptionType.STRING,
    description: "Profile Studio API URL (HTTPS; http://localhost:3100 for local testing)",
    default: "http://localhost:3100",
    restartNeeded: true,
  },
  avatars: { type: OptionType.BOOLEAN, description: "Show custom avatars", default: true },
  decorations: {
    type: OptionType.BOOLEAN,
    description: "Show custom avatar decorations",
    default: true,
  },
  banners: { type: OptionType.BOOLEAN, description: "Show custom banners", default: true },
  nameplates: {
    type: OptionType.BOOLEAN,
    description: "Show custom nameplates in member and direct-message lists",
    default: true,
  },
  colors: { type: OptionType.BOOLEAN, description: "Show custom profile colors", default: true },
  effects: { type: OptionType.BOOLEAN, description: "Show profile effects", default: true },
  music: { type: OptionType.BOOLEAN, description: "Style music activity cards", default: true },
  hoverProfiles: {
    type: OptionType.BOOLEAN,
    description: "Open the small profile card after hovering over an avatar, name or member row",
    default: true,
  },
  hoverProfileDelay: {
    type: OptionType.SLIDER,
    description: "Hover profile delay (seconds)",
    default: 4,
    markers: [3, 4, 5],
    stickToMarkers: true,
  },
  performanceMode: {
    type: OptionType.SELECT,
    description: "Profile rendering quality. Auto adapts locally to sustained slow frames.",
    options: [
      { label: "Auto", value: "auto" as const, default: true },
      { label: "Quality", value: "quality" as const },
      { label: "Low", value: "low" as const },
    ],
  },
  viewerOverrides: {
    type: OptionType.STRING,
    description: "Local per-account profile display preferences",
    default: "{}",
    hidden: true,
  },
  audio: { type: OptionType.BOOLEAN, description: "Enable profile sound playback", default: true },
  volume: {
    type: OptionType.SLIDER,
    description: "Profile sound volume",
    default: 25,
    markers: [0, 25, 50, 75, 100],
    stickToMarkers: false,
  },
  mutedUsers: {
    type: OptionType.STRING,
    description: "Muted profile user IDs, separated by commas",
    default: "",
  },
  reducedMotion: {
    type: OptionType.BOOLEAN,
    description: "Use static previews instead of animations",
    default: false,
  },
  animationMode: {
    type: OptionType.SELECT,
    description: "Animation mode. Always animate overrides reduced motion in Discord and Windows.",
    options: [
      { label: "Follow Discord and Windows settings", value: "system" as const, default: true },
      { label: "Always animate", value: "always" as const },
      { label: "Always static", value: "static" as const },
    ],
  },
});
