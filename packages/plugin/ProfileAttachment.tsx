import {
  React,
  ReactDOM,
  PresenceStore,
  UserStore,
  useStateFromStores,
  ApplicationAssetUtils,
} from "@webpack/common";
import {
  useProfile,
  useReducedMotion,
  mediaUrl,
  sound,
  isMuted,
  catalog,
  Native,
  active,
  useMusicArtwork,
  useLiveMusic,
  loadAlbumArtwork,
} from "./runtime.js";
import { settings } from "./settings.js";
import { EffectLayer, effectStyle } from "./visuals.js";
import { artworkPalette, textOn } from "./palette.js";
import type { PublicProfile } from "./model.js";
import { profileRoot, applyProfileColors, applyProfileReadability } from "./profile-dom.js";
import { findMusicSurface, isMusicActivity, musicCover } from "./music-surface.js";
import { FavoriteSongCard } from "./FavoriteSong.js";
import { AlbumBackground, useAlbumArtwork } from "./album-art.js";
import { albumArtworkCache } from "./artwork-cache.js";
import { SceneRenderer, StudioBlocks, StudioBadges } from "./scene-renderer.js";
import { resolveScene, applyViewerOverride, type Surface } from "./studio-model.js";
import { readViewerOverride, writeViewerOverride } from "./viewer-overrides.js";
import { useArtworkPalette, priorityColors } from "./music-presentation.js";
export const localTests = new Map<string, PublicProfile>();
type Palette = ReturnType<typeof artworkPalette>;
const palettes = new Map<string, Palette>();
export function clearArtworkCache() {
  palettes.clear();
  albumArtworkCache.clear();
}
async function loadPalette(url: string): Promise<Palette> {
  if (palettes.has(url)) return palettes.get(url) ?? null;
  const data = await Native.artwork(url);
  const image = new Image();
  image.src = data;
  await image.decode();
  if (image.width * image.height > 16_000_000) throw new Error("Artwork is too large.");
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, 32, 32);
  const palette = artworkPalette(context.getImageData(0, 0, 32, 32).data);
  if (palettes.size >= 128) palettes.delete(palettes.keys().next().value!);
  palettes.set(url, palette);
  return palette;
}
function useMusic(
  root: HTMLElement | null,
  userId: string,
  profile: PublicProfile | null,
  reduced: boolean,
  replaced = false,
) {
  const enabled = settings.store.music;
  const activities = useStateFromStores([PresenceStore], () => PresenceStore.getActivities(userId));
  const activity = activities.find(isMusicActivity);
  const [palette, setPalette] = React.useState<Awaited<ReturnType<typeof loadPalette>>>(null);
  let cover: string | undefined;
  try {
    cover = musicCover(activity, (id, image, size) =>
      (ApplicationAssetUtils as any).getAssetImage(id, image, size),
    );
  } catch {}
  React.useEffect(() => {
    let cancelled = false;
    setPalette(null);
    if (cover && profile?.config.music.mode === "artwork")
      void loadPalette(cover)
        .then((value) => {
          if (!cancelled) setPalette(value);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cover, profile?.config.music.mode]);
  React.useEffect(() => {
    if (!root || !profile || !activity || (!enabled && !replaced) || !active) return;
    const changed = new Map<HTMLElement, { style: string | null; className: string }>();
    const music = profile.config.music;
    const apply = () => {
      const surface = findMusicSurface(root, activity);
      for (const element of surface ? [surface] : []) {
        if (changed.has(element)) continue;
        changed.set(element, { style: element.getAttribute("style"), className: element.className });
        if (replaced) {
          element.style.setProperty("display", "none", "important");
          continue;
        }
        const background = palette?.background ?? music.background;
        element.classList.add("ps-live-music", `ps-effect-${reduced ? "none" : music.preset}`);
        element.style.setProperty("--ps-music-bg", background);
        element.style.setProperty("--ps-music-text", textOn(background));
        element.style.setProperty(
          "--ps-effect-color",
          music.mode === "artwork" && palette ? palette.accent : music.color,
        );
        element.style.setProperty("--ps-intensity", String(music.intensity));
        element.style.setProperty("--ps-duration", `${5 / music.speed}s`);
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => {
      observer.disconnect();
      changed.forEach((previous, element) => {
        element.className = previous.className;
        if (previous.style === null) element.removeAttribute("style");
        else element.setAttribute("style", previous.style);
      });
    };
  }, [root, profile, activity, palette, reduced, enabled, replaced]);
}
export function ProfileAttachment({ userId }: { userId: string }) {
  settings.use(["viewerOverrides", "performanceMode"]);
  const fetched = useProfile(userId),
    original = localTests.get(userId) ?? fetched;
  const viewer = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id ?? "");
  const override = readViewerOverride(settings.store.viewerOverrides, viewer, userId);
  const profile = React.useMemo(
    () => (original ? { ...original, config: applyViewerOverride(original.config, override) } : null),
    [original, settings.store.viewerOverrides, viewer, userId],
  );
  const [surface, setSurface] = React.useState<Surface>("small");
  const scene = profile ? resolveScene(profile.config, surface) : null;
  const reduced = useReducedMotion() || settings.store.performanceMode === "low";
  const activityCover = useMusicArtwork(userId);
  const liveMusic = useLiveMusic(userId);
  const album = useAlbumArtwork(
    profile?.config.musicPriority === false ? undefined : activityCover,
    profile?.config.studio?.songs[0]?.artwork ?? profile?.config.favoriteSong?.artwork,
    (!!scene?.albumBackground.enabled || !!profile?.config.musicPriority) && active && settings.store.effects,
    loadAlbumArtwork,
  );
  const musicPalette = useArtworkPalette(album.url, !!profile?.config.musicPriority);
  const profileColors =
    priorityColors(musicPalette, !!profile?.config.musicPriority && override.background !== false) ??
    scene?.colors;
  const liveArt = useAlbumArtwork(
    profile?.config.musicPriority ? activityCover : undefined,
    undefined,
    !!profile?.config.musicPriority && !!activityCover,
    loadAlbumArtwork,
  );
  settings.use(["audio", "volume", "mutedUsers", "effects", "music", "colors", "banners"]);
  const anchor = React.useRef<HTMLSpanElement>(null),
    key = React.useRef(`${userId}:${Math.random()}`);
  const [root, setRoot] = React.useState<HTMLElement | null>(null),
    [blocked, setBlocked] = React.useState(false);
  const host = React.useRef<HTMLElement | null>(null);
  host.current = root;
  const [songArtwork, setSongArtwork] = React.useState<Record<string, string>>({});
  const songSources = JSON.stringify(profile?.config.studio?.songs.map((s) => s.artwork) ?? []);
  React.useEffect(() => {
    let canceled = false;
    void Promise.allSettled(
      (profile?.config.studio?.songs ?? [])
        .filter((s) => s.artwork)
        .map(async (s) => [s.artwork!, await loadAlbumArtwork(s.artwork!)] as const),
    ).then((results) => {
      if (!canceled)
        setSongArtwork(
          Object.fromEntries(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))),
        );
    });
    return () => {
      canceled = true;
    };
  }, [songSources]);
  React.useLayoutEffect(() => {
    if (!root) return;
    const measure = () => setSurface(root.clientWidth > 450 ? "full" : "small");
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);
  const favoriteSession = React.useRef(crypto.randomUUID());
  React.useLayoutEffect(() => {
    if (anchor.current) setRoot(profileRoot(anchor.current));
  }, [userId]);
  useMusic(
    root,
    userId,
    profile,
    reduced,
    !!profile?.config.musicPriority && !!liveMusic && !!scene?.blocks.some((block) => block.kind === "music"),
  );
  const banner = profile?.config.banner ? mediaUrl(profile, profile.config.banner, reduced) : undefined;
  React.useEffect(() => {
    if (!root || !banner || !settings.store.banners || !active) return;
    const element = root.querySelector<HTMLElement>('[class*="banner_"]');
    if (!element) return;
    const previous = element.style.backgroundImage;
    element.style.backgroundImage = `url("${banner}")`;
    return () => {
      element.style.backgroundImage = previous;
    };
  }, [root, banner, settings.store.banners]);
  const muted = isMuted(userId),
    audio =
      !profile?.config.favoriteSong && profile?.config.audio
        ? mediaUrl(profile, profile.config.audio)
        : undefined;
  React.useEffect(() => {
    if (!root || !audio || muted || !active) {
      setBlocked(false);
      return;
    }
    let alive = true;
    const session = key.current;
    void sound.open(session, audio, settings.store.volume / 100).then((value) => {
      if (alive) setBlocked(value);
    });
    return () => {
      alive = false;
      sound.close(session);
    };
  }, [root, audio, muted]);
  React.useEffect(() => {
    sound.volume(settings.store.volume / 100);
  }, [settings.store.volume]);
  React.useEffect(() => {
    if (root && active && settings.store.colors && profileColors)
      return applyProfileColors(root, profileColors);
  }, [root, profile, settings.store.colors, surface, profileColors?.join()]);
  React.useEffect(() => {
    if (root && profile && active)
      return applyProfileReadability(root, settings.store.colors ? profileColors : null);
  }, [root, profile, settings.store.colors, surface, profileColors?.join()]);
  React.useEffect(() => {
    if (!root || !profile || !active) return;
    const hadClass = root.classList.contains("ps-host"),
      previous = root.dataset.psCustomEffect;
    root.classList.add("ps-host");
    root.dataset.psCustomEffect = String(settings.store.effects && !!scene?.layers.length);
    const hadAlbum = root.classList.contains("ps-album-host");
    if (album.url && scene?.albumBackground.enabled && settings.store.effects)
      root.classList.add("ps-album-host");
    return () => {
      if (!hadClass) root.classList.remove("ps-host");
      if (!hadAlbum) root.classList.remove("ps-album-host");
      if (previous === undefined) delete root.dataset.psCustomEffect;
      else root.dataset.psCustomEffect = previous;
    };
  }, [root, profile, settings.store.effects, album.url]);
  const item =
    profile?.config.effect?.source === "discord" ? catalog.get(profile.config.effect.id) : undefined;
  return (
    <>
      <span ref={anchor} className="ps-profile-anchor" />
      {root &&
        profile &&
        active &&
        ReactDOM.createPortal(
          <>
            {settings.store.effects && (
              <AlbumBackground config={scene?.albumBackground} url={album.url} reduced={reduced} />
            )}
            {settings.store.effects && scene ? (
              <SceneRenderer
                scene={scene}
                items={[...catalog.values()]}
                urls={Object.fromEntries(
                  Object.keys(profile.media).flatMap((id) => {
                    const url = mediaUrl(profile, id, reduced);
                    const still = mediaUrl(profile, id, true);
                    return [...(url ? [[id, url]] : []), ...(still ? [[`${id}:static`, still]] : [])];
                  }),
                )}
                reduced={reduced}
                mode={settings.store.performanceMode}
                sessionKey={`${userId}:${key.current}`}
                host={host}
              />
            ) : (
              settings.store.effects && (
                <div
                  className="ps-profile-overlay"
                  style={{
                    mixBlendMode:
                      profile.config.effect?.source === "media"
                        ? (profile.config.effectBlend ?? "normal")
                        : "normal",
                  }}
                >
                  <EffectLayer
                    effect={profile.config.profileEffect}
                    tint={profile.config.effectTint}
                    item={item}
                    reduced={reduced}
                    url={
                      profile.config.effect?.source === "media"
                        ? mediaUrl(profile, profile.config.effect.id, reduced)
                        : undefined
                    }
                  />
                </div>
              )
            )}
            {audio && (
              <div className="ps-live-controls ps-sound-controls" lang="en">
                <button
                  type="button"
                  onClick={() => {
                    const ids = new Set(settings.store.mutedUsers.split(",").filter(Boolean));
                    if (ids.has(userId)) ids.delete(userId);
                    else ids.add(userId);
                    settings.store.mutedUsers = [...ids].join(",");
                  }}
                  aria-pressed={muted}
                >
                  {muted ? "Unmute profile" : "Mute profile"}
                </button>
                {blocked && !muted && (
                  <button type="button" onClick={() => void sound.retry(key.current).then(setBlocked)}>
                    Play sound
                  </button>
                )}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.store.volume}
                  aria-label="Profile sound volume"
                  onChange={(event) => {
                    settings.store.volume = Number(event.target.value);
                  }}
                />
              </div>
            )}
          </>,
          root,
        )}
      {root &&
        profile &&
        scene &&
        active &&
        ReactDOM.createPortal(
          <div className="ps-favorite-mount">
            <StudioBadges badges={profile.badges} />
            <StudioBlocks
              config={profile.config}
              surface={surface}
              scene={scene}
              reduced={reduced}
              artwork={songArtwork}
              liveMusic={liveMusic}
              liveArtwork={liveArt.url}
              muted={muted}
              onPlay={(url) => Native.playSong(url, favoriteSession.current)}
              onClose={() => {
                void Native.closeSong(favoriteSession.current);
              }}
            />
            <details className="ps-viewer-controls">
              <summary>Profile display on this device</summary>
              {(["background", "effects", "decoration", "tint", "parallax"] as const).map((name) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={override[name] !== false}
                    onChange={(e) => {
                      settings.store.viewerOverrides = writeViewerOverride(
                        settings.store.viewerOverrides,
                        viewer,
                        userId,
                        { ...override, [name]: e.target.checked },
                      );
                    }}
                  />
                  Show {name}
                </label>
              ))}
              <button
                type="button"
                onClick={() => {
                  settings.store.viewerOverrides = writeViewerOverride(
                    settings.store.viewerOverrides,
                    viewer,
                    userId,
                    {},
                  );
                }}
              >
                Reset local display preferences
              </button>
            </details>
          </div>,
          root.querySelector('[class*="scroller_"]') ?? root.querySelector('[class*="inner_"]') ?? root,
        )}
    </>
  );
}
