/** Discord's hashed public UI image assets, needed by self-contained profile exports. */
export function discordAssetArtwork(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "discord.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/assets\/[a-zA-Z0-9_-]+\.(?:svg|png|webp|gif)$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
