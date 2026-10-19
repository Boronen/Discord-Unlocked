// SPDX-License-Identifier: GPL-3.0-or-later
import "./styles.css";
import definePlugin from "@utils/types";
import ErrorBoundary from "@components/ErrorBoundary";
import {
  React,
  UserStore,
  UserProfileStore,
  useStateFromStores,
  createRoot,
  SelectedGuildStore,
  SelectedChannelStore,
  ChannelStore,
} from "@webpack/common";
import { findComponentByCodeLazy } from "@webpack";
import { Editor } from "./Editor.js";
import { diagnosticOrigin } from "./client.js";
import { settings } from "./settings.js";
import {
  active,
  setActive,
  cache,
  client,
  sound,
  useProfile,
  mediaUrl,
  useReducedMotion,
  catalog,
  loadCatalog,
  syncAccount,
  motionReduced,
  Native,
  useLiveMusic,
  loadAlbumArtwork,
  startAutomation,
} from "./runtime.js";
import { ProfileAttachment, localTests, clearArtworkCache } from "./ProfileAttachment.js";
import { readClientCatalog, lastShopRefresh } from "./catalogue.js";
import { assetIds, type PublicProfile } from "./model.js";
import { profilePatches } from "./patches.js";
import { tagAvatarSource } from "./profile-dom.js";
import virtualMerge from "virtual-merge";
import { NameplateRows } from "./nameplates.js";
import { DecorationTints, markDecoration } from "./decoration-tints.js";
import { readViewerOverride } from "./viewer-overrides.js";
import { tagDecorationTint, type TintStyle } from "./tint.js";
import { HoverProfiles } from "./hover-profiles.js";
import { HoverProfileCard, type NativeHoverCardProps } from "./HoverProfileCard.js";
import { configureSteamGames, clearSteamGames } from "./steam-games.js";
import { albumArtworkCache } from "./artwork-cache.js";
let localMediaOwner = new AbortController();
function clearLocalTests() {
  localTests.clear();
  localMediaOwner.abort();
  localMediaOwner = new AbortController();
}
const hoverProfiles = new HoverProfiles(
  () => active && client.canView && settings.store.hoverProfiles,
  () => settings.store.hoverProfileDelay * 1000,
  (id, anchor) => openHoverCard(id, anchor),
);
// Native memo wrapper used by Discord's avatar summaries. No full-profile modal fallback.
const NativeUserPopout = findComponentByCodeLazy<NativeHoverCardProps>(
  "children:",
  "userId:",
  "user:",
  ".getCurrentUser()",
  ".getUser(",
  "currentUser:",
);
let closeHoverCard: (() => void) | undefined;
function openHoverCard(id: string, anchor: Element) {
  closeHoverCard?.();
  if (!anchor.isConnected || !UserStore.getUser(id)) return;
  const host = document.createElement("div");
  host.className = "ps-hover-profile-mount";
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (closeHoverCard === close) closeHoverCard = undefined;
    // Native close callbacks can run during a React commit.
    queueMicrotask(() => {
      try {
        root.unmount();
      } finally {
        host.remove();
      }
    });
  };
  closeHoverCard = close;
  const dm = !!anchor.closest('[data-list-item-id^="private-channels-"]');
  root.render(
    <ErrorBoundary noop>
      <HoverProfileCard
        id={id}
        anchor={anchor}
        component={NativeUserPopout}
        onClose={close}
        guildId={dm ? undefined : (SelectedGuildStore.getGuildId() ?? undefined)}
        channelId={(dm ? ChannelStore.getDMFromUserId(id) : SelectedChannelStore.getChannelId()) ?? undefined}
      />
    </ErrorBoundary>,
  );
}
const decorationTints = new DecorationTints();
const cleanups: (() => void)[] = [];
const profileMerges = new WeakMap<object, { revision: string; value: any }>();
const nativeProfileSources = new Map<string, any>();
let nativeAvatarResolver: ((...args: any[]) => string) | undefined;
const nameplateRows = new NameplateRows(
  (id) => {
    if (!active || !client.canView || !settings.store.nameplates) return undefined;
    const selection = current(id)?.config.nameplate;
    return selection ? catalog.get(selection) : undefined;
  },
  (id, update) => cache.observe(id, update),
  motionReduced,
);
function current(id: string) {
  if (!active) return null;
  if (!cache.has(id)) cache.want(id);
  const profile = localTests.get(id) ?? cache.get(id);
  if (!profile) return profile;
  const flags = readViewerOverride(settings.store.viewerOverrides, UserStore.getCurrentUser()?.id ?? "", id);
  if (flags.decoration !== false && flags.tint !== false) return profile;
  return {
    ...profile,
    config: {
      ...profile.config,
      ...(flags.decoration === false ? { decoration: null } : {}),
      ...(flags.tint === false ? { decorationTint: null } : {}),
    },
  };
}
function mediaFor(id: string, assetId: string | null) {
  const url = mediaUrl(current(id), assetId, motionReduced());
  return url ? tagAvatarSource(url, id) : undefined;
}
function SettingsEditor() {
  settings.use(["animationMode", "reducedMotion"]);
  const account = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
  const liveMusic = useLiveMusic(account?.id);
  const activityCover = liveMusic?.artwork;
  const display = useStateFromStores([UserProfileStore], () =>
    account ? UserProfileStore.getUserProfile(account.id) : null,
  ) as any;
  if (!account) return null;
  const original = nativeProfileSources.get(account.id) ?? display;
  const banner = original?.banner;
  const decoration = (account as any).avatarDecorationData?.asset;
  const originalColors =
    original?.themeColors?.length === 2
      ? (original.themeColors.map((v: number) => `#${v.toString(16).padStart(6, "0")}`) as [string, string])
      : undefined;
  return (
    <Editor
      api={client}
      activityCover={activityCover}
      liveMusic={liveMusic}
      artworkLoader={loadAlbumArtwork}
      draftStorage={{
        load: (id, base, preset) => Native.loadDraftBackup(id, base, preset),
        save: (backup) => Native.saveDraftBackup(backup),
        remove: (id, base, preset) => Native.removeDraftBackup(id, base, preset),
      }}
      onExportCard={(svg, width, height) => Native.exportProfilePng(svg, width, height)}
      gifExporter={{
        begin: (width, height) => Native.beginProfileGif(width, height),
        frame: (id, svg, time) => Native.appendProfileGif(id, svg, time),
        finish: (id, time) => Native.finishProfileGif(id, time),
        cancel: (id) => Native.cancelProfileGif(id),
      }}
      onExportData={() => Native.exportAccountData(client.base, client.token!, account.id)}
      account={{
        id: account.id,
        name: account.globalName ?? account.username,
        avatar: nativeAvatarResolver?.call(account) ?? account.getAvatarURL(),
        original: {
          bannerUrl:
            typeof banner === "string" && /^[a-zA-Z0-9_]+$/.test(banner)
              ? `https://cdn.discordapp.com/banners/${account.id}/${banner}.${banner.startsWith("a_") ? "gif" : "png"}?size=600`
              : undefined,
          decorationUrl:
            typeof decoration === "string" && /^[a-zA-Z0-9_]+$/.test(decoration)
              ? `https://cdn.discordapp.com/avatar-decoration-presets/${decoration}.png?size=240`
              : undefined,
          colors: originalColors,
          bio: original?.bio,
          effectId: original?.profileEffectId,
        },
      }}
      onPublished={() => {
        cache.clear();
        void loadCatalog().catch(() => {});
      }}
      animationMode={settings.store.animationMode}
      onAnimationMode={(mode) => {
        settings.store.animationMode = mode;
      }}
      animationsStatic={motionReduced()}
      importCatalog={readClientCatalog}
      onClearCache={() => {
        cache.clear();
        clearArtworkCache();
      }}
      diagnostics={() =>
        `Vencord: 32c90633ce6a95d7e56c95479efbb431bacf1eac\nAPI: ${diagnosticOrigin(client.base)}
Connection: ${client.token ? "Paired" : "Not paired"}\nProfile API: ${cache.error ? "Request failed; details stay local" : "OK"}
Catalog: ${catalog.size} items\nShop refresh: ${lastShopRefresh}\nLocal tests: ${localTests.size}`
      }
      onTestProfile={async (id, config) => {
        clearLocalTests();
        const owner = localMediaOwner;
        if (id) {
          const state = await client.editor();
          const media: PublicProfile["media"] = {};
          for (const asset of state.assets)
            if (asset.status === "ready" && assetIds(config).includes(asset.id)) {
              media[asset.id] = {
                ...asset,
                url: await client.privateMedia(asset.url, owner.signal),
                previewUrl: asset.previewUrl
                  ? await client.privateMedia(asset.previewUrl, owner.signal)
                  : null,
              };
            }
          if (owner.signal.aborted) return;
          localTests.set(id, {
            userId: id,
            revisionId: `local-test:${Date.now()}`,
            config,
            media,
            updatedAt: new Date().toISOString(),
          });
        }
        cache.clear();
      }}
    />
  );
}
export default definePlugin({
  name: "ProfileStudio",
  description: "Shared animated profiles, profile sounds and custom music cards, with moderated submissions.",
  authors: [{ name: "Profile Studio", id: 0n }],
  tags: ["Appearance", "Customisation", "Media"],
  settings,
  settingsAboutComponent: ErrorBoundary.wrap(SettingsEditor),
  patches: profilePatches,
  start() {
    setActive(true);
    client.setBase(settings.store.apiUrl);
    syncAccount();
    configureSteamGames(
      (value) => Native.steamGame(value),
      (url) => albumArtworkCache.load(url, (value) => Native.artwork(value)),
    );
    hoverProfiles.start();
    cleanups.push(startAutomation());
    nameplateRows.start();
    decorationTints.start();
    cleanups.push(
      client.subscribe(() => {
        nameplateRows.refresh();
        if (!client.canView) {
          hoverProfiles.cancel();
          closeHoverCard?.();
          clearSteamGames();
          clearLocalTests();
          nativeProfileSources.clear();
          clearArtworkCache();
        }
      }),
    );
    // User model URL resolver also covers consumers which don't use the common Avatar.
    const user = UserStore.getCurrentUser();
    const proto = user ? Object.getPrototypeOf(user) : null;
    if (proto && typeof proto.getAvatarURL === "function") {
      const original = proto.getAvatarURL;
      nativeAvatarResolver = original;
      function wrapped(this: { id: string }, ...args: any[]) {
        const profile = current(this.id);
        const url =
          settings.store.avatars && profile?.config.avatar
            ? (mediaFor(this.id, profile.config.avatar) ?? original.apply(this, args))
            : original.apply(this, args);
        // Also identify default avatars before the asynchronous profile fetch
        // completes, so the Avatar hook subscribes and repaints on arrival.
        return settings.store.avatars || settings.store.nameplates || settings.store.hoverProfiles
          ? tagAvatarSource(url, this.id)
          : url;
      }
      proto.getAvatarURL = wrapped;
      cleanups.push(() => {
        if (proto.getAvatarURL === wrapped) proto.getAvatarURL = original;
      });
    }
  },
  stop() {
    closeHoverCard?.();
    hoverProfiles.stop();
    configureSteamGames();
    nameplateRows.stop();
    decorationTints.stop();
    setActive(false);
    sound.stop();
    cache.stop();
    client.disconnect();
    nativeProfileSources.clear();
    nativeAvatarResolver = undefined;
    clearLocalTests();
    catalog.clear();
    cleanups.splice(0).forEach((fn) => fn());
  },
  flux: {
    CONNECTION_OPEN: () => {
      syncAccount();
      clearLocalTests();
    },
    LOGOUT: () => {
      closeHoverCard?.();
      nativeProfileSources.clear();
      void client.logout().catch(() => {});
      sound.stop();
      clearLocalTests();
      cache.clear();
    },
  },
  ProfileAttachment: ErrorBoundary.wrap((props: { userId: string }) => <ProfileAttachment {...props} />, {
    noop: true,
  }),
  useAvatarProps(props: any) {
    const reduced = useReducedMotion();
    settings.use(["avatars", "nameplates"]);
    React.useEffect(() => {
      nameplateRows.refresh();
    });
    const source = props.src ?? props.avatar ?? "";
    let marker: string | null = null;
    try {
      const url = new URL(source);
      marker = url.searchParams.get("ps-user") ?? new URLSearchParams(url.hash.slice(1)).get("ps-user");
    } catch {}
    const id =
      props.userId ??
      props.user?.id ??
      marker ??
      String(source).match(/\/(?:avatars|users)\/(\d{17,20})\//)?.[1];
    const fetched = useProfile(id);
    const profile = id ? (localTests.get(id) ?? fetched) : fetched;
    if (!active || !settings.store.avatars || !profile?.config.avatar) return props;
    const url = mediaUrl(profile, profile.config.avatar, reduced);
    return url ? { ...props, src: tagAvatarSource(url, id) } : props;
  },
  useDecoration(user: { id: string } | undefined) {
    const fetched = useProfile(user?.id),
      profile = user ? (localTests.get(user.id) ?? fetched) : fetched,
      reduced = useReducedMotion();
    settings.use(["decorations"]);
    if (!active || !settings.store.decorations || !profile?.config.decoration) return undefined;
    const selection = profile.config.decoration;
    if (selection.source === "discord") {
      const item = catalog.get(selection.id);
      return item
        ? {
            asset: reduced
              ? item.staticUrl
              : `${item.imageUrl}${item.imageUrl.includes("?") ? "&" : "?"}passthrough=true`,
            skuId: "profile-studio",
            psTint: profile.config.decorationTint,
          }
        : undefined;
    }
    const url = mediaUrl(profile, selection.id, reduced);
    return url ? { asset: url, skuId: "profile-studio", psTint: profile.config.decorationTint } : undefined;
  },
  decorationUrl({
    avatarDecoration,
    canAnimate,
  }: {
    avatarDecoration?: { asset: string; skuId: string; psTint?: TintStyle | null };
    canAnimate?: boolean;
  }) {
    if (!active || !settings.store.decorations || avatarDecoration?.skuId !== "profile-studio")
      return undefined;
    return markDecoration(tagDecorationTint(avatarDecoration.asset, avatarDecoration.psTint));
  },
  bannerUrl({ displayProfile }: { displayProfile?: { userId: string } }) {
    if (!active || !settings.store.banners || !displayProfile?.userId) return undefined;
    if (
      readViewerOverride(
        settings.store.viewerOverrides,
        UserStore.getCurrentUser()?.id ?? "",
        displayProfile.userId,
      ).background === false
    )
      return undefined;
    const profile = current(displayProfile.userId);
    return profile?.config.banner ? mediaFor(displayProfile.userId, profile.config.banner) : undefined;
  },
  patchProfile(original: any) {
    if (original?.userId) {
      if (nativeProfileSources.size > 100) nativeProfileSources.clear();
      nativeProfileSources.set(original.userId, original);
    }
    if (!original || !active || !settings.store.colors) return original;
    const profile = current(original.userId);
    if (!profile?.config.colors) return original;
    const previous = profileMerges.get(original);
    if (previous?.revision === profile.revisionId) return previous.value;
    const value = virtualMerge(original, {
      premiumType: 2,
      themeColors: profile.config.colors.map((hex) => parseInt(hex.slice(1), 16)),
    });
    profileMerges.set(original, { revision: profile.revisionId, value });
    return value;
  },
});
