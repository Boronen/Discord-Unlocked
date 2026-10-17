export const GIF_LIMITS = {
  width: 450,
  height: 8192,
  pixels: 2_000_000,
  frames: 32,
  duration: 8000,
  bytes: 128 * 1024 * 1024,
  svgBytes: 64 * 1024 * 1024,
};
/** Fit the whole card, including every panel, instead of rejecting a tall profile. */
export function cardExportSize(sourceHeight: number, animated: boolean) {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0)
    throw new Error("The profile preview has no size.");
  if (!animated) return { width: 900, height: Math.ceil(sourceHeight * 3), scale: 3 };
  const ratio = Math.min(
    1.5,
    GIF_LIMITS.height / sourceHeight,
    Math.sqrt(GIF_LIMITS.pixels / (300 * sourceHeight)),
  );
  let width = Math.max(1, Math.floor(300 * ratio));
  let height = Math.ceil((sourceHeight * width) / 300);
  while (width > 1 && width * height > GIF_LIMITS.pixels) height = Math.ceil((sourceHeight * --width) / 300);
  return { width, height, scale: width / 300 };
}
