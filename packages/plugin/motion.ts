export type AnimationMode = "system" | "always" | "static";
export function reduceMotion(
  mode: AnimationMode | undefined,
  legacy: boolean,
  system: boolean,
  discord = false,
) {
  if (mode === "always") return false;
  return mode === "static" || legacy || system || discord;
}
