type Candidate = { element: Element; id: string };
export function hoverProfileTarget(target: EventTarget | null): Candidate | null {
  if (
    !(target instanceof Element) ||
    target.closest('.ps-root,.ps-profile,.ps-host,dialog,[role="dialog"],[class*="userProfileOuter"]')
  )
    return null;
  const row = target.closest('[class*="member_"],[data-list-item-id^="private-channels-"]');
  const area = row ?? target.closest('[class*="avatar_"],[id^="message-username-"]');
  const image =
    target instanceof HTMLImageElement
      ? target
      : area?.querySelector<HTMLImageElement>('img[src*="ps-user="],img[src*="/avatars/"]');
  let id: string | null = null;
  if (image)
    try {
      const source = new URL(image.src);
      id =
        source.searchParams.get("ps-user") ??
        new URLSearchParams(source.hash.slice(1)).get("ps-user") ??
        /^\/avatars\/(\d{17,20})\//.exec(source.pathname)?.[1] ??
        null;
    } catch {}
  if (!id && area && !row) {
    const message = area.closest('[class*="message_"]');
    const avatar = message?.querySelector<HTMLImageElement>('img[src*="ps-user="],img[src*="/avatars/"]');
    if (avatar) return hoverProfileTarget(avatar);
  }
  return id && /^\d{17,20}$/.test(id) && image ? { id, element: row ?? area ?? image } : null;
}

/** One delegated timer. Leaving, clicking, scrolling, Escape and plugin teardown cancel it. */
export class HoverProfiles {
  private timer?: ReturnType<typeof setTimeout>;
  private candidate: Candidate | null = null;
  private started = false;
  constructor(
    private enabled: () => boolean,
    private delay: () => number,
    private open: (id: string, anchor: Element) => Promise<unknown> | void,
  ) {}
  cancel = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
  };
  private enter = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.buttons || !this.enabled()) {
      this.cancel();
      return;
    }
    const next = hoverProfileTarget(event.target);
    if (next?.element === this.candidate?.element && next?.id === this.candidate?.id) return;
    this.cancel();
    this.candidate = next;
    if (!next) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        const current = hoverProfileTarget(next.element);
        if (
          !this.started ||
          !this.enabled() ||
          document.hidden ||
          !document.hasFocus() ||
          !next.element.isConnected ||
          current?.id !== next.id ||
          document.querySelector('dialog[open],[role="dialog"]')
        )
          return;
        void Promise.resolve()
          .then(() => {
            if (
              this.started &&
              this.enabled() &&
              this.candidate?.element === next.element &&
              this.candidate?.id === next.id
            )
              return this.open(next.id, next.element);
          })
          .catch(() => {});
      },
      Number.isFinite(this.delay()) ? Math.max(3000, Math.min(5000, this.delay())) : 4000,
    );
  };
  private leave = (event: PointerEvent) => {
    const next = hoverProfileTarget(event.relatedTarget);
    if (next?.element === this.candidate?.element && next?.id === this.candidate?.id) return;
    this.cancel();
    this.candidate = null;
  };
  private key = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.cancel();
  };
  start() {
    if (this.started) return;
    this.started = true;
    document.addEventListener("pointerover", this.enter, true);
    document.addEventListener("pointerout", this.leave, true);
    document.addEventListener("pointerdown", this.cancel, true);
    document.addEventListener("scroll", this.cancel, true);
    document.addEventListener("keydown", this.key, true);
    document.addEventListener("visibilitychange", this.cancel);
    window.addEventListener("blur", this.cancel);
  }
  stop() {
    this.started = false;
    this.cancel();
    this.candidate = null;
    document.removeEventListener("pointerover", this.enter, true);
    document.removeEventListener("pointerout", this.leave, true);
    document.removeEventListener("pointerdown", this.cancel, true);
    document.removeEventListener("scroll", this.cancel, true);
    document.removeEventListener("keydown", this.key, true);
    document.removeEventListener("visibilitychange", this.cancel);
    window.removeEventListener("blur", this.cancel);
  }
}
