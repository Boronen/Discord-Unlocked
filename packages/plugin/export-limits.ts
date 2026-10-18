export const GIF_LIMITS = {
  width: 450,
  height: 8192,
  pixels: 2_000_000,
  frames: 32,
  duration: 8000,
  bytes: 128 * 1024 * 1024,
  svgBytes: 64 * 1024 * 1024,
  sessionMs: 360_000,
};
/** Fit the whole card, including every panel, instead of rejecting a tall profile. */
export function cardExportSize(sourceHeight: number, animated: boolean, sourceWidth = 300) {
  if (
    !Number.isFinite(sourceHeight) ||
    sourceHeight <= 0 ||
    !Number.isFinite(sourceWidth) ||
    sourceWidth <= 0
  )
    throw new Error("The profile preview has no size.");
  if (!animated) {
    const scale = Math.min(
      3,
      4096 / sourceWidth,
      4000 / sourceHeight,
      Math.sqrt(8_000_000 / (sourceWidth * sourceHeight)),
    );
    return {
      width: Math.max(1, Math.floor(sourceWidth * scale)),
      height: Math.max(1, Math.floor(sourceHeight * scale)),
      scale,
    };
  }
  const ratio = Math.min(
    GIF_LIMITS.width / sourceWidth,
    GIF_LIMITS.height / sourceHeight,
    Math.sqrt(GIF_LIMITS.pixels / (sourceWidth * sourceHeight)),
  );
  let width = Math.max(1, Math.floor(sourceWidth * ratio));
  let height = Math.ceil((sourceHeight * width) / sourceWidth);
  while (width > 1 && width * height > GIF_LIMITS.pixels)
    height = Math.ceil((sourceHeight * --width) / sourceWidth);
  return { width, height, scale: width / sourceWidth };
}
