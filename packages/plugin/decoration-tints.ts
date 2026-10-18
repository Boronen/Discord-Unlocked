import { tintMatrix } from "./tint.js";
/** Mark Studio-owned decoration images without changing the requested resource. */
export function markDecoration(source: string) {
  const url = new URL(source);
  if (!url.hash.startsWith("#ps-tint=")) url.hash = "ps-decoration";
  return url.toString();
}
/** Native decoration images keep their original animation, sizing and alpha. */
export class DecorationTints {
  private observer?: MutationObserver;
  private frame?: number;
  private definitions?: SVGSVGElement;
  private images = new Map<HTMLImageElement, { previous: string; priority: string; applied: string }>();
  start() {
    this.definitions = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.definitions.setAttribute("width", "0");
    this.definitions.setAttribute("height", "0");
    this.definitions.setAttribute("aria-hidden", "true");
    this.definitions.classList.add("ps-filter-definitions");
    document.body.append(this.definitions);
    this.observer = new MutationObserver(this.refresh);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "data-ps-music-tint"],
    });
    this.refresh();
  }
  refresh = () => {
    if (!this.observer || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.scan();
    });
  };
  private restore(image: HTMLImageElement) {
    const value = this.images.get(image);
    if (value && image.style.filter === value.applied)
      image.style.setProperty("filter", value.previous, value.priority);
    this.images.delete(image);
  }
  private scan() {
    const touched = new Set<HTMLImageElement>(),
      filters = new Set<string>();
    for (const image of document.querySelectorAll<HTMLImageElement>(
      'img[src*="ps-tint="], img[src$="#ps-decoration"], [data-ps-music-tint] img[class*="avatarDecoration"]',
    )) {
      const adaptive = image.closest<HTMLElement>("[data-ps-music-tint]")?.dataset.psMusicTint;
      const match =
        adaptive && /^[0-9a-f]{6}$/.test(adaptive)
          ? ["", adaptive, "80"]
          : image.src.match(/#ps-tint=([0-9a-f]{6})-(\d{1,3})$/);
      if (!match || Number(match[2]) > 100) continue;
      touched.add(image);
      const id = `ps-native-tint-${match[1]}-${match[2]}`;
      filters.add(id);
      if (!this.definitions?.querySelector(`#${id}`)) {
        const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
        filter.id = id;
        filter.setAttribute("color-interpolation-filters", "sRGB");
        const matrix = document.createElementNS(filter.namespaceURI, "feColorMatrix");
        matrix.setAttribute("type", "matrix");
        matrix.setAttribute(
          "values",
          tintMatrix({ color: `#${match[1]}`, intensity: Number(match[2]) / 100 }),
        );
        filter.append(matrix);
        this.definitions?.append(filter);
      }
      const applied = `url("#${id}")`;
      if (this.images.get(image)?.applied === applied) continue;
      this.restore(image);
      this.images.set(image, {
        previous: image.style.filter,
        priority: image.style.getPropertyPriority("filter"),
        applied,
      });
      image.style.filter = applied;
    }
    for (const image of this.images.keys()) if (!touched.has(image)) this.restore(image);
    for (const filter of [...(this.definitions?.children ?? [])])
      if (!filters.has(filter.id)) filter.remove();
  }
  stop() {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    for (const image of this.images.keys()) this.restore(image);
    this.definitions?.remove();
    this.definitions = undefined;
  }
}
