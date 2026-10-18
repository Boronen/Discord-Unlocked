import { React } from "@webpack/common";
import { type MediaAsset } from "../model.js";
import type { Preset, StyleShare } from "../studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import { ProfilePreview } from "../visuals.js";
import type { CommunityProps as Props } from "./types.js";

export function SharingPanel(props: Props) {
  const [shares, setShares] = React.useState<StyleShare[]>([]),
    [selected, setSelected] = React.useState<StyleShare | null>(null),
    [assets, setAssets] = React.useState<MediaAsset[]>([]),
    [urls, setUrls] = React.useState<Record<string, string>>({}),
    [variant, setVariant] = React.useState("");
  const [title, setTitle] = React.useState(props.preset.name),
    [description, setDescription] = React.useState(""),
    [selectedPresets, setPresets] = React.useState([props.preset.id]),
    [consent, setConsent] = React.useState(false),
    [keep, setKeep] = React.useState({ avatar: true, songs: true, panels: true });
  const request = React.useRef<{ key: string; id: string } | null>(null);
  async function refresh() {
    const result = await props.api.request<{ items: StyleShare[] }>("/v2/styles");
    setShares(result.items);
  }
  React.useEffect(() => {
    void props.onRun(refresh);
  }, [props.api]);
  React.useEffect(() => {
    let cancel = false;
    void Promise.allSettled(
      assets.map(
        async (a) =>
          [a.id, await props.api.privateMedia(props.reduced && a.previewUrl ? a.previewUrl : a.url)] as const,
      ),
    ).then((result) => {
      if (!cancel)
        setUrls(Object.fromEntries(result.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
    });
    return () => {
      cancel = true;
    };
  }, [assets, props.api, props.reduced]);
  const chosen = selected?.variants.find((v) => v.revisionId === variant) ?? selected?.variants[0];
  return (
    <section>
      <h3>Community styles</h3>
      <p className="ps-help">
        Shared styles are visible only to paired community members. Imports create your own draft and require
        review.
      </p>
      <Action variant="secondary" onClick={() => void props.onRun(refresh)}>
        Refresh styles
      </Action>
      {!shares.length && <p>No approved shared styles yet.</p>}
      <div className="ps-share-list">
        {shares.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={selected?.id === s.id}
            onClick={() =>
              void props.onRun(async () => {
                const value = await props.api.request<{ share: StyleShare; assets: MediaAsset[] }>(
                  `/v2/styles/${s.id}`,
                );
                setSelected(value.share);
                setAssets(value.assets);
                setVariant(value.share.variants[0]?.revisionId ?? "");
              })
            }
          >
            <strong>{s.title}</strong>
            <small>{s.description}</small>
            <small>
              {s.variants.length} {s.variants.length === 1 ? "variant" : "matching variants"}
            </small>
          </button>
        ))}
      </div>
      {selected && chosen && (
        <>
          <h4>{selected.title}</h4>
          <Field id="ps-shared-variant" label="Matching variant">
            <Choice
              id="ps-shared-variant"
              value={chosen.revisionId}
              onChange={setVariant}
              options={selected.variants.map((v) => ({ value: v.revisionId, label: v.name }))}
            />
          </Field>
          <div className="ps-shared-card">
            <ProfilePreview
              config={chosen.config}
              artworkLoader={props.artworkLoader}
              urls={urls}
              items={props.items}
              account={props.account}
              reduced={props.reduced}
            />
          </div>
          <p>
            {selected.copyUploads
              ? "The creator permits copying the included uploads. Copies use your storage and daily allowance."
              : "This style shares settings and catalog items. Its private uploads are not copied."}
          </p>
          {(["avatar", "songs", "panels"] as const).map((key) => (
            <label className="ps-checkbox" key={key}>
              <input
                type="checkbox"
                checked={keep[key]}
                onChange={(e) => setKeep({ ...keep, [key]: e.target.checked })}
              />
              Keep my {key === "songs" ? "favorite songs" : key === "panels" ? "Studio panels" : "avatar"}
            </label>
          ))}
          {!props.workspace.canUseCustomTint && (
            <p className="ps-help">
              Custom supporter tints are converted to the nearest basic colors when imported.
            </p>
          )}
          <Action
            onClick={() =>
              void props.onRun(async () => {
                await props.onSaveCurrent?.();
                const key = JSON.stringify([selected.id, chosen.revisionId, keep]);
                if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
                const value = await props.api.request<Preset>(`/v2/styles/${selected.id}/import`, "POST", {
                  revisionId: chosen.revisionId,
                  requestId: request.current!.id,
                  keep,
                  preservePresetId: props.preset.id,
                });
                request.current = null;
                await props.onRefresh();
                await props.onSelectPreset(value.id);
                props.onMessage("Style copied to your own draft. Review it and submit it for approval.");
              })
            }
          >
            Try this style
          </Action>
        </>
      )}
      <h3>Share an approved preset or matching bundle</h3>
      <Field id="ps-share-title" label="Style title">
        <input id="ps-share-title" maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="ps-share-description" label="Description">
        <textarea
          className="resize-none"
          id="ps-share-description"
          rows={3}
          maxLength={500}
          style={{ resize: "none" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {props.workspace.presets
        .filter((p) => p.approvedRevisionId)
        .map((p) => (
          <label key={p.id} className="ps-checkbox">
            <input
              type="checkbox"
              checked={selectedPresets.includes(p.id)}
              disabled={!selectedPresets.includes(p.id) && selectedPresets.length >= 8}
              onChange={(e) =>
                setPresets(
                  e.target.checked ? [...selectedPresets, p.id] : selectedPresets.filter((id) => id !== p.id),
                )
              }
            />
            {p.name} · approved version
          </label>
        ))}
      <label className="ps-checkbox">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Allow members to copy my uploaded media with this style
      </label>
      <p className="ps-help">
        Ordinary gallery withdrawal stops new copies. Existing copies remain. Security removal and
        source-account erasure also remove associated uploads.
      </p>
      <Action
        disabled={!title.trim() || !selectedPresets.length}
        onClick={() =>
          void props.onRun(async () => {
            await props.api.request("/v2/styles", "POST", {
              title: title.trim(),
              description,
              presetIds: selectedPresets,
              copyUploads: consent,
            });
            await props.onRefresh();
            props.onMessage("Shared style submitted for separate moderation.");
          })
        }
      >
        Submit shared style for review
      </Action>
      <h4>My shared styles</h4>
      {props.workspace.shares.map((s) => (
        <div className="ps-field" key={s.id}>
          <strong>
            {s.title} · {s.status}
          </strong>
          {s.reason && <p>{s.reason}</p>}
          {["pending", "approved"].includes(s.status) && (
            <Action
              variant="secondary"
              onClick={() =>
                props.onConfirm({
                  title: "Withdraw shared style?",
                  detail: "This prevents new copies. Existing imported presets remain available.",
                  action: "Withdraw style",
                  run: () =>
                    void props.onRun(async () => {
                      await props.api.request(`/v2/styles/${s.id}`, "DELETE");
                      await props.onRefresh();
                      await refresh();
                    }),
                })
              }
            >
              Withdraw style
            </Action>
          )}
        </div>
      ))}
    </section>
  );
}
