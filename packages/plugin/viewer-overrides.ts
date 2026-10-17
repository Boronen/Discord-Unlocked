import type { ViewerOverride } from "./studio-model.js";
export function readViewerOverride(value: string, viewer: string, target: string): ViewerOverride {
  try {
    return JSON.parse(value)?.[viewer]?.[target] ?? {};
  } catch {
    return {};
  }
}
export function writeViewerOverride(value: string, viewer: string, target: string, override: ViewerOverride) {
  let saved: Record<string, Record<string, ViewerOverride>> = {};
  try {
    saved = JSON.parse(value);
  } catch {}
  saved[viewer] = { ...saved[viewer], [target]: override };
  return JSON.stringify(saved);
}
