import type { CatalogItem } from "./model.js";

/** One observer and one cache subscription per visible account, not per avatar. */
export class NameplateRows {
  private observer?: MutationObserver;
  private frame?: number;
  private subscriptions = new Map<string, () => void>();
  private rows = new Map<HTMLElement, { key: string; media: HTMLElement; hadClass: boolean }>();
  constructor(
    private resolve: (id: string) => CatalogItem | undefined,
    private observe: (id: string, update: () => void) => () => void,
    private reduced: () => boolean,
  ) {}
  start() {
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
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
  private remove(row: HTMLElement) {
    const previous = this.rows.get(row);
    previous?.media.remove();
    if (previous && !previous.hadClass) row.classList.remove("ps-nameplate-host");
    this.rows.delete(row);
  }
  private scan() {
    const visible = new Set<string>(),
      touched = new Set<HTMLElement>();
    for (const image of document.querySelectorAll<HTMLImageElement>('img[src*="ps-user="]')) {
      let id: string | null;
      try {
        const url = new URL(image.src);
        id = url.searchParams.get("ps-user") ?? new URLSearchParams(url.hash.slice(1)).get("ps-user");
      } catch {
        continue;
      }
      if (!id || !/^\d{17,20}$/.test(id)) continue;
      const row = image.closest<HTMLElement>('[class*="member_"],[data-list-item-id^="private-channels-"]');
      if (!row) continue;
      visible.add(id);
      if (!this.subscriptions.has(id)) this.subscriptions.set(id, this.observe(id, this.refresh));
      const item = this.resolve(id);
      if (!item || item.kind !== "nameplate") continue;
      touched.add(row);
      const reduced = this.reduced(),
        key = `${id}:${item.id}:${item.imageUrl}:${item.staticUrl}:${reduced}`;
      if (this.rows.get(row)?.key === key) continue;
      this.remove(row);
      const media = document.createElement(reduced ? "img" : "video");
      media.className = "ps-row-nameplate";
      media.setAttribute("aria-hidden", "true");
      if (media instanceof HTMLVideoElement) {
        media.autoplay = true;
        media.loop = true;
        media.muted = true;
        media.playsInline = true;
        media.poster = item.staticUrl;
        media.src = item.imageUrl;
        media.addEventListener(
          "error",
          () => {
            // Static fallback stays local to this row; no cross-origin canvas or script.
            media.style.backgroundImage = `url("${item.staticUrl}")`;
            media.removeAttribute("src");
          },
          { once: true },
        );
      } else (media as HTMLImageElement).src = item.staticUrl;
      this.rows.set(row, { key, media, hadClass: row.classList.contains("ps-nameplate-host") });
      row.classList.add("ps-nameplate-host");
      row.prepend(media);
    }
    for (const row of this.rows.keys()) if (!touched.has(row)) this.remove(row);
    for (const [id, dispose] of this.subscriptions)
      if (!visible.has(id)) {
        dispose();
        this.subscriptions.delete(id);
      }
  }
  stop() {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.subscriptions.forEach((dispose) => dispose());
    this.subscriptions.clear();
    for (const row of this.rows.keys()) this.remove(row);
  }
}
