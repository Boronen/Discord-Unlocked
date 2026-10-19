import { React } from "@webpack/common";
import type { BannerLayer } from "./studio-model.js";
import { TintSurface } from "./TintSurface.js";
import { artworkTint } from "./palette.js";

/** Header-only image composition shared by preview, native profile and card export. */
export function BannerLayers({
  layers,
  urls,
  palette,
  background,
  reduced = false,
}: {
  layers: readonly BannerLayer[];
  urls: Record<string, string>;
  palette?: readonly string[];
  background?: string;
  reduced?: boolean;
}) {
  return (
    <div className="ps-banner-layers" aria-hidden="true" style={{ backgroundColor: background }}>
      {layers.map((layer, index) => {
        const url = layer.assetId
          ? ((reduced ? urls[`${layer.assetId}:static`] : undefined) ?? urls[layer.assetId])
          : undefined;
        if (!url) return null;
        return (
          <div
            key={layer.id}
            className="ps-banner-layer"
            style={{
              transform: `translate(${layer.transform.x * 100}%,${layer.transform.y * 100}%) rotate(${layer.transform.rotation}deg) scale(${layer.transform.scale})`,
              opacity: layer.transform.opacity,
            }}
          >
            <TintSurface
              tint={(layer.followMusicColors ? artworkTint(palette, index) : undefined) ?? layer.tint}
            >
              <img src={url} alt="" />
            </TintSurface>
          </div>
        );
      })}
    </div>
  );
}

/** Discord may replace its banner node while an already-open profile refreshes. */
export function useBannerHost(root: HTMLElement | null, enabled: boolean) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (!root || !enabled) {
      setHost(null);
      return;
    }
    let current: HTMLElement | null = null;
    let restore = () => {};
    const find = () => {
      const node = root.querySelector('[class*="banner_"]');
      const next = node instanceof HTMLElement ? node : null;
      if (next === current) return;
      restore();
      current = next;
      if (next) {
        const hadClass = next.classList.contains("ps-banner-host");
        const position = next.style.getPropertyValue("position"),
          priority = next.style.getPropertyPriority("position");
        const positioned = getComputedStyle(next).position === "static";
        if (positioned) next.style.position = "relative";
        next.classList.add("ps-banner-host");
        restore = () => {
          if (!hadClass) next.classList.remove("ps-banner-host");
          if (positioned) {
            if (position) next.style.setProperty("position", position, priority);
            else next.style.removeProperty("position");
          }
        };
      } else restore = () => {};
      setHost(next);
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      restore();
    };
  }, [root, enabled]);
  return enabled ? host : null;
}
