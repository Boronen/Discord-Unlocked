import { songLink } from "./music-links.js";
export interface LiveMusic {
  title: string;
  artist: string;
  provider: string;
  artwork?: string;
  url?: string;
  start?: number;
  end?: number;
}
export interface MusicActivity {
  type?: number;
  name?: string;
  details?: string;
  state?: string;
  sync_id?: string;
  timestamps?: { start?: unknown; end?: unknown };
  metadata?: { button_urls?: unknown[] };
  buttons?: unknown[];
}
export function currentMusic(activity: MusicActivity | undefined, artwork?: string): LiveMusic | undefined {
  if (!activity || !isMusicActivity(activity) || !activity.details?.trim()) return;
  let url: string | undefined;
  const candidates = [
    ...(activity.sync_id && /^[a-zA-Z0-9]{22}$/.test(activity.sync_id) && /spotify/i.test(activity.name ?? "")
      ? [`https://open.spotify.com/track/${activity.sync_id}`]
      : []),
    ...(activity.metadata?.button_urls ?? []),
    ...(activity.buttons ?? []).map((button) =>
      typeof button === "object" && button ? (button as { url?: unknown }).url : undefined,
    ),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 1000) continue;
    try {
      url = songLink(candidate).url;
      break;
    } catch {}
  }
  const timestamp = (value: unknown) => {
    const number = value instanceof Date ? value.getTime() : typeof value === "number" ? value : NaN;
    return Number.isFinite(number) && number > 0 ? (number < 1e12 ? number * 1000 : number) : undefined;
  };
  const start = timestamp(activity.timestamps?.start),
    end = timestamp(activity.timestamps?.end);
  return {
    title: activity.details.trim().slice(0, 200),
    artist: (activity.state ?? "").slice(0, 200),
    provider: (activity.name ?? "Music").slice(0, 80),
    artwork,
    url,
    start,
    end: start && end && end > start ? end : undefined,
  };
}
export function isMusicActivity(activity: MusicActivity) {
  return (
    activity.type === 2 ||
    /music presence|apple music|spotify|youtube music|tidal|foobar2000|winamp/i.test(activity.name ?? "")
  );
}
export function musicCover(
  activity: { application_id?: string; assets?: { large_image?: string } } | undefined,
  getAssetImage: (id: string | undefined, image: string, size: [number, number]) => string | undefined,
) {
  const image = activity?.assets?.large_image;
  return image ? getAssetImage(activity?.application_id, image, [512, 512]) : undefined;
}
export function findMusicSurface(root: HTMLElement, activity: MusicActivity): HTMLElement | null {
  const title = (activity.details || activity.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!title) return null;
  const matches = (element: HTMLElement) =>
    !element.closest(".ps-favorite") &&
    !!element.querySelector("img") &&
    (element.textContent ?? "").replace(/\s+/g, " ").toLowerCase().includes(title);
  let cards = [
    ...root.querySelectorAll<HTMLElement>(
      '[class*="card_"],[class*="activityCard"],section,[role="article"]',
    ),
  ].filter(matches);
  if (!cards.length) cards = [...root.querySelectorAll<HTMLElement>('[class*="activity_"]')].filter(matches);
  if (cards.length)
    return cards.find((card) => !cards.some((other) => other !== card && card.contains(other))) ?? cards[0]!;
  for (const image of root.querySelectorAll("img")) {
    let parent = image.parentElement;
    for (let i = 0; parent && parent !== root && i < 6; i++, parent = parent.parentElement)
      if (matches(parent)) return parent;
  }
  return null;
}
