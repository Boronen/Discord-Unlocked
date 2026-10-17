import { React } from "@webpack/common";
import { albumArtworkCache } from "./artwork-cache.js";
import type { ProfileConfig } from "./model.js";
export interface AlbumArtwork {
  url?: string;
  state: "off" | "loading" | "activity" | "favorite" | "missing";
}
export function useAlbumArtwork(
  activity: string | undefined,
  favorite: string | null | undefined,
  enabled: boolean,
  loader?: (url: string) => Promise<string>,
): AlbumArtwork {
  const [value, setValue] = React.useState<AlbumArtwork>({ state: "off" });
  React.useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setValue({ state: "off" });
      return;
    }
    if (!loader || (!activity && !favorite)) {
      setValue({ state: "missing" });
      return;
    }
    setValue((previous) => ({ url: previous.url, state: "loading" }));
    void (async () => {
      for (const [url, state] of [
        [activity, "activity"],
        [favorite, "favorite"],
      ] as const) {
        if (!url || cancelled) continue;
        try {
          const data = await albumArtworkCache.load(url, async (source) => {
            const result = await loader(source);
            const image = new Image();
            image.src = result;
            await image.decode();
            if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 16_000_000)
              throw new Error("Artwork dimensions are unsupported.");
            return result;
          });
          if (!cancelled) setValue({ url: data, state });
          return;
        } catch {
          /* Fall back to the favorite cover without logging provider URLs. */
        }
      }
      if (!cancelled) setValue({ state: "missing" });
    })();
    return () => {
      cancelled = true;
    };
  }, [activity, favorite, enabled, loader]);
  return enabled ? value : { state: "off" };
}
export function AlbumBackground({
  config,
  url,
  reduced = false,
}: {
  config?: ProfileConfig["albumBackground"];
  url?: string;
  reduced?: boolean;
}) {
  const [previous, setPrevious] = React.useState<string>();
  const last = React.useRef(url);
  React.useEffect(() => {
    if (last.current !== url) {
      setPrevious(reduced ? undefined : last.current);
      last.current = url;
    }
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(undefined), 350);
    return () => clearTimeout(timer);
  }, [url, reduced, previous]);
  if (!config?.enabled || !url || !config.opacity) return null;
  return (
    <div className="ps-album-background" aria-hidden="true" style={{ opacity: config.opacity }}>
      {previous && !reduced && (
        <img
          className="ps-album-previous"
          key={previous}
          src={previous}
          alt=""
          style={{ filter: `blur(${config.blur}px)`, transform: `scale(${1 + config.blur / 100})` }}
        />
      )}
      <img
        key={url}
        className={reduced ? "" : "ps-album-current"}
        src={url}
        alt=""
        style={{ filter: `blur(${config.blur}px)`, transform: `scale(${1 + config.blur / 100})` }}
      />
    </div>
  );
}
export const albumStatus = (art: AlbumArtwork) =>
  ({
    off: "Album background is off.",
    loading: "Loading album artwork…",
    activity: "Using the current music activity artwork.",
    favorite: "Using your favorite song artwork.",
    missing: "No artwork available. Your original profile background is shown.",
  })[art.state];
