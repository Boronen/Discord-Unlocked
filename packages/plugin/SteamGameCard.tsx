import { React } from "@webpack/common";
import { loadSteamGame, loadSteamArtwork, type SteamGame } from "./steam-games.js";

export function SteamGameCard({ url, reduced = false }: { url: string; reduced?: boolean }) {
  const root = React.useRef<HTMLDivElement>(null);
  const [game, setGame] = React.useState<SteamGame | null>(null),
    [error, setError] = React.useState(""),
    [index, setIndex] = React.useState(0);
  const [frame, setFrame] = React.useState<{ src: string; index: number }>(),
    [paused, setPaused] = React.useState(false),
    [hover, setHover] = React.useState(false),
    [visible, setVisible] = React.useState(!document.hidden);
  React.useEffect(() => {
    let canceled = false;
    setGame(null);
    setFrame(undefined);
    setIndex(0);
    setError("");
    void Promise.resolve()
      .then(() => loadSteamGame(url))
      .then((value) => {
        if (!canceled) setGame(value);
      })
      .catch(() => {
        if (!canceled) setError("Steam screenshots are unavailable. Use the Steam link to view this game.");
      });
    return () => {
      canceled = true;
    };
  }, [url]);
  React.useEffect(() => {
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            intersecting = entries[0]?.isIntersecting ?? false;
            update();
          })
        : null;
    if (root.current) observer?.observe(root.current);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const image = game?.images[index];
  React.useEffect(() => {
    let canceled = false;
    if (!image) return;
    void loadSteamArtwork(image)
      .then(async (src) => {
        const decoded = new Image();
        decoded.src = src;
        await decoded.decode();
        if (decoded.naturalWidth * decoded.naturalHeight > 16_000_000) throw new Error("Image too large.");
        if (!canceled) {
          setFrame({ src, index });
          setError("");
        }
      })
      .catch(() => {
        if (!canceled) setError("This screenshot could not be loaded. Try the next image.");
      });
    return () => {
      canceled = true;
    };
  }, [image]);
  const count = game?.images.length ?? 0;
  React.useEffect(() => {
    if (reduced || paused || hover || !visible || count < 2 || !frame || error) return;
    const timer = setTimeout(() => setIndex((value) => (value + 1) % count), 4000);
    return () => clearTimeout(timer);
  }, [reduced, paused, hover, visible, count, frame, error, index]);
  return (
    <div
      ref={root}
      className="ps-steam-game"
      aria-label="Favorite game"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHover(false);
      }}
    >
      {!game && !error && <p role="status">Loading game from Steam…</p>}
      {game && (
        <>
          <strong>{game.name}</strong>
          {count > 0 ? (
            <figure className="ps-steam-frame">
              {frame ? (
                <img src={frame.src} alt={`${game.name} · screenshot ${frame.index + 1} of ${count}`} />
              ) : (
                <span role="status">Loading screenshot…</span>
              )}
            </figure>
          ) : (
            <p>No screenshots available for this game.</p>
          )}
          {count > 1 && (
            <div className="ps-steam-controls">
              <button
                type="button"
                onClick={() => setIndex((value) => (value - 1 + count) % count)}
                aria-label="Previous game screenshot"
              >
                ‹
              </button>
              <span>
                {(frame?.index ?? 0) + 1} / {count}
              </span>
              <button
                type="button"
                onClick={() => setIndex((value) => (value + 1) % count)}
                aria-label="Next game screenshot"
              >
                ›
              </button>
              {!reduced && (
                <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
                  {paused ? "Resume slideshow" : "Pause slideshow"}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p role="status">{error}</p>}
      <a href={game?.url ?? url} target="_blank" rel="noreferrer">
        View on Steam
      </a>
    </div>
  );
}
