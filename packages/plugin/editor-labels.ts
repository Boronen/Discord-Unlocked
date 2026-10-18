import type { MediaSlot } from "./model.js";
export const statusNames = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};
export const slotNames: Record<MediaSlot, string> = {
  avatar: "Avatar",
  decoration: "Avatar decoration",
  banner: "Banner",
  effect: "Profile effect",
  audio: "Profile sound",
};
