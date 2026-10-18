import { ExportArtwork } from "./export-artwork.js";
import { cardExportSize, GIF_LIMITS } from "./export-limits.js";

/** Export only the owned card DOM, with styles and raster images made self-contained. */
export function createProfileCapture(
  element: HTMLElement,
  loadArtwork: (url: string) => Promise<string>,
  animated = false,
) {
  const sourceWidth = element.offsetWidth || 300;
  const excluded = "[data-ps-export-exclude],.ps-card-export,.ps-viewer-controls,.ps-live-controls";
  const omittedHeight = [...element.querySelectorAll<HTMLElement>(excluded)]
    .filter((node) => !node.parentElement?.closest(excluded))
    .reduce((sum, node) => sum + node.offsetHeight, 0);
  const scrollers = [...element.querySelectorAll<HTMLElement>("*")].filter(
    (node) =>
      node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY),
  );
  const outerScrollers = scrollers.filter(
    (node) => !scrollers.some((other) => other !== node && other.contains(node)),
  );
  const sourceHeight = Math.max(
    1,
    element.offsetHeight +
      outerScrollers.reduce((sum, node) => sum + node.scrollHeight - node.clientHeight, 0) -
      omittedHeight,
  );
  const { scale, width, height } = cardExportSize(sourceHeight, animated, sourceWidth);
  const artwork = new ExportArtwork(loadArtwork, animated);
  const animationOrigins = new Map<Animation, number>();
  return {
    width,
    height,
    close: () => {
      artwork.close();
      animationOrigins.clear();
    },
    async snapshot(time = 0) {
      if (!element.isConnected) throw new Error("The profile preview was closed. Start a new export.");
      if (!height || height > (animated ? GIF_LIMITS.height : 4000) || width * height > 8_000_000)
        throw new Error("This profile is too tall to export.");
      const animations = (element.getAnimations?.({ subtree: true }) ?? []).map((animation) => {
        const currentTime = animation.currentTime;
        const state = animation.playState;
        const origin = animationOrigins.get(animation) ?? Number(currentTime ?? 0);
        animationOrigins.set(animation, origin);
        animation.pause();
        animation.currentTime = origin + (animated ? time : 0);
        return { animation, currentTime, state };
      });
      try {
        const clone = element.cloneNode(true) as HTMLElement;
        const referencedDefinitions = new Set<string>();
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
            // Resolved paint properties are sufficient. Discord's inherited
            // custom-property catalogue otherwise repeats on every element.
            if (name.startsWith("--")) continue;
            let value = computed.getPropertyValue(name);
            for (const match of value.matchAll(/url\(["']?[^)#]*#([^"')]+)["']?\)/g))
              referencedDefinitions.add(match[1]!);
            if (name === "filter") value = value.replace(/url\(["']?[^)#]+#([^"')]+)["']?\)/g, "url(#$1)");
            target.style.setProperty(name, value);
          }
          if (scrollers.includes(source)) {
            target.style.height = `${source.scrollHeight}px`;
            target.style.maxHeight = "none";
            target.style.overflow = "visible";
            target.style.overflowY = "visible";
            target.style.blockSize = "auto";
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
          // Background images (including Discord's transparent banner) are not
          // DOM image nodes, but must be self-contained in the isolated paint.
          for (const property of ["background-image", "mask-image", "-webkit-mask-image"]) {
            let value = computed.getPropertyValue(property);
            for (const match of [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)]) {
              if (match[1]!.startsWith("#")) continue;
              const raster = await artwork.raster(match[1]!, time, imageBudget);
              value = value.replace(match[0], `url("${raster}")`);
            }
            if (value) target.style.setProperty(property, value);
          }
          const pseudos = ["::before", "::after"];
          for (const kind of pseudos) {
            const pseudo = getComputedStyle(source, kind);
            if (pseudo.content && pseudo.content !== "none" && pseudo.content !== "normal") {
              const still = document.createElement("span");
              for (const property of pseudo)
                if (!property.startsWith("--"))
                  still.style.setProperty(property, pseudo.getPropertyValue(property));
              still.style.animation = "none";
              if (kind === "::before") target.prepend(still);
              else target.append(still);
            }
          }
        }
        clone
          .querySelectorAll(`${excluded},audio,video,script,iframe,object,embed,.ps-layer-handle`)
          .forEach((node) => node.remove());
        clone.querySelectorAll("a").forEach((a) => a.removeAttribute("href"));
        clone.style.width = `${sourceWidth}px`;
        clone.style.inlineSize = `${sourceWidth}px`;
        clone.style.height = `${sourceHeight}px`;
        clone.style.blockSize = `${sourceHeight}px`;
        clone.style.boxSizing = "border-box";
        clone.style.maxHeight = "none";
        clone.style.margin = "0";
        clone.style.position = "relative";
        clone.style.left = "auto";
        clone.style.top = "auto";
        clone.style.maxWidth = "none";
        clone.style.transform = "none";
        for (const overlay of clone.querySelectorAll<HTMLElement>(
          ".ps-scene,.ps-profile-overlay,.ps-album-background",
        )) {
          overlay.style.height = "100%";
          overlay.style.blockSize = "100%";
        }
        clone.style.transformOrigin = "top left";
        // Native decoration filters live outside the profile portal. Carry only
        // referenced SVG definitions into the isolated card, never surrounding DOM.
        const definitions = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        definitions.setAttribute("width", "0");
        definitions.setAttribute("height", "0");
        definitions.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
        for (const id of referencedDefinitions) {
          const original = document.getElementById(id);
          if (
            original?.namespaceURI === definitions.namespaceURI &&
            ![...clone.querySelectorAll("[id]")].some((node) => node.id === id)
          )
            definitions.append(original.cloneNode(true));
        }
        if (definitions.children.length) clone.prepend(definitions);
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `width:${sourceWidth}px;height:${sourceHeight}px;transform:scale(${scale});transform-origin:top left;color-scheme:${getComputedStyle(element).colorScheme || "dark"}`;
        wrapper.append(clone);
        const html = new XMLSerializer().serializeToString(wrapper);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${html}</foreignObject></svg>`;
        if (svg.length > (animated ? GIF_LIMITS.svgBytes : 16 * 1024 * 1024))
          throw new Error("The export contains too much image data. Try a simpler preset.");
        return { svg, width, height };
      } finally {
        for (const { animation, currentTime, state } of animations) {
          animation.currentTime = currentTime;
          if (state === "running") animation.play();
          else if (state === "finished") animation.finish();
          else if (state === "idle") animation.cancel();
        }
      }
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
