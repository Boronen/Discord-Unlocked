import { React } from "@webpack/common";
import type { CatalogItem, MusicStyle, ProfileConfig } from "./model.js";
import {
  resolveScene,
  type SceneConfig,
  type SceneLayer,
  type Surface,
  type StudioBadge,
} from "./studio-model.js";
import { TintSurface } from "./TintSurface.js";
import { FavoriteSongCard } from "./FavoriteSong.js";
import { artworkPalette } from "./palette.js";
import { SteamGameCard } from "./SteamGameCard.js";
import { LiveMusicCard } from "./music-presentation.js";
import type { LiveMusic } from "./music-surface.js";
function ArtworkSong(props: React.ComponentProps<typeof FavoriteSongCard>) {
  const [palette, setPalette] = React.useState<ReturnType<typeof artworkPalette>>(null);
  React.useEffect(() => {
    let canceled = false;
    setPalette(null);
    if (props.artwork && props.style.mode === "artwork")
      void (async () => {
        try {
          const img = new Image();
          img.src = props.artwork!;
          await img.decode();
          if (img.naturalWidth * img.naturalHeight > 16_000_000) return;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 32, 32);
          const value = artworkPalette(ctx.getImageData(0, 0, 32, 32).data);
          if (!canceled) setPalette(value);
        } catch {}
      })();
    return () => {
      canceled = true;
    };
  }, [props.artwork, props.style.mode]);
  return (
    <FavoriteSongCard
      {...props}
      style={
        palette ? { ...props.style, background: palette.background, color: palette.accent } : props.style
      }
    />
  );
}
export type PerformanceMode = "auto" | "quality" | "low";
export function phaseVisible(layer: SceneLayer, elapsed: number, hover: boolean) {
  return layer.phase === "intro"
    ? elapsed >= layer.delayMs && elapsed < layer.delayMs + layer.durationMs
    : layer.phase === "hover"
      ? hover
      : elapsed >= layer.delayMs;
}
export function useSceneMotion(
  host: React.RefObject<HTMLElement | null>,
  reduced: boolean,
  mode: PerformanceMode,
  sessionKey: string,
) {
  const [elapsed, setElapsed] = React.useState(0),
    [hover, setHover] = React.useState(false),
    [visible, setVisible] = React.useState(true),
    [foreground, setForeground] = React.useState(!document.hidden),
    [level, setLevel] = React.useState(mode === "low" ? 2 : 0);
  React.useEffect(() => {
    const update = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const clock = React.useRef({ start: 0, pausedAt: 0, offset: 0 });
  React.useEffect(() => {
    clock.current = { start: performance.now(), pausedAt: 0, offset: 0 };
    setElapsed(0);
  }, [sessionKey]);
  React.useEffect(() => {
    const element = host.current;
    if (!element) return;
    const enter = () => setHover(true),
      leave = () => setHover(false),
      focus = () => setHover(true),
      blur = (e: FocusEvent) => {
        if (!element.contains(e.relatedTarget as Node)) setHover(false);
      };
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", blur);
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => setVisible(entries[0]?.isIntersecting ?? false));
    io?.observe(element);
    return () => {
      io?.disconnect();
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", blur);
    };
  }, [host]);
  React.useEffect(() => {
    setLevel(mode === "low" ? 2 : 0);
  }, [mode, sessionKey]);
  React.useEffect(() => {
    if (reduced || !visible || !foreground || level >= 2) {
      if (!clock.current.pausedAt) clock.current.pausedAt = performance.now();
      return;
    }
    if (clock.current.pausedAt) {
      clock.current.offset += performance.now() - clock.current.pausedAt;
      clock.current.pausedAt = 0;
    }
    let frame = 0,
      last = performance.now(),
      lastRender = 0,
      samples = 0,
      slow = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (mode === "auto") {
        samples++;
        if (delta > 33) slow++;
        if (samples >= 180) {
          if (slow > samples * 0.35) setLevel((v) => Math.min(2, v + 1));
          samples = slow = 0;
        }
      }
      if (now - lastRender >= 50) {
        setElapsed(Math.max(0, now - clock.current.start - clock.current.offset));
        lastRender = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, foreground, reduced, mode, sessionKey, level]);
  return { elapsed, hover, visible, level, static: reduced || level >= 2 || !visible || !foreground };
}
function CatalogVisual({
  item,
  elapsed,
  staticMode,
}: {
  item: CatalogItem;
  elapsed: number;
  staticMode: boolean;
}) {
  if (staticMode || !item.layers.length)
    return (
      <img
        className="ps-scene-image ps-scene-catalog-still"
        alt=""
        src={staticMode ? item.staticUrl : item.imageUrl}
      />
    );
  return (
    <svg className="ps-scene-catalog" viewBox="0 0 450 880" preserveAspectRatio="none" aria-hidden="true">
      {item.layers.map((l, i) => {
        const t = elapsed - l.start,
          cycle = l.loop ? Math.floor(Math.max(0, t) / (l.duration + l.loopDelay)) : 0;
        const show = t >= 0 && (l.loop ? t % (l.duration + l.loopDelay) < l.duration : t < l.duration);
        return show ? (
          <image
            key={`${i}:${cycle}`}
            href={l.src}
            x={l.x}
            y={l.y}
            width={l.width}
            height={l.height}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null;
      })}
    </svg>
  );
}
export function SceneRenderer({
  scene,
  items,
  urls,
  reduced = false,
  mode = "auto",
  sessionKey = "preview",
  host: outside,
  forcedPhase,
  onSelect,
  selected,
  lockedLayers,
  onTransform,
}: {
  scene: SceneConfig;
  items: CatalogItem[];
  urls: Record<string, string>;
  reduced?: boolean;
  mode?: PerformanceMode;
  sessionKey?: string;
  host?: React.RefObject<HTMLElement | null>;
  forcedPhase?: SceneLayer["phase"];
  onSelect?: (id: string) => void;
  selected?: string;
  lockedLayers?: readonly string[];
  onTransform?: (id: string, transform: SceneLayer["transform"]) => void;
}) {
  const own = React.useRef<HTMLDivElement>(null);
  const motion = useSceneMotion(outside ?? own, reduced || !scene.layers.length, mode, sessionKey);
  const point = React.useRef({ x: 0, y: 0 });
  React.useEffect(() => {
    const element = (outside ?? own).current;
    if (!element || !scene.parallax.enabled || motion.static || motion.level > 0) return;
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      point.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
      own.current?.style.setProperty("--ps-depth-x", `${point.current.x * 16 * scene.parallax.amount}px`);
      own.current?.style.setProperty("--ps-depth-y", `${point.current.y * 16 * scene.parallax.amount}px`);
      own.current?.style.setProperty(
        "--ps-depth-rotation",
        `${point.current.x * 6 * scene.parallax.amount}deg`,
      );
    };
    const reset = () => {
      own.current?.style.setProperty("--ps-depth-x", "0px");
      own.current?.style.setProperty("--ps-depth-y", "0px");
      own.current?.style.setProperty("--ps-depth-rotation", "0deg");
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", reset);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", reset);
      reset();
    };
  }, [scene.parallax.enabled, scene.parallax.amount, motion.static, motion.level, outside]);
  const drag = React.useRef<{
    id: string;
    startX: number;
    startY: number;
    rect: DOMRect;
    initial: SceneLayer["transform"];
    resize: boolean;
  } | null>(null);
  const start = (event: React.PointerEvent, id: string, resize = false) => {
    if (!onTransform) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = scene.layers.find((l) => l.id === id)!;
    const rect = own.current!.getBoundingClientRect();
    drag.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      initial: { ...layer.transform },
      resize,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect?.(id);
  };
  return (
    <div
      ref={own}
      className={`ps-scene${onTransform ? " ps-scene-editable" : ""}${motion.static ? " ps-scene-static" : ""}`}
      aria-hidden={!onTransform}
    >
      {scene.layers.map((layer, index) => {
        const isSelected =
          layer.id === (scene.layers.find((l) => l.id === selected)?.id ?? scene.layers[0]?.id);
        const editable = !!onTransform && isSelected && !lockedLayers?.includes(layer.id);
        const visible = forcedPhase
          ? layer.phase === forcedPhase
          : onTransform && isSelected
            ? true
            : motion.static
              ? layer.phase === "idle"
              : phaseVisible(layer, motion.elapsed, motion.hover);
        if (!visible) return null;
        if (motion.level > 0 && layer.source === "texture" && !motion.static) return null;
        const item = layer.source === "discord" ? items.find((i) => i.id === layer.assetId) : undefined;
        const style = {
          transform: `translate(${layer.transform.x * 100}%,${layer.transform.y * 100}%) rotate(${layer.transform.rotation}deg) scale(${layer.transform.scale})`,
          opacity: layer.transform.opacity,
          zIndex: (layer.plane === "front" ? 20 : 0) + index,
          "--ps-effect-color": layer.color,
          "--ps-intensity": 1,
          "--ps-duration": "5s",
          mixBlendMode: layer.blend,
        } as React.CSSProperties;
        return (
          <div
            className={`ps-scene-layer ${layer.source === "preset" ? `ps-effect-${motion.static ? "none" : layer.preset}` : ""}`}
            key={layer.id}
            style={style}
          >
            <div className="ps-scene-depth">
              <TintSurface tint={layer.tint}>
                {layer.source === "media" && layer.assetId && urls[layer.assetId] && (
                  <img
                    className="ps-scene-image"
                    src={(motion.static ? urls[`${layer.assetId}:static`] : undefined) ?? urls[layer.assetId]}
                    alt=""
                  />
                )}
                {item && (
                  <CatalogVisual
                    item={item}
                    elapsed={Math.max(0, motion.elapsed - layer.delayMs)}
                    staticMode={motion.static}
                  />
                )}
                {layer.source === "texture" && (
                  <div className={`ps-texture ps-texture-${layer.texture}`} style={{ color: layer.color }}>
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </TintSurface>
            </div>
            {editable && onTransform && (
              <button
                type="button"
                onClick={() => onSelect?.(layer.id)}
                className={`ps-layer-handle${selected === layer.id ? " ps-layer-selected" : ""}`}
                aria-label={`Move layer ${index + 1}`}
                onPointerDown={(e) => start(e, layer.id)}
                onPointerMove={(event) => {
                  const d = drag.current;
                  if (!d || d.id !== layer.id) return;
                  const dx = (event.clientX - d.startX) / d.rect.width,
                    dy = (event.clientY - d.startY) / d.rect.height;
                  onTransform(d.id, {
                    ...d.initial,
                    ...(d.resize
                      ? { scale: Math.max(0.1, Math.min(3, d.initial.scale + dx * 2)) }
                      : {
                          x: Math.max(-1, Math.min(1, d.initial.x + dx)),
                          y: Math.max(-1, Math.min(1, d.initial.y + dy)),
                        }),
                  });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  onTransform(layer.id, {
                    ...layer.transform,
                    x: Math.max(
                      -1,
                      Math.min(
                        1,
                        layer.transform.x +
                          (event.key === "ArrowLeft" ? -0.01 : event.key === "ArrowRight" ? 0.01 : 0),
                      ),
                    ),
                    y: Math.max(
                      -1,
                      Math.min(
                        1,
                        layer.transform.y +
                          (event.key === "ArrowUp" ? -0.01 : event.key === "ArrowDown" ? 0.01 : 0),
                      ),
                    ),
                  });
                }}
              >
                <span className="ps-layer-grip" onPointerDown={(e) => start(e, layer.id, true)}>
                  Resize
                </span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
export const BADGE_ICONS: Record<string, string> = {
  star: "★",
  heart: "♥",
  flask: "⚗",
  crown: "♛",
  leaf: "❧",
  fire: "♨",
};
export function StudioBadges({ badges = [] }: { badges?: StudioBadge[] }) {
  return badges.length ? (
    <div className="ps-studio-badges" aria-label="Profile Studio badges">
      {badges.slice(0, 3).map((b) => (
        <span key={b.id} title={`Studio · ${b.name}: ${b.description}`}>
          {BADGE_ICONS[b.icon] ?? "★"} {b.name}
        </span>
      ))}
      {badges.length > 3 && (
        <details>
          <summary>+{badges.length - 3}</summary>
          {badges.slice(3).map((b) => (
            <p key={b.id}>
              {b.name} · {b.description}
            </p>
          ))}
        </details>
      )}
    </div>
  ) : null;
}
export function StudioBlocks({
  config,
  surface,
  scene: provided,
  reduced = false,
  artwork = {},
  onPlay,
  onClose,
  muted = false,
  liveMusic,
  liveArtwork,
}: {
  config: ProfileConfig;
  surface: Surface;
  scene?: SceneConfig;
  reduced?: boolean;
  artwork?: Record<string, string>;
  onPlay?: (url: string) => Promise<unknown>;
  onClose?: () => void;
  muted?: boolean;
  liveMusic?: LiveMusic;
  liveArtwork?: string;
}) {
  const scene = provided ?? resolveScene(config, surface);
  const songs = config.studio?.songs ?? (config.favoriteSong ? [config.favoriteSong] : []);
  return (
    <div className="ps-studio-blocks">
      {scene.blocks
        .filter((b) => b.visible)
        .slice(0, surface === "small" ? 3 : 8)
        .map((block) => (
          <section
            key={block.id}
            className={`ps-studio-block ps-block-${block.kind}`}
            aria-label={block.title || block.kind}
          >
            {block.title && (
              <h3>
                {block.kind === "music" &&
                config.musicPriority &&
                liveMusic &&
                block.title === "Favorite songs"
                  ? "Now playing"
                  : block.title}
              </h3>
            )}
            {block.kind === "music" ? (
              config.musicPriority && liveMusic ? (
                <LiveMusicCard
                  track={liveMusic}
                  artwork={liveArtwork}
                  style={{ ...config.music, mode: "artwork" }}
                  reduced={reduced}
                />
              ) : songs.length ? (
                songs.map((song) => (
                  <ArtworkSong
                    key={song.url}
                    song={song}
                    style={config.music}
                    reduced={reduced}
                    muted={muted}
                    artwork={song.artwork ? artwork[song.artwork] : undefined}
                    onPlay={onPlay ? () => onPlay(song.url) : undefined}
                    onClose={onClose}
                  />
                ))
              ) : (
                <p>No favorite songs selected.</p>
              )
            ) : block.kind === "games" && block.links[0]?.url ? (
              <>
                <SteamGameCard url={block.links[0].url} reduced={reduced} />
                {block.text && <p>{block.text}</p>}
              </>
            ) : (
              <>
                {block.text && <p>{block.text}</p>}
                {block.links.map((link, index) => (
                  <a key={index} href={link.url} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </>
            )}
          </section>
        ))}
    </div>
  );
}
