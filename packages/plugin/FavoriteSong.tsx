import { React } from "@webpack/common";
import { songLink, providerName, type FavoriteSong } from "./music-links.js";
import { effectStyle } from "./visuals.js";
import type { MusicStyle } from "./model.js";
import { textOn } from "./palette.js";
export function FavoriteSongCard({
  song,
  style,
  reduced,
  muted = false,
  artwork,
  onPlay,
  onClose,
}: {
  song: FavoriteSong;
  style: MusicStyle;
  reduced: boolean;
  muted?: boolean;
  artwork?: string;
  onPlay?: () => Promise<unknown>;
  onClose?: () => void;
}) {
  const [error, setError] = React.useState("");
  const [opening, setOpening] = React.useState(false);
  const link = songLink(song.url);
  React.useEffect(() => {
    if (muted) onClose?.();
    return () => onClose?.();
  }, [song.url, muted]);
  return (
    <section
      lang="en"
      className={`ps-favorite ps-music ps-effect-${reduced ? "none" : style.preset}`}
      style={{ ...effectStyle(style), backgroundColor: style.background, color: textOn(style.background) }}
      aria-label="Favorite song"
    >
      <small>Favorite song · {providerName(link.provider)}</small>
      <div className="ps-track">
        {artwork ? (
          <img className="ps-artwork" src={artwork} alt="" />
        ) : (
          <div className="ps-artwork" aria-hidden="true">
            ♪
          </div>
        )}
        <div className="ps-favorite-text">
          <strong>{song.title}</strong>
          <span>{song.artist}</span>
        </div>
      </div>
      <div className="ps-actions">
        {onPlay && (
          <button
            type="button"
            disabled={muted || opening}
            onClick={() => {
              setError("");
              setOpening(true);
              void onPlay()
                .catch((reason) =>
                  setError(reason instanceof Error ? reason.message : "The player could not be opened."),
                )
                .finally(() => setOpening(false));
            }}
          >
            {opening ? "Opening…" : "Play"}
          </button>
        )}
        <a href={link.url} target="_blank" rel="noreferrer">
          Open · {providerName(link.provider)}
        </a>
      </div>
      {onPlay && <small>The service player opens in a separate window.</small>}
      {muted && <small>Profile sounds are muted.</small>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
