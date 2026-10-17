export interface SteamGame {
  appId: string;
  name: string;
  url: string;
  images: string[];
}
export function steamGameId(value: string) {
  if (typeof value !== "string" || value.length > 1200)
    throw new Error("Enter a Steam store game link or App ID.");
  const input = value.trim();
  if (/^[1-9]\d{0,9}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const id = /^\/app\/([1-9]\d{0,9})(?:\/[^/]*)?\/?$/.exec(url.pathname)?.[1];
    if (
      url.protocol === "https:" &&
      url.hostname === "store.steampowered.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      id
    )
      return id;
  } catch {}
  throw new Error("Enter a Steam store game link or App ID.");
}
export function steamArtwork(value: string, appId?: string) {
  try {
    const url = new URL(value);
    const hosts = [
      "shared.akamai.steamstatic.com",
      "shared.fastly.steamstatic.com",
      "shared.cloudflare.steamstatic.com",
      "cdn.akamai.steamstatic.com",
      "cdn.cloudflare.steamstatic.com",
    ];
    const id = /^\/(?:store_item_assets\/)?steam\/apps\/([1-9]\d{0,9})\/[^/]+\.(?:jpg|jpeg|png|webp)$/.exec(
      url.pathname,
    )?.[1];
    return (
      value.length <= 1200 &&
      url.protocol === "https:" &&
      hosts.includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !!id &&
      (!appId || id === appId)
    );
  } catch {
    return false;
  }
}
export function parseSteamGame(appId: string, response: unknown): SteamGame {
  const entry = (response as any)?.[appId];
  const data = entry?.success === true ? entry.data : null;
  if (
    !data ||
    data.type !== "game" ||
    String(data.steam_appid) !== appId ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 200
  )
    throw new Error("This game is unavailable in the Steam store.");
  const screenshots = (Array.isArray(data.screenshots) ? data.screenshots : [])
    .map((item: any) => item?.path_thumbnail)
    .filter((value: unknown): value is string => typeof value === "string" && steamArtwork(value, appId));
  const images = [...new Set<string>(screenshots)].slice(0, 8);
  if (!images.length && typeof data.header_image === "string" && steamArtwork(data.header_image, appId))
    images.push(data.header_image);
  return { appId, name: data.name.trim(), url: `https://store.steampowered.com/app/${appId}/`, images };
}

let loader: ((value: string) => Promise<SteamGame>) | undefined;
let artwork: ((url: string) => Promise<string>) | undefined;
const cache = new Map<string, { until: number; value: Promise<SteamGame> }>();
export function configureSteamGames(resolve?: typeof loader, image?: typeof artwork) {
  loader = resolve;
  artwork = image;
  cache.clear();
}
export function clearSteamGames() {
  cache.clear();
}
export function loadSteamGame(value: string) {
  const id = steamGameId(value);
  const cached = cache.get(id);
  if (cached && cached.until > Date.now()) return cached.value;
  if (!loader)
    return Promise.reject(
      new Error("Steam previews are available when Profile Studio is running in Discord."),
    );
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  const entry = { until: Date.now() + 3600000, value: loader(id) };
  cache.set(id, entry);
  void entry.value.catch(() => {
    if (cache.get(id) === entry) cache.delete(id);
  });
  return entry.value;
}
export function loadSteamArtwork(value: string) {
  if (!steamArtwork(value) || !artwork)
    return Promise.reject(new Error("The Steam image could not be loaded."));
  return artwork(value);
}
