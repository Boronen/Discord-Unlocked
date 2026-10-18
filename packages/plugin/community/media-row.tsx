import { usePrivateMedia } from "../usePrivateMedia.js";
import { React } from "@webpack/common";
import type { StudioClient } from "../client.js";
import { type MediaAsset } from "../model.js";
import type { MediaMetadata } from "../studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import { Thumbnail } from "../CollectibleMedia.js";
import type { CommunityProps as Props } from "./types.js";
import { StudioDialog } from "../studio-dialogs.js";

export function PrivateImage({ asset, api }: { asset: MediaAsset; api: StudioClient }) {
  const { urls } = usePrivateMedia(api, [[asset.id, asset.previewUrl ?? asset.url]]);
  const url = urls[asset.id];
  return <Thumbnail url={url} />;
}
export function MediaRow({
  asset,
  metadata,
  usage,
  props,
}: {
  asset: MediaAsset;
  metadata?: MediaMetadata;
  usage: string[];
  props: Props;
}) {
  const [tagText, setTagText] = React.useState(metadata?.tags.join(", ") ?? "");
  const [doc, setDoc] = React.useState(metadata ?? { label: "", folder: "", tags: [] }),
    [inspect, setInspect] = React.useState(false),
    [background, setBackground] = React.useState("checker"),
    [zoom, setZoom] = React.useState(1),
    [staticMode, setStatic] = React.useState(true),
    [black, setBlack] = React.useState(false);
  const { urls, failed } = usePrivateMedia(
    props.api,
    inspect ? [[asset.id, staticMode && asset.previewUrl ? asset.previewUrl : asset.url]] : [],
  );
  const url = urls[asset.id];
  return (
    <article className="ps-media-row">
      <div className="ps-media-heading">
        {asset.slot !== "audio" && asset.status === "ready" && <PrivateImage asset={asset} api={props.api} />}
        <div>
          <strong>{doc.label || `${asset.slot} · ${asset.id.slice(0, 8)}`}</strong>
          <small>
            {asset.status} · {((asset.bytes ?? 0) / 1024 / 1024).toFixed(2)} MiB
          </small>
          <small>Used by: {usage.length ? usage.join(", ") : "No saved presets"}</small>
        </div>
      </div>
      <Field id={`media-label-${asset.id}`} label="Display name">
        <input
          id={`media-label-${asset.id}`}
          maxLength={64}
          value={doc.label}
          onChange={(e) => setDoc({ ...doc, label: e.target.value })}
        />
      </Field>
      <Field id={`media-folder-${asset.id}`} label="Folder">
        <input
          id={`media-folder-${asset.id}`}
          maxLength={64}
          value={doc.folder}
          onChange={(e) => setDoc({ ...doc, folder: e.target.value })}
        />
      </Field>
      <Field id={`media-tags-${asset.id}`} label="Tags (comma separated)">
        <input
          id={`media-tags-${asset.id}`}
          value={tagText}
          maxLength={300}
          onChange={(e) => setTagText(e.target.value)}
        />
      </Field>
      <div className="ps-actions">
        <Action
          onClick={() =>
            void props.onRun(async () => {
              await props.api.request(`/v2/me/media/${asset.id}`, "PUT", {
                ...doc,
                tags: tagText
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              });
              await props.onRefresh();
              props.onMessage("Media labels saved.");
            })
          }
        >
          Save labels
        </Action>
        <Action
          variant="secondary"
          disabled={asset.slot === "audio" || asset.status !== "ready"}
          onClick={() => setInspect(true)}
        >
          Inspect transparency
        </Action>
        <Action
          variant="secondary"
          onClick={() =>
            props.onConfirm({
              title: "Remove uploaded media?",
              detail: `This removes the upload and its shared copies, and can hide profiles using it. Your affected presets: ${usage.join(", ") || "none"}.`,
              action: "Remove media",
              run: () =>
                void props.onRun(async () => {
                  await props.api.request(`/v2/me/media/${asset.id}`, "DELETE");
                  await props.onRefresh();
                  props.onMessage("Media revoked. Shared copies can no longer be displayed.");
                }),
            })
          }
        >
          Remove media
        </Action>
      </div>
      {inspect && (
        <StudioDialog title="Transparency inspector" onClose={() => setInspect(false)}>
          <div className="ps-two-col">
            <Field id="ps-inspect-background" label="Test background">
              <Choice
                id="ps-inspect-background"
                value={background}
                onChange={setBackground}
                options={["checker", "light", "dark", "profile"].map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field id="ps-inspect-zoom" label={`Zoom · ${zoom}×`}>
              <input
                id="ps-inspect-zoom"
                type="range"
                min="1"
                max="3"
                step=".25"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </Field>
          </div>
          <label className="ps-checkbox">
            <input type="checkbox" checked={staticMode} onChange={(e) => setStatic(e.target.checked)} />
            Static preview
          </label>
          {asset.slot === "effect" && (
            <label className="ps-checkbox">
              <input type="checkbox" checked={black} onChange={(e) => setBlack(e.target.checked)} />
              Preview black-background removal
            </label>
          )}
          <div
            className={`ps-transparency ps-transparency-${background}`}
            style={{
              backgroundColor: background === "profile" ? (props.config.colors?.[0] ?? "#26344a") : undefined,
            }}
          >
            {url ? (
              <img
                src={url}
                alt="Uploaded media preview"
                style={{ transform: `scale(${zoom})`, mixBlendMode: black ? "screen" : "normal" }}
              />
            ) : (
              <p role="status">{failed ? "This preview is unavailable." : "Loading preview…"}</p>
            )}
          </div>
          <p className="ps-help">Inspection does not modify your file or preset.</p>
        </StudioDialog>
      )}
    </article>
  );
}
