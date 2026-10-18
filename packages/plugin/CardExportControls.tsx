import { React } from "@webpack/common";
import { StudioField as Field, StudioChoice as Choice, StudioAction as Action } from "./studio-controls.js";
import { profileSvg } from "./profile-export.js";
import { recordProfileGif, type GifExporter } from "./gif-recording.js";

export function CardExportControls({
  getCard,
  artworkLoader,
  png,
  gif,
  disabled = false,
  source = "preview",
}: {
  getCard: () => HTMLElement | null | undefined;
  artworkLoader?: (url: string) => Promise<string>;
  png?: (svg: string, width: number, height: number) => Promise<boolean>;
  gif?: GifExporter;
  disabled?: boolean;
  source?: "preview" | "profile";
}) {
  const [format, setFormat] = React.useState("png");
  const [progress, setProgress] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const operation = React.useRef<AbortController | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  async function start() {
    if (operation.current || disabled || !artworkLoader) return;
    const card = getCard();
    if (!card) return;
    const controller = new AbortController();
    operation.current = controller;
    setError("");
    setProgress(0);
    setStatus("Preparing profile card…");
    try {
      let saved = false;
      if (format === "gif" && gif) {
        saved = await recordProfileGif(card, artworkLoader, gif, controller.signal, (value) => {
          if (!mounted.current) return;
          setProgress(value);
          setStatus(value < 1 ? "Recording profile animation…" : "Finishing GIF…");
        });
      } else if (png) {
        const sample = await profileSvg(card, artworkLoader);
        controller.signal.throwIfAborted();
        saved = await png(sample.svg, sample.width, sample.height);
      }
      if (mounted.current)
        setStatus(saved ? `Profile card exported as ${format.toUpperCase()}.` : "Export cancelled.");
    } catch (cause) {
      if (!mounted.current) return;
      if (controller.signal.aborted) setStatus("Export cancelled.");
      else {
        setStatus("");
        setError(cause instanceof Error ? cause.message : "The card could not be exported. Try again.");
      }
    } finally {
      operation.current = null;
      if (mounted.current) setProgress(null);
    }
  }
  const busy = progress !== null;
  return (
    <div className="ps-card-export" aria-busy={busy}>
      <Field
        id="ps-card-export-format"
        label="Card export"
        help={
          format === "gif"
            ? `4-second looping GIF · up to 450 px · no sound. Every frame is encoded; preparation may take longer. Keep the ${source === "profile" ? "profile" : "preview"} open.`
            : `High-resolution still image of this ${source}. Only the profile card is saved.`
        }
      >
        <Choice
          id="ps-card-export-format"
          value={format}
          onChange={setFormat}
          disabled={busy || disabled}
          options={[
            { value: "png", label: "PNG · still image" },
            ...(gif ? [{ value: "gif", label: "GIF · animation" }] : []),
          ]}
        />
      </Field>
      <div className="ps-actions">
        <Action
          variant="secondary"
          disabled={disabled || busy || !artworkLoader || (format === "gif" ? !gif : !png)}
          onClick={() => void start()}
        >
          Export {format.toUpperCase()}
        </Action>
        {busy && format === "gif" && (
          <Action variant="secondary" onClick={() => operation.current?.abort()}>
            Cancel export
          </Action>
        )}
      </div>
      {busy && format === "gif" && (
        <progress aria-label="GIF export progress" max={1} value={progress ?? 0} />
      )}
      {status && (
        <p className="ps-notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="ps-notice ps-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
