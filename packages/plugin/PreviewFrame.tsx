import { React } from "@webpack/common";
/** Scale a real profile uniformly into the available preview area. */
export function PreviewFrame({ children, width = 300 }: { children: React.ReactNode; width?: number }) {
  const host = React.useRef<HTMLDivElement>(null),
    content = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ scale: 1, height: 480 });
  React.useLayoutEffect(() => {
    const measure = () => {
      if (!host.current || !content.current) return;
      const height = content.current.scrollHeight || 480;
      const scale = Math.min(
        1,
        (host.current.clientWidth || 280) / width,
        (host.current.clientHeight || 560) / height,
      );
      setSize((previous) =>
        previous.height === height && Math.abs(previous.scale - scale) < 0.001 ? previous : { scale, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host.current!);
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={host} className="ps-preview-frame">
      <div
        className="ps-preview-footprint"
        style={{ width: width * size.scale, height: size.height * size.scale }}
      >
        <div ref={content} className="ps-preview-scale" style={{ width, transform: `scale(${size.scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
/** Pin to the visible scrollport even when Discord inserts overflow-hidden wrappers. */
export function PinnedPreview({ children }: { children: React.ReactNode }) {
  const panel = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const layout = element.parentElement!;
    const clips: HTMLElement[] = [];
    for (let ancestor = layout.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowY)) clips.push(ancestor);
    }
    let frame = 0;
    let offset = 0;
    const set = (name: string, value: number) => {
      const next = `${Math.round(value * 100) / 100}px`;
      if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
    };
    const update = () => {
      frame = 0;
      let top = window.visualViewport?.offsetTop ?? 0;
      let bottom = top + (window.visualViewport?.height ?? window.innerHeight);
      for (const clip of clips) {
        const rect = clip.getBoundingClientRect();
        top = Math.max(top, rect.top + clip.clientTop);
        bottom = Math.min(bottom, rect.top + clip.clientTop + clip.clientHeight);
      }
      top += 12;
      // Undo our previous translation to recover the card's natural document position.
      const naturalTop = element.getBoundingClientRect().top - offset;
      set("--ps-preview-height", Math.max(120, bottom - Math.max(top, naturalTop) - 12));
      const limit = Math.max(0, layout.getBoundingClientRect().bottom - naturalTop - element.offsetHeight);
      offset = Math.min(limit, Math.max(0, top - naturalTop));
      set("--ps-preview-offset", offset);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (const target of [layout, element, ...clips]) observer?.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, []);
  return (
    <aside ref={panel} className="ps-preview-panel" aria-label="Live profile preview">
      {children}
    </aside>
  );
}
