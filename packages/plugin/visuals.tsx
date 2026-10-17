import { React } from "@webpack/common";
import type { CatalogItem, EffectStyle, MusicStyle, ProfileConfig, ProfileAccount } from "./model.js";
import { textOn } from "./palette.js";
import { profileReadability } from "./profile-readability.js";
import type { FavoriteSong } from "./music-links.js";
import { NameplatePreview } from "./CollectibleMedia.js";
import { TintSurface } from "./TintSurface.js";
import type { TintStyle } from "./tint.js";
import { AlbumBackground, useAlbumArtwork } from "./album-art.js";
import { SceneRenderer, StudioBlocks, StudioBadges, type PerformanceMode } from "./scene-renderer.js";
import { resolveScene, type SceneLayer } from "./studio-model.js";
import type { LiveMusic } from "./music-surface.js";
import { useArtworkPalette, priorityColors } from "./music-presentation.js";
export function effectStyle(effect: EffectStyle): React.CSSProperties {
  return {
    "--ps-effect-color": effect.color,
    "--ps-intensity": effect.intensity,
    "--ps-duration": `${5 / effect.speed}s`,
  } as React.CSSProperties;
}
function TimedLayer({ layer, reduced }: { layer: CatalogItem["layers"][number]; reduced: boolean }) {
  const [visible, setVisible] = React.useState(reduced || layer.start === 0);
  const [cycle, setCycle] = React.useState(0);
  React.useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const start = Date.now();
    const update = () => {
      const elapsed = Date.now() - start - layer.start;
      if (elapsed >= 0) setCycle(layer.loop ? Math.floor(elapsed / (layer.duration + layer.loopDelay)) : 0);
      setVisible(
        elapsed >= 0 &&
          (layer.loop
            ? elapsed % (layer.duration + layer.loopDelay) < layer.duration
            : elapsed < layer.duration),
      );
    };
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [layer, reduced]);
  return visible ? (
    <img
      key={cycle}
      alt=""
      src={layer.src}
      style={{
        position: "absolute",
        left: `${(layer.x / 450) * 100}%`,
        top: `${(layer.y / 880) * 100}%`,
        width: `${(layer.width / 450) * 100}%`,
        height: `${(layer.height / 880) * 100}%`,
        zIndex: layer.zIndex,
      }}
    />
  ) : null;
}
export function EffectLayer({
  effect,
  url,
  item,
  reduced = false,
  blend = "normal",
  tint,
}: {
  effect: EffectStyle;
  url?: string;
  item?: CatalogItem;
  reduced?: boolean;
  blend?: "normal" | "screen";
  tint?: TintStyle | null;
}) {
  return (
    <div
      className={`ps-effect ps-effect-${reduced ? "none" : effect.preset}`}
      style={{ ...effectStyle(effect), mixBlendMode: url ? blend : "normal" }}
      aria-hidden="true"
    >
      <TintSurface tint={tint}>
        {url && <img className="ps-full-effect ps-custom-effect" src={url} alt="" />}
        {item &&
          (reduced ? (
            <img className="ps-full-effect" src={item.staticUrl} alt="" />
          ) : item.layers.length ? (
            item.layers.map((layer, index) => <TimedLayer key={index} layer={layer} reduced={false} />)
          ) : (
            <img className="ps-full-effect" src={item.imageUrl} alt="" />
          ))}
      </TintSurface>
    </div>
  );
}
export function MusicPreview({ style, song }: { style: MusicStyle; song?: FavoriteSong | null }) {
  const foreground = textOn(style.background);
  return (
    <section
      className={`ps-music ps-effect-${style.preset}`}
      style={{ ...effectStyle(style), backgroundColor: style.background, color: foreground }}
      aria-label="Music card preview"
    >
      <small>{song ? "Favorite song" : "Listening to Apple Music"}</small>
      <div className="ps-track">
        <div className="ps-artwork" aria-hidden="true">
          ♪
        </div>
        <div>
          <strong>{song?.title ?? "Story of My Life"}</strong>
          <span>{song?.artist ?? "DC THE DON · FUNERAL"}</span>
          <div className="ps-progress" />
          <small>
            00:06 <span className="ps-track-end">02:45</span>
          </small>
        </div>
      </div>
    </section>
  );
}
export function ProfilePreview({
  config,
  urls,
  items,
  account,
  reduced = false,
  full = false,
  albumUrl,
  performanceMode,
  sceneEditor,
  forcedPhase,
  badges,
  artworkLoader,
  originalView = false,
  liveMusic,
}: {
  config: ProfileConfig;
  urls: Record<string, string>;
  items: CatalogItem[];
  account: ProfileAccount;
  originalView?: boolean;
  liveMusic?: LiveMusic;
  reduced?: boolean;
  full?: boolean;
  albumUrl?: string;
  performanceMode?: PerformanceMode;
  sceneEditor?: {
    selected?: string;
    lockedLayers?: readonly string[];
    onSelect: (id: string) => void;
    onTransform: (id: string, transform: SceneLayer["transform"]) => void;
  };
  forcedPhase?: SceneLayer["phase"];
  badges?: import("./studio-model.js").StudioBadge[];
  artworkLoader?: (url: string) => Promise<string>;
}) {
  const host = React.useRef<HTMLElement>(null);
  const [songArt, setSongArt] = React.useState<Record<string, string>>({});
  const songsKey = JSON.stringify(config.studio?.songs.map((s) => s.artwork) ?? []);
  React.useEffect(() => {
    let canceled = false;
    if (artworkLoader)
      void Promise.allSettled(
        (config.studio?.songs ?? [])
          .filter((s) => s.artwork)
          .map(async (s) => [s.artwork!, await artworkLoader(s.artwork!)] as const),
      ).then((results) => {
        if (!canceled)
          setSongArt(Object.fromEntries(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
      });
    return () => {
      canceled = true;
    };
  }, [songsKey, artworkLoader]);
  const get = (id: string | null) => (id ? urls[id] : undefined);
  const decoration =
    config.decoration?.source === "media"
      ? get(config.decoration.id)
      : config.decoration
        ? items.find((item) => item.id === config.decoration?.id)?.[reduced ? "staticUrl" : "imageUrl"]
        : account.original?.decorationUrl;
  const effectItem =
    config.effect?.source === "discord"
      ? items.find((item) => item.id === config.effect?.id)
      : !config.effect
        ? items.find((item) => item.id === account.original?.effectId)
        : undefined;
  const scene = config.studio ? resolveScene(config, full ? "full" : "small") : null;
  const backgroundArt = useAlbumArtwork(
    config.musicPriority === false ? undefined : liveMusic?.artwork,
    config.studio?.songs[0]?.artwork ?? config.favoriteSong?.artwork,
    (!!(scene?.albumBackground ?? config.albumBackground)?.enabled || !!config.musicPriority) && !albumUrl,
    artworkLoader,
  );
  const palette = useArtworkPalette(albumUrl ?? backgroundArt.url, !!config.musicPriority);
  const selectedColors =
    priorityColors(palette, !!config.musicPriority) ??
    (scene ? scene.colors : config.colors) ??
    account.original?.colors;
  const liveArt = useAlbumArtwork(
    config.musicPriority ? liveMusic?.artwork : undefined,
    undefined,
    !!config.musicPriority && !!liveMusic?.artwork,
    artworkLoader,
  );
  const banner = get(config.banner) ?? (!config.banner ? account.original?.bannerUrl : undefined);
  const colors = selectedColors ?? ["var(--background-secondary)", "var(--background-tertiary)"];
  return (
    <article
      ref={host}
      className={`ps-profile ${full ? "ps-profile-full" : ""}`}
      style={{
        ...profileReadability(selectedColors),
        background: selectedColors ? `linear-gradient(155deg,${colors[0]},${colors[1]})` : undefined,
        color: selectedColors ? profileReadability(selectedColors)["--ps-profile-text"] : undefined,
      }}
    >
      <AlbumBackground
        config={scene?.albumBackground ?? config.albumBackground}
        url={albumUrl ?? backgroundArt.url}
        reduced={reduced}
      />
      <div className="ps-banner">{banner && <img src={banner} alt="Banner preview" />}</div>
      <div className="ps-avatar-wrap">
        <img
          className="ps-avatar"
          src={get(config.avatar) ?? account.avatar ?? "https://cdn.discordapp.com/embed/avatars/0.png"}
          alt={`${account.name}'s avatar`}
        />
        {decoration && (
          <TintSurface tint={config.decorationTint} className="ps-decoration-tint">
            <img className="ps-decoration" src={decoration} alt="" />
          </TintSurface>
        )}
        <span className="ps-online" aria-label="Online" />
      </div>
      <div className="ps-profile-body">
        <h3>{account.name}</h3>
        <StudioBadges badges={badges} />
        {config.nameplate && (
          <NameplatePreview
            item={items.find((item) => item.id === config.nameplate && item.kind === "nameplate")}
            reduced={reduced}
            name={account.name}
          />
        )}
        <p className="ps-profile-handle">Live preview of your profile</p>
        <div className="ps-profile-divider" />
        <p>
          {account.original?.bio ??
            (originalView
              ? "No public bio is available in the local Discord cache."
              : "Plugin users will see your approved appearance here.")}
        </p>
        {scene ? (
          <StudioBlocks
            config={config}
            surface={full ? "full" : "small"}
            scene={scene}
            reduced={reduced}
            artwork={songArt}
            liveMusic={liveMusic}
            liveArtwork={liveArt.url}
          />
        ) : !originalView ? (
          <MusicPreview
            style={{ ...config.music, preset: reduced ? "none" : config.music.preset }}
            song={config.favoriteSong}
          />
        ) : null}
        {config.audio && <p className="ps-sound-label">Profile sound selected · 3–5 sec</p>}
      </div>
      {scene ? (
        <SceneRenderer
          scene={scene}
          items={items}
          urls={urls}
          reduced={reduced}
          host={host}
          mode={performanceMode}
          forcedPhase={forcedPhase}
          selected={sceneEditor?.selected}
          lockedLayers={sceneEditor?.lockedLayers}
          onSelect={sceneEditor?.onSelect}
          onTransform={sceneEditor?.onTransform}
        />
      ) : (
        <EffectLayer
          effect={config.profileEffect}
          blend={config.effectBlend}
          tint={config.effectTint}
          url={config.effect?.source === "media" ? get(config.effect.id) : undefined}
          item={effectItem}
          reduced={reduced}
        />
      )}
      {scene && !scene.layers.length && effectItem && (
        <EffectLayer effect={config.profileEffect} item={effectItem} reduced={reduced} />
      )}
    </article>
  );
}
