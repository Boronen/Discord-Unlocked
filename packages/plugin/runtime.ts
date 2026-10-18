import {
  React,
  UserStore,
  AccessibilityStore,
  useStateFromStores,
  PresenceStore,
  ApplicationAssetUtils,
} from "@webpack/common";
import { isMusicActivity, musicCover, currentMusic } from "./music-surface.js";
import { albumArtworkCache } from "./artwork-cache.js";
import type { PluginNative } from "@utils/types";
import { StudioClient } from "./client.js";
import { ProfileCache } from "./cache.js";
import { ProfileAudio } from "./audio.js";
import { MediaUrlCache } from "./media-cache.js";
import { settings } from "./settings.js";
import { reduceMotion } from "./motion.js";
import type { PublicProfile, CatalogItem } from "./model.js";
import { AutomationController } from "./automation.js";
export const Native = VencordNative.pluginHelpers.ProfileStudio as PluginNative<typeof import("./native")>;
export const loadAlbumArtwork = (url: string) => Native.artwork(url);
export function useLiveMusic(id?: string) {
  const activity = useStateFromStores([PresenceStore], () =>
    id ? PresenceStore.getActivities(id).find(isMusicActivity) : undefined,
  );
  let cover: string | undefined;
  try {
    cover = musicCover(activity, (app, image, size) =>
      (ApplicationAssetUtils as any).getAssetImage(app, image, size),
    );
  } catch {}
  return currentMusic(activity, cover);
}
export function useMusicArtwork(id?: string) {
  const activity = useStateFromStores([PresenceStore], () =>
    id ? PresenceStore.getActivities(id).find(isMusicActivity) : undefined,
  );
  try {
    return musicCover(activity, (app, image, size) =>
      (ApplicationAssetUtils as any).getAssetImage(app, image, size),
    );
  } catch {
    return undefined;
  }
}
// Plugin modules load before Vencord assigns settings.pluginName. The saved API
// URL is applied by start(); reading settings.store here aborts all of Vencord.
export const client = new StudioClient(settings.def.apiUrl.default, (...args) => Native.request(...args), {
  load: (id, base) => Native.loadSession(id, base),
  save: (id, base, token) => Native.saveSession(id, base, token),
  remove: (id, base) => Native.removeSession(id, base),
});
export const cache = new ProfileCache(async (ids) => {
  const profiles = await client.profiles(ids);
  if (
    Object.values(profiles).some((profile) =>
      [
        profile?.config.effect,
        profile?.config.decoration,
        profile?.config.nameplate ? { source: "discord", id: profile.config.nameplate } : null,
      ].some((selection) => selection?.source === "discord" && !catalog.has(selection.id)),
    )
  )
    await loadCatalog().catch(() => {});
  return profiles;
});
cache.stop();
export const publicMedia = new MediaUrlCache(
  (url) => client.publicMedia(url),
  (id) => cache.notify(id),
  (id) => cache.isObserved(id),
);
export const sound = new ProfileAudio((url) => new Audio(url));
export const catalog = new Map<string, CatalogItem>();
export let active = false;
let viewingToken: string | undefined;
let accessRetry: ReturnType<typeof setTimeout> | undefined;
function updateAccess() {
  const token = active && client.canView ? client.token : undefined;
  if (token === viewingToken) return;
  viewingToken = token;
  clearTimeout(accessRetry);
  cache.stop();
  publicMedia.clear();
  sound.stop();
  catalog.clear();
  albumArtworkCache.clear();
  void Native.stopPlayback().catch(() => {});
  if (token) {
    void client
      .capabilities()
      .then(() => {
        if (viewingToken === token) {
          cache.start();
          void loadCatalog().catch(() => {});
        }
      })
      .catch(() => {
        accessRetry = setTimeout(() => {
          if (viewingToken === token && active) {
            viewingToken = undefined;
            updateAccess();
          }
        }, 5000);
      });
  }
}
export function startAutomation() {
  let stopped = false,
    busy = false,
    next = 0,
    state: import("./studio-model.js").AutomationState | null = null;
  const makeController = () =>
    new AutomationController((id) =>
      client.request(
        "/v2/me/automation/" + (id ? "activate" : "release"),
        "POST",
        id ? { presetId: id } : {},
      ),
    );
  let controller = makeController(),
    identity = "";
  const unsubscribe = client.subscribe(() => {
    if (!client.canView) {
      state = null;
      next = 0;
      identity = "";
      controller = makeController();
    }
  });
  const tick = async () => {
    if (stopped || busy || !active || !client.canView || !client.studioV2) return;
    busy = true;
    try {
      const key = `${client.base}:${client.userId}:${client.token}`;
      if (key !== identity) {
        identity = key;
        state = null;
        next = 0;
        controller = makeController();
      }
      if (Date.now() >= next) {
        state = await client.request<import("./studio-model.js").AutomationState>("/v2/me/automation");
        next = Date.now() + 15_000;
      }
      if (!state) return;
      const id = UserStore.getCurrentUser()?.id;
      if (!id) return;
      const acts = PresenceStore.getActivities(id);
      await controller.tick(state.enabled, state.version, state.rules, {
        status: PresenceStore.getStatus(id),
        music: acts.some(isMusicActivity),
        games: acts.filter((a) => a.type === 0 && a.application_id).map((a) => a.application_id!),
      });
    } catch {
      next = 0;
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 2000);
  void tick();
  return () => {
    unsubscribe();
    stopped = true;
    clearInterval(timer);
  };
}
client.subscribe(updateAccess);
export function setActive(value: boolean) {
  active = value;
  if (!value) publicMedia.clear();
  updateAccess();
}
export function useProfile(id: string | undefined) {
  const [, render] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!id) return;
    const stop = cache.observe(id, render);
    return () => {
      stop();
      publicMedia.prune();
    };
  }, [id]);
  return id && active && client.canView ? cache.get(id) : null;
}
export function useReducedMotion() {
  settings.use(["reducedMotion", "animationMode"]);
  const discord = useStateFromStores(
    [AccessibilityStore],
    () => AccessibilityStore?.useReducedMotion ?? false,
  );
  const [reduced, setReduced] = React.useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduceMotion(settings.store.animationMode, settings.store.reducedMotion, reduced, discord);
}
export function motionReduced() {
  return reduceMotion(
    settings.store.animationMode,
    settings.store.reducedMotion,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    AccessibilityStore?.useReducedMotion ?? false,
  );
}
export function mediaUrl(profile: PublicProfile | null, id: string | null, reduced = false) {
  const asset = id ? profile?.media[id] : null;
  const url = asset ? (reduced ? (asset.previewUrl ?? asset.url) : asset.url) : undefined;
  return url && profile ? publicMedia.resolve(url, profile.userId) : undefined;
}
export function isMuted(userId: string) {
  return (
    !settings.store.audio ||
    settings.store.mutedUsers
      .split(",")
      .map((id) => id.trim())
      .includes(userId)
  );
}
export function syncAccount() {
  const id = UserStore.getCurrentUser()?.id;
  if (!id || (client.userId && client.userId !== id)) {
    client.disconnect();
    sound.stop();
    cache.clear();
    publicMedia.clear();
  }
  if (id && !client.token) void client.restore(id).catch(() => {});
}
export async function loadCatalog() {
  const items = await client.catalog();
  catalog.clear();
  items.forEach((item) => catalog.set(item.id, item));
  return items;
}
