import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { pngDocument } from "./png-document";
import { GIF_LIMITS } from "./export-limits.js";

export function validateCard(svg: string, width: number, height: number, animated = false) {
  if (
    typeof svg !== "string" ||
    svg.length > (animated ? GIF_LIMITS.svgBytes : 16 * 1024 * 1024) ||
    !svg.startsWith("<svg") ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < (animated ? 1 : 100) ||
    height < (animated ? 1 : 100) ||
    width > (animated ? GIF_LIMITS.width : 4096) ||
    height > (animated ? GIF_LIMITS.height : 4096) ||
    width * height > (animated ? GIF_LIMITS.pixels : 8_000_000)
  )
    throw new Error("The export exceeds its image limits.");
}

/** One isolated, scriptless paint. No live Discord content or desktop pixels are captured. */
export async function renderCard(
  svg: string,
  width: number,
  height: number,
  signal?: AbortSignal,
  animated = false,
) {
  validateCard(svg, width, height, animated);
  signal?.throwIfAborted();
  const surface = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
      devTools: false,
      backgroundThrottling: false,
      partition: `studio-export-${randomUUID()}`,
    },
  });
  const web = surface.webContents,
    session = web.session;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    if (!surface.isDestroyed()) surface.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const document = pngDocument(svg);
    web.setWindowOpenHandler(() => ({ action: "deny" }));
    session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.on("will-download", (event) => event.preventDefault());
    web.on("will-navigate", (event) => event.preventDefault());
    web.on("will-redirect", (event) => event.preventDefault());
    web.on("will-attach-webview", (event) => event.preventDefault());
    session.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !document.allows(details) }),
    );
    session.protocol.handle("https", (request) => document.respond(request));
    const painted = new Promise<void>((resolve, reject) => {
      surface.once("ready-to-show", () => resolve());
      surface.once("closed", () => reject(new Error("Export cancelled.")));
      timer = setTimeout(() => reject(new Error("Export rendering timed out.")), 10000);
    });
    await Promise.all([surface.loadURL(document.url), painted]);
    const image = await web.capturePage();
    if (image.isEmpty()) throw new Error("Empty card.");
    return image.resize({ width, height, quality: "best" });
  } catch {
    throw new Error(
      signal?.aborted ? "Export cancelled." : "The profile card could not be rendered. Please try again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (!surface.isDestroyed()) surface.destroy();
    session.protocol.unhandle("https");
    await session.clearCache().catch(() => {});
  }
}
