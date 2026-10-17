// SPDX-License-Identifier: GPL-3.0-or-later
import type { IpcMainInvokeEvent } from "electron";
import { RendererSettings } from "@main/settings";
import { DATA_DIR } from "@main/utils/constants";
import { safeStorage, BrowserWindow, dialog } from "electron";
import { songLink, providerName, providerArtwork } from "./music-links";
import { readFile, mkdir, writeFile, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { accountZip } from "./export-zip";
import type { DraftBackup } from "./draft-history";
import { renderCard, validateCard } from "./card-surface";
import { CardGif } from "./gif-encoder";
import { steamGameId, parseSteamGame, steamArtwork } from "./steam-games";
function sessionPath(userId: string, base: string) {
  const configured =
    (RendererSettings.store.plugins?.ProfileStudio as { apiUrl?: string } | undefined)?.apiUrl ??
    "http://localhost:3100";
  if (!/^\d{17,20}$/.test(userId) || base.replace(/\/$/, "") !== configured.replace(/\/$/, ""))
    throw new Error("Invalid session reference.");
  const key = createHash("sha256")
    .update(`${base.replace(/\/$/, "")}\0${userId}`)
    .digest("hex");
  return join(DATA_DIR, "profile-studio-sessions", `${key}.bin`);
}
export async function saveSession(_: IpcMainInvokeEvent, userId: string, base: string, token: string) {
  const path = sessionPath(userId, base);
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encrypted storage is unavailable.");
  if (!/^[a-zA-Z0-9_-]{32,100}$/.test(token)) throw new Error("Invalid session.");
  await mkdir(join(DATA_DIR, "profile-studio-sessions"), { recursive: true });
  await writeFile(path, safeStorage.encryptString(token), { mode: 0o600 });
}
export async function loadSession(_: IpcMainInvokeEvent, userId: string, base: string) {
  const path = sessionPath(userId, base);
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const data = await readFile(path);
    if (data.length > 4096) return null;
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}
export async function removeSession(_: IpcMainInvokeEvent, userId: string, base: string) {
  await unlink(sessionPath(userId, base)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  await clearDrafts(userId, base);
}
function draftPath(user: string, base: string, preset: string) {
  if (!/^[0-9a-f-]{36}$/.test(preset)) throw new Error("Invalid preset reference.");
  return `${sessionPath(user, base)}.${preset}.draft`;
}
async function clearDrafts(user: string, base: string) {
  const prefix = sessionPath(user, base).split(/[\\/]/).pop()!;
  const { readdir } = await import("node:fs/promises");
  for (const name of await readdir(join(DATA_DIR, "profile-studio-sessions")).catch(() => []))
    if (name.startsWith(prefix + ".") && name.endsWith(".draft"))
      await unlink(join(DATA_DIR, "profile-studio-sessions", name));
}
export async function saveDraftBackup(_: IpcMainInvokeEvent, value: DraftBackup) {
  const path = draftPath(value.userId, value.base, value.presetId);
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.serverVersion) ||
    value.serverVersion < 0 ||
    !Number.isFinite(Date.parse(value.savedAt))
  )
    throw new Error("Invalid draft backup.");
  const text = JSON.stringify(value);
  if (text.length > 256 * 1024) throw new Error("The local draft exceeds its size limit.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encrypted storage is unavailable.");
  await mkdir(join(DATA_DIR, "profile-studio-sessions"), { recursive: true });
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    await writeFile(temporary, safeStorage.encryptString(text), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function loadDraftBackup(
  _: IpcMainInvokeEvent,
  user: string,
  base: string,
  preset: string,
): Promise<DraftBackup | null> {
  const path = draftPath(user, base, preset);
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const data = await readFile(path);
    if (data.length > 512 * 1024) return null;
    const value = JSON.parse(safeStorage.decryptString(data)) as DraftBackup;
    if (
      value.version !== 1 ||
      value.userId !== user ||
      value.base !== base ||
      value.presetId !== preset ||
      !Number.isSafeInteger(value.serverVersion) ||
      !Number.isFinite(Date.parse(value.savedAt)) ||
      Date.now() - Date.parse(value.savedAt) > 30 * 86400000
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export async function removeDraftBackup(_: IpcMainInvokeEvent, user: string, base: string, preset?: string) {
  if (!preset) return clearDrafts(user, base);
  await unlink(draftPath(user, base, preset)).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
}
async function saveCard(path: string, data: Uint8Array, signal?: AbortSignal) {
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    signal?.throwIfAborted();
    await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    signal?.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function exportProfilePng(_: IpcMainInvokeEvent, svg: string, width: number, height: number) {
  validateCard(svg, width, height);
  const output = await dialog.showSaveDialog({
    title: "Export profile card",
    defaultPath: "profile-studio-card.png",
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (output.canceled || !output.filePath) return false;
  const data = (await renderCard(svg, width, height)).toPNG();
  if (data.length > 20 * 1024 * 1024) throw new Error("The PNG exceeds its export size limit.");
  await saveCard(output.filePath, data);
  return true;
}
const gifSessions = new Map<
  string,
  {
    sender: number;
    encoder: CardGif;
    output: string;
    busy: boolean;
    abort: AbortController;
    timer: ReturnType<typeof setTimeout>;
    detach: () => void;
  }
>();
const gifDialogs = new Set<number>();
function discardGif(id: string) {
  const session = gifSessions.get(id);
  if (!session) return;
  gifSessions.delete(id);
  clearTimeout(session.timer);
  session.detach();
  session.abort.abort();
}
function ownedGif(event: IpcMainInvokeEvent, id: string) {
  const session = gifSessions.get(id);
  if (!session || session.sender !== event.sender.id)
    throw new Error("This GIF recording has expired. Start a new export.");
  if (session.busy) throw new Error("The GIF is still processing a frame.");
  return session;
}
export async function beginProfileGif(event: IpcMainInvokeEvent, width: number, height: number) {
  const encoder = new CardGif(width, height);
  if (
    gifDialogs.has(event.sender.id) ||
    gifSessions.size + gifDialogs.size >= 2 ||
    [...gifSessions.values()].some((session) => session.sender === event.sender.id)
  )
    throw new Error("Another GIF export is already running.");
  gifDialogs.add(event.sender.id);
  try {
    const output = await dialog.showSaveDialog({
      title: "Export animated profile card",
      defaultPath: "profile-studio-card.gif",
      filters: [{ name: "Animated GIF", extensions: ["gif"] }],
    });
    if (output.canceled || !output.filePath || event.sender.isDestroyed()) return null;
    const id = randomUUID();
    const destroyed = () => discardGif(id);
    event.sender.once("destroyed", destroyed);
    gifSessions.set(id, {
      sender: event.sender.id,
      encoder,
      output: output.filePath,
      busy: false,
      abort: new AbortController(),
      timer: setTimeout(() => discardGif(id), 90000),
      detach: () => event.sender.removeListener("destroyed", destroyed),
    });
    return id;
  } finally {
    gifDialogs.delete(event.sender.id);
  }
}
export async function appendProfileGif(event: IpcMainInvokeEvent, id: string, svg: string, time: number) {
  const session = ownedGif(event, id);
  session.busy = true;
  try {
    const { width, height } = session.encoder;
    const image = await renderCard(svg, width, height, session.abort.signal, true);
    session.abort.signal.throwIfAborted();
    session.encoder.add(image.toBitmap(), time);
  } catch (error) {
    discardGif(id);
    throw error;
  } finally {
    session.busy = false;
  }
}
export async function finishProfileGif(event: IpcMainInvokeEvent, id: string, time: number) {
  const session = ownedGif(event, id);
  session.busy = true;
  try {
    await saveCard(session.output, session.encoder.finish(time), session.abort.signal);
    return true;
  } finally {
    discardGif(id);
  }
}
export async function cancelProfileGif(event: IpcMainInvokeEvent, id: string) {
  const session = gifSessions.get(id);
  if (session?.sender === event.sender.id) discardGif(id);
}
const MAX_RESPONSE = 20 * 1024 * 1024;
let songWindow: BrowserWindow | null = null;
let songSession: string | null = null;
export async function playSong(_: IpcMainInvokeEvent, value: string, sessionId: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(sessionId)) throw new Error("Invalid playback request.");
  const song = songLink(value);
  songWindow?.close();
  songSession = sessionId;
  const player = new BrowserWindow({
    width: song.provider === "youtube" ? 480 : 420,
    height: song.provider === "youtube" ? 360 : 260,
    title: `Favorite song · ${providerName(song.provider)}`,
    autoHideMenuBar: true,
    backgroundColor: "#1e1f22",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: `profile-studio-player-${randomUUID()}`,
    },
  });
  songWindow = player;
  const playerSession = player.webContents.session;
  const allowed = new Set([
    "open.spotify.com",
    "embed.music.apple.com",
    "www.youtube-nocookie.com",
    "accounts.spotify.com",
    "music.apple.com",
    "idmsa.apple.com",
    "www.youtube.com",
    "accounts.google.com",
  ]);
  player.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  player.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  player.webContents.session.setPermissionCheckHandler(() => false);
  player.webContents.session.on("will-download", (event) => event.preventDefault());
  const navigation = (event: { preventDefault(): void }, url: string) => {
    try {
      const target = new URL(url);
      if (
        target.protocol !== "https:" ||
        !allowed.has(target.hostname) ||
        target.port ||
        target.username ||
        target.password
      )
        event.preventDefault();
    } catch {
      event.preventDefault();
    }
  };
  player.webContents.on("will-navigate", navigation);
  player.webContents.on("will-redirect", navigation);
  player.webContents.on("will-attach-webview", (event) => event.preventDefault());
  player.on("closed", () => {
    void playerSession.clearStorageData().catch(() => {});
    if (songWindow === player) {
      songWindow = null;
      songSession = null;
    }
  });
  try {
    await player.loadURL(song.embedUrl, { httpReferrer: "https://discord.com/" });
  } catch {
    if (!player.isDestroyed()) player.close();
    throw new Error("The service player is unavailable. Try the Open link.");
  }
}
export function closeSong(_: IpcMainInvokeEvent, sessionId: string) {
  if (songSession === sessionId) songWindow?.close();
}
export function stopPlayback() {
  songWindow?.close();
}
export async function exportAccountData(
  event: IpcMainInvokeEvent,
  base: string,
  token: string,
  userId: string,
) {
  const response = await request(event, base, "/v1/privacy/export", "GET", undefined, token);
  if (response.status !== 200) throw new Error("The account export could not be loaded.");
  const data = JSON.parse(response.body);
  if (data.user?.id !== userId || !Array.isArray(data.media) || data.media.length > 200)
    throw new Error("Invalid account export.");
  const result = await dialog.showSaveDialog({
    title: "Export Profile Studio account",
    defaultPath: "profile-studio-account.zip",
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) return false;
  const files = [{ name: "account.json", data: new TextEncoder().encode(JSON.stringify(data, null, 2)) }];
  let bytes = 0;
  for (const asset of data.media) {
    if (asset.status !== "ready") continue;
    if (!/^[0-9a-f-]{36}$/.test(asset.id)) throw new Error("Invalid media export.");
    const file = await request(event, base, `/v1/privacy/media/${asset.id}`, "GET", undefined, token, true);
    if (file.status !== 200) throw new Error("A file changed while exporting. Please try again.");
    const extension = file.mime?.startsWith("audio/ogg")
      ? "ogg"
      : file.mime?.startsWith("image/webp")
        ? "webp"
        : null;
    if (!extension) throw new Error("Invalid export media type.");
    const content = Buffer.from(file.body, "base64");
    bytes += content.length;
    if (bytes > 100 * 1024 * 1024) throw new Error("Export exceeds the account size limit.");
    files.push({ name: `media/${asset.id}.${extension}`, data: content });
  }
  const temporary = `${result.filePath}.${randomUUID()}.partial`;
  try {
    await writeFile(temporary, accountZip(files), { flag: "wx", mode: 0o600 });
    await rename(temporary, result.filePath);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return true;
}
async function bounded(response: Response, max: number) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > max) {
        await reader.cancel();
        throw new Error("The response is too large.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function request(
  _: IpcMainInvokeEvent,
  base: string,
  path: string,
  method: string,
  body?: string,
  token?: string,
  binary = false,
) {
  const configured =
    (RendererSettings.store.plugins?.ProfileStudio as { apiUrl?: string } | undefined)?.apiUrl ??
    "http://localhost:3100";
  if (base.replace(/\/$/, "") !== configured.replace(/\/$/, ""))
    throw new Error("The API URL does not match your settings.");
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
  )
    throw new Error("Use an HTTPS API URL. Localhost HTTP is allowed for local testing.");
  if (
    !/^\/v[12]\/[a-zA-Z0-9/?=,&_%.-]+$/.test(path) ||
    path.split("?")[0]!.includes("..") ||
    !["GET", "POST", "PUT", "DELETE"].includes(method) ||
    (body?.length ?? 0) > 1024 * 1024 ||
    (token?.length ?? 0) > 100
  )
    throw new Error("Invalid API request.");
  const response = await fetch(new URL(path, url.origin), {
    method,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await bounded(response, binary ? MAX_RESPONSE : 2 * 1024 * 1024);
  return {
    status: response.status,
    body: binary ? data.toString("base64") : data.toString("utf8"),
    mime: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
let gameRequests = 0;
export async function steamGame(_: IpcMainInvokeEvent, value: string) {
  const id = steamGameId(value);
  if (gameRequests >= 4) throw new Error("Steam previews are busy. Try again shortly.");
  gameRequests++;
  try {
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Steam is unavailable.");
    return parseSteamGame(id, JSON.parse((await bounded(response, 2 * 1024 * 1024)).toString("utf8")));
  } catch {
    throw new Error("The game could not be loaded from Steam. Check the link and try again.");
  } finally {
    gameRequests--;
  }
}
export async function artwork(_: IpcMainInvokeEvent, value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !(
      ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
      providerArtwork(value) ||
      steamArtwork(value)
    ) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Artwork must come from Discord or a supported music service.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Artwork is unavailable.");
  const data = await bounded(response, 5 * 1024 * 1024);
  return `data:${response.headers.get("content-type")};base64,${data.toString("base64")}`;
}
