import type { CatalogItem } from "./model.js";
import type { SceneLayer } from "./studio-model.js";

const frames = new Set<(now: number) => void>();
let frame: number | undefined;
/** Auto quality sampling shares one native frame request across mounted scenes. */
export function observeFrames(callback: (now: number) => void) {
  const tick = (now: number) => {
    frame = undefined;
    for (const listener of [...frames]) listener(now);
    if (frames.size && frame === undefined) frame = requestAnimationFrame(tick);
  };
  frames.add(callback);
  if (frame === undefined) frame = requestAnimationFrame(tick);
  return () => {
    frames.delete(callback);
    if (!frames.size && frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
}

const foreground = new Set<(visible: boolean) => void>();
const onVisibility = () => foreground.forEach((fn) => fn(!document.hidden));
export function observeForeground(callback: (visible: boolean) => void) {
  if (!foreground.size) document.addEventListener("visibilitychange", onVisibility);
  foreground.add(callback);
  callback(!document.hidden);
  return () => {
    foreground.delete(callback);
    if (!foreground.size) document.removeEventListener("visibilitychange", onVisibility);
  };
}

const observed = new Map<Element, Set<(visible: boolean) => void>>();
let observer: IntersectionObserver | undefined;
export function observeScene(element: Element, callback: (visible: boolean) => void) {
  if (typeof IntersectionObserver === "undefined") return () => {};
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) observed.get(entry.target)?.forEach((fn) => fn(entry.isIntersecting));
  });
  let listeners = observed.get(element);
  if (!listeners) {
    listeners = new Set();
    observed.set(element, listeners);
    observer.observe(element);
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (!listeners.size) {
      observed.delete(element);
      observer?.unobserve(element);
    }
    if (!observed.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

/** Next change to scene membership or an SVG image's visibility/animation cycle.
 * CSS and native animated images advance themselves; they need no React clock.
 */
export function nextSceneBoundary(
  layers: readonly SceneLayer[],
  items: readonly CatalogItem[],
  elapsed: number,
  hover: boolean,
  forcedPhase?: SceneLayer["phase"],
  selected?: string,
) {
  let next = Infinity;
  const consider = (time: number) => {
    if (time > elapsed) next = Math.min(next, time);
  };
  for (const layer of layers) {
    const forced = forcedPhase ? layer.phase === forcedPhase : layer.id === selected;
    if (forcedPhase && !forced) continue;
    if (!forced) {
      if (layer.phase !== "hover") consider(layer.delayMs);
      if (layer.phase === "intro") {
        consider(layer.delayMs + layer.durationMs);
        if (elapsed >= layer.delayMs + layer.durationMs) continue;
      }
      if (layer.phase === "hover" && !hover) continue;
    }
    if (layer.source !== "discord") continue;
    const item = items.find((i) => i.id === layer.assetId);
    for (const animation of item?.layers ?? []) {
      const start = layer.delayMs + animation.start;
      consider(start);
      const period = animation.duration + animation.loopDelay;
      if (animation.loop && period > 0 && elapsed >= start) {
        const cycle = Math.floor((elapsed - start) / period);
        consider(start + cycle * period + animation.duration);
        consider(start + (cycle + 1) * period);
      } else consider(start + animation.duration);
    }
  }
  return next;
}
