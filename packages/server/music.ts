import { songLink, providerArtwork, type FavoriteSong } from "../shared/domain/music-links.js";
import { invariant } from "./errors.js";
const cache = new Map<string, { expires: number; value: FavoriteSong }>();
export async function resolveSong(value: string): Promise<FavoriteSong> {
  const link = songLink(value),
    cached = cache.get(link.url);
  if (cached && cached.expires > Date.now()) return cached.value;
  const endpoint =
    link.provider === "spotify"
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`
      : link.provider === "apple"
        ? `https://itunes.apple.com/lookup?id=${link.id}&entity=song&country=${new URL(link.url).pathname.split("/")[1]}`
        : `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`;
  const response = await fetch(endpoint, { redirect: "error", signal: AbortSignal.timeout(8000) });
  invariant(
    response.ok,
    400,
    "SONG_UNAVAILABLE",
    "The service could not find this song or is temporarily unavailable.",
  );
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 200000) {
        await reader.cancel();
        throw new Error("The service response is too large.");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = JSON.parse(Buffer.concat(parts).toString("utf8"));
  const item =
    link.provider === "apple" ? data.results?.find((row: any) => String(row.trackId) === link.id) : data;
  invariant(item, 400, "SONG_UNAVAILABLE", "Song not found.");
  const image = String(item.thumbnail_url ?? item.artworkUrl100 ?? "");
  const result: FavoriteSong = {
    url: link.url,
    title: String(item.title ?? item.trackName ?? "Favorite song").slice(0, 200),
    artist: String(item.author_name ?? item.artistName ?? "").slice(0, 200),
    artwork: providerArtwork(image) ? image : null,
  };
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(link.url, { value: result, expires: Date.now() + 3600000 });
  return result;
}
