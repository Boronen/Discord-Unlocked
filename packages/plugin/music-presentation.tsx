import { React } from "@webpack/common";
import { artworkPalette } from "./palette.js";
import type { LiveMusic } from "./music-surface.js";
import type { MusicStyle } from "./model.js";
import { effectStyle } from "./visuals.js";
import { textOn } from "./palette.js";

export function useArtworkPalette(url?: string, enabled = true) {
  const [value, setValue] = React.useState<{
    url: string;
    palette: ReturnType<typeof artworkPalette>;
  } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!url || !enabled) return;
    void (async () => {
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 16_000_000) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 32, 32);
        const palette = artworkPalette(context.getImageData(0, 0, 32, 32).data);
        if (!cancelled) setValue({ url, palette });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);
  return enabled && value && value.url === url ? value.palette : null;
}
export function priorityColors(
  palette: ReturnType<typeof artworkPalette>,
  enabled: boolean,
): [string, string] | undefined {
  return enabled && palette ? [palette.background, palette.accent] : undefined;
}
export function LiveMusicCard({
  track,
  artwork,
  style,
  reduced,
}: {
  track: LiveMusic;
  artwork?: string;
  style: MusicStyle;
  reduced: boolean;
}) {
  const [now, setNow] = React.useState(Date.now());
  const palette = useArtworkPalette(artwork, style.mode === "artwork");
  const background = palette?.background ?? style.background;
  React.useEffect(() => {
    setNow(Date.now());
    if (!track.start || !track.end) return;
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [track.start, track.end]);
  const elapsed = Math.max(
    0,
    Math.min((track.end ?? now) - (track.start ?? now), now - (track.start ?? now)),
  );
  const duration = track.start && track.end ? track.end - track.start : 0;
  const clock = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  return (
    <section
      className={`ps-favorite ps-music ps-effect-${reduced ? "none" : style.preset}`}
      aria-label="Now playing"
      style={{
        ...effectStyle({ ...style, color: palette?.accent ?? style.color }),
        backgroundColor: background,
        color: textOn(background),
      }}
    >
      <small>Listening to {track.provider}</small>
      <div className="ps-track">
        {artwork ? (
          <img className="ps-artwork" src={artwork} alt="" />
        ) : (
          <div className="ps-artwork" aria-hidden="true">
            ♪
          </div>
        )}
        <div className="ps-favorite-text">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
      </div>
      {!!duration && (
        <>
          <progress aria-label="Track progress" value={elapsed} max={duration} />
          <small>
            {clock(elapsed)} / {clock(duration)}
          </small>
        </>
      )}
      {track.url && (
        <a href={track.url} target="_blank" rel="noreferrer">
          Open song
        </a>
      )}
      <small>Current Discord activity. No audio starts automatically.</small>
    </section>
  );
}
