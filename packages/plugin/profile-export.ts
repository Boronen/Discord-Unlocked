import { ExportArtwork } from "./export-artwork.js";
import { cardExportSize, GIF_LIMITS } from "./export-limits.js";

/** Export only the owned card DOM, with styles and raster images made self-contained. */
export function createProfileCapture(
  element: HTMLElement,
  loadArtwork: (url: string) => Promise<string>,
  animated = false,
) {
  const { scale, width, height } = cardExportSize(element.offsetHeight, animated);
  const artwork = new ExportArtwork(loadArtwork, animated);
  return {
    width,
    height,
    close: () => artwork.close(),
    async snapshot(time = 0) {
      if (!element.isConnected) throw new Error("The profile preview was closed. Start a new export.");
      if (!height || height > (animated ? GIF_LIMITS.height : 4000) || width * height > 8_000_000)
        throw new Error("This profile is too tall to export.");
      const clone = element.cloneNode(true) as HTMLElement;
      const original = [element, ...element.querySelectorAll<HTMLElement>("*")],
        copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
      const imageCount = original.filter(
        (node) =>
          node instanceof HTMLImageElement ||
          node instanceof SVGImageElement ||
          node instanceof HTMLVideoElement,
      ).length;
      const imageBudget = animated ? Math.floor((8 * 1024 * 1024) / Math.max(1, imageCount)) : Infinity;
      for (let i = 0; i < original.length; i++) {
        const source = original[i]!,
          target = copies[i]!;
        const computed = getComputedStyle(source);
        for (const name of computed) {
          let value = computed.getPropertyValue(name);
          if (name === "filter") value = value.replace(/url\(["']?[^)#]+#([^"')]+)["']?\)/g, "url(#$1)");
          target.style.setProperty(name, value);
        }
        target.style.animation = "none";
        target.style.transition = "none";
        target.removeAttribute("tabindex");
        if (
          target instanceof HTMLImageElement ||
          target instanceof SVGImageElement ||
          target instanceof HTMLVideoElement
        ) {
          const src =
            source instanceof HTMLVideoElement
              ? source.poster
              : source instanceof SVGImageElement
                ? source.href.baseVal
                : (source as HTMLImageElement).currentSrc || (source as HTMLImageElement).src;
          const raster = await artwork.raster(src, time, imageBudget);
          if (target instanceof SVGImageElement) {
            target.setAttribute("href", raster);
            target.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
          } else if (target instanceof HTMLVideoElement) {
            const still = document.createElement("img");
            still.setAttribute("style", target.getAttribute("style") ?? "");
            still.className = target.className;
            still.src = raster;
            target.replaceWith(still);
          } else {
            target.src = raster;
            target.removeAttribute("srcset");
          }
        }
        const pseudos = [
          ...(source.matches(".ps-music,.ps-live-music") ? ["::before"] : []),
          ...(source.classList.contains("ps-effect-gradient") ||
          source.classList.contains("ps-effect-particles")
            ? ["::after"]
            : []),
        ];
        for (const kind of pseudos) {
          const pseudo = getComputedStyle(source, kind);
          if (pseudo.content !== "none") {
            const still = document.createElement("span");
            for (const property of pseudo)
              still.style.setProperty(property, pseudo.getPropertyValue(property));
            still.style.animation = "none";
            if (kind === "::before") target.prepend(still);
            else target.append(still);
          }
        }
      }
      clone
        .querySelectorAll("button,audio,video,.ps-layer-handle,.ps-sound-label,.ps-profile-handle")
        .forEach((node) => node.remove());
      clone.querySelectorAll("a").forEach((a) => a.removeAttribute("href"));
      clone.style.width = "300px";
      clone.style.maxWidth = "none";
      clone.style.transform = `scale(${scale})`;
      clone.style.transformOrigin = "top left";
      clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      const html = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${html}</foreignObject></svg>`;
      if (svg.length > (animated ? GIF_LIMITS.svgBytes : 16 * 1024 * 1024))
        throw new Error("The export contains too much image data. Try a simpler preset.");
      return { svg, width, height };
    },
  };
}
export async function profileSvg(element: HTMLElement, loadArtwork: (url: string) => Promise<string>) {
  const capture = createProfileCapture(element, loadArtwork);
  try {
    return await capture.snapshot();
  } finally {
    capture.close();
  }
}
