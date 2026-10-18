export type SongProvider = "spotify" | "apple" | "youtube";
export interface SongLink {
  provider: SongProvider;
  id: string;
  url: string;
  embedUrl: string;
}
export interface FavoriteSong {
  url: string;
  title: string;
  artist: string;
  artwork: string | null;
}
export function providerArtwork(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (["i.scdn.co", "i.ytimg.com"].includes(url.hostname) ||
        /^is?[1-5]-ssl\.mzstatic\.com$/.test(url.hostname) ||
        /^image-cdn-[a-z]{2}\.spotifycdn\.com$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}
export function songLink(input: string): SongLink {
  const value = input.trim();
  const uri = value.match(/^spotify:track:([a-zA-Z0-9]{22})$/);
  const url = new URL(uri ? `https://open.spotify.com/track/${uri[1]}` : value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Enter an HTTPS song link.");
  if (url.hostname === "open.spotify.com") {
    const id = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]{22})\/?$/)?.[1];
    if (id)
      return {
        provider: "spotify",
        id,
        url: `https://open.spotify.com/track/${id}`,
        embedUrl: `https://open.spotify.com/embed/track/${id}?autoplay=1`,
      };
  }
  if (url.hostname === "music.apple.com") {
    const country = url.pathname.match(/^\/([a-z]{2})\//)?.[1];
    const id = url.searchParams.get("i") ?? url.pathname.match(/\/song\/(?:[^/]+\/)?(\d+)\/?$/)?.[1];
    if (country && id && /^\d{5,20}$/.test(id) && /^\/[a-z]{2}\/(?:song|album)\//.test(url.pathname))
      return {
        provider: "apple",
        id,
        url: `https://music.apple.com/${country}/song/${id}`,
        embedUrl: `https://embed.music.apple.com/${country}/song/${id}?autoplay=true`,
      };
  }
  if (["youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"].includes(url.hostname)) {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : null;
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
      return {
        provider: "youtube",
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`,
      };
  }
  throw new Error("Enter a Spotify, Apple Music or YouTube Music song link. Playlists are not supported.");
}
export function providerName(provider: SongProvider) {
  return { spotify: "Spotify", apple: "Apple Music", youtube: "YouTube Music" }[provider];
}
