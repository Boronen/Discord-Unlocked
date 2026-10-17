import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";
import {
  DEFAULT_CONFIG,
  type ProfileConfig,
  type EditorState,
  type CatalogItem,
  type MediaAsset,
  type ProfileRevision,
} from "./model.js";
import type {
  WorkspaceState,
  Preset,
  PersonalLibrary,
  StyleShare,
  AutomationRule,
  StudioBadge,
  MediaMetadata,
} from "./studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { ProfilePreview } from "./visuals.js";
import { MediaPicker, type VisualSlot } from "./MediaPicker.js";
import { Thumbnail } from "./CollectibleMedia.js";
import { PreviewFrame } from "./PreviewFrame.js";
import { artworkPalette } from "./palette.js";
export function StudioDialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current!.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ps-studio-dialog ${className}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
    >
      <header>
        <h3>{title}</h3>
        <Action variant="secondary" onClick={() => ref.current?.close()}>
          Close
        </Action>
      </header>
      <div className="ps-studio-dialog-body">{children}</div>
    </dialog>
  );
}
type Props = {
  tab: string;
  api: StudioClient;
  workspace: WorkspaceState;
  state: EditorState;
  config: ProfileConfig;
  preset: Preset;
  items: CatalogItem[];
  account: { id: string; name: string; avatar?: string };
  urls: Record<string, string>;
  reduced: boolean;
  onRun: (task: () => Promise<void>) => Promise<void>;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
  onLibrary: (doc: PersonalLibrary) => Promise<void>;
  onSelectPreset: (id: string) => Promise<void>;
  onConfirm: (value: { title: string; detail: string; action: string; run: () => void }) => void;
  artworkLoader?: (url: string) => Promise<string>;
  onSaveCurrent?: () => Promise<number>;
  activitySuggestions?: { applicationId: string; name: string }[];
};
function PrivateImage({ asset, api }: { asset: MediaAsset; api: StudioClient }) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    let cancel = false;
    void api
      .privateMedia(asset.previewUrl ?? asset.url)
      .then((value) => {
        if (!cancel) setUrl(value);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [asset.id, asset.previewUrl, api]);
  return <Thumbnail url={url} />;
}
function MediaRow({
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
    [black, setBlack] = React.useState(false),
    [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    if (!inspect) return;
    let cancel = false;
    void props.api
      .privateMedia(staticMode && asset.previewUrl ? asset.previewUrl : asset.url)
      .then((value) => {
        if (!cancel) setUrl(value);
      })
      .catch(() => props.onMessage("This preview is unavailable."));
    return () => {
      cancel = true;
    };
  }, [inspect, staticMode, asset.id]);
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
              <p role="status">Loading preview…</p>
            )}
          </div>
          <p className="ps-help">Inspection does not modify your file or preset.</p>
        </StudioDialog>
      )}
    </article>
  );
}
function LibraryPanel(props: Props) {
  const [mediaPage, setMediaPage] = React.useState(0);
  const [name, setName] = React.useState(""),
    [selected, setSelected] = React.useState("favorites"),
    [query, setQuery] = React.useState(""),
    [folder, setFolder] = React.useState("all"),
    [picker, setPicker] = React.useState<VisualSlot | null>(null),
    [kind, setKind] = React.useState<VisualSlot>("effect");
  const library = props.workspace.library;
  const collection = library.collections.find((c) => c.id === selected);
  const ids =
    selected === "favorites"
      ? library.favorites
      : selected === "recent"
        ? library.recent
        : (collection?.items ?? []);
  const folders = [
    ...new Set(
      Object.values(props.workspace.mediaMetadata)
        .map((v) => v.folder)
        .filter(Boolean),
    ),
  ];
  return (
    <section>
      <h3>Personal collections</h3>
      <Field id="ps-library-list" label="Collection">
        <Choice
          id="ps-library-list"
          value={selected}
          onChange={setSelected}
          options={[
            { value: "favorites", label: "Favorites" },
            { value: "recent", label: "Recently applied" },
            ...library.collections.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      <div className="ps-inline">
        <Field id="ps-collection-name" label="New collection name">
          <input
            id="ps-collection-name"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Action
          disabled={!name.trim() || library.collections.length >= props.workspace.capacity}
          onClick={() =>
            void props.onRun(async () => {
              const id = crypto.randomUUID();
              await props.onLibrary({
                ...library,
                collections: [...library.collections, { id, name: name.trim(), items: [] }],
              });
              setSelected(id);
              setName("");
            })
          }
        >
          Create collection
        </Action>
      </div>
      <p className="ps-help">
        {library.collections.length}/{props.workspace.capacity} collections · private to your account
      </p>
      {collection && (
        <div className="ps-actions">
          <Action
            variant="secondary"
            disabled={!name.trim()}
            onClick={() =>
              void props.onRun(() =>
                props.onLibrary({
                  ...library,
                  collections: library.collections.map((c) =>
                    c.id === selected ? { ...c, name: name.trim() } : c,
                  ),
                }),
              )
            }
          >
            Rename to entered name
          </Action>
          <Action
            variant="secondary"
            onClick={() =>
              props.onConfirm({
                title: "Delete collection?",
                detail: `Delete “${collection.name}”? Catalog items and uploaded media are kept.`,
                action: "Delete collection",
                run: () =>
                  void props.onRun(async () => {
                    await props.onLibrary({
                      ...library,
                      collections: library.collections.filter((c) => c.id !== selected),
                    });
                    setSelected("favorites");
                  }),
              })
            }
          >
            Delete collection
          </Action>
        </div>
      )}
      <div className="ps-inline">
        <Field id="ps-collection-kind" label="Appearance type">
          <Choice
            id="ps-collection-kind"
            value={kind}
            onChange={(v) => setKind(v as VisualSlot)}
            options={["effect", "decoration", "nameplate"].map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Action disabled={selected === "recent"} onClick={() => setPicker(kind)}>
          Add catalog item
        </Action>
      </div>
      {!ids.length && (
        <p className="ps-help">This collection is empty. Add an appearance to find it here next time.</p>
      )}
      <div className="ps-library-items">
        {ids.map((id) => {
          const item = props.items.find((v) => v.id === id);
          return (
            <div key={id}>
              <Thumbnail url={item?.staticUrl} />
              <strong>{item?.name ?? `Unavailable item · ${id.slice(0, 12)}`}</strong>
              <Action
                variant="secondary"
                onClick={() =>
                  void props.onRun(() =>
                    props.onLibrary({
                      ...library,
                      favorites:
                        selected === "favorites"
                          ? library.favorites.filter((v) => v !== id)
                          : library.favorites,
                      recent: selected === "recent" ? library.recent.filter((v) => v !== id) : library.recent,
                      collections: library.collections.map((c) =>
                        c.id === selected ? { ...c, items: c.items.filter((v) => v !== id) } : c,
                      ),
                    }),
                  )
                }
              >
                Remove from collection
              </Action>
            </div>
          );
        })}
      </div>
      <h3>Uploaded media</h3>
      <Field id="ps-media-query" label="Search media labels and tags">
        <div className="ps-search">
          <input id="ps-media-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Action variant="secondary" disabled={!query} onClick={() => setQuery("")}>
            Clear
          </Action>
        </div>
      </Field>
      <Field id="ps-media-folder" label="Folder">
        <Choice
          id="ps-media-folder"
          value={folder}
          onChange={setFolder}
          options={[{ value: "all", label: "All folders" }, ...folders.map((v) => ({ value: v, label: v }))]}
        />
      </Field>
      {props.state.assets
        .filter((a) => {
          const meta = props.workspace.mediaMetadata[a.id];
          return (
            (folder === "all" || meta?.folder === folder) &&
            `${meta?.label ?? ""} ${meta?.tags.join(" ") ?? ""} ${a.slot}`
              .toLowerCase()
              .includes(query.toLowerCase())
          );
        })
        .slice(mediaPage * 8, mediaPage * 8 + 8)
        .map((asset) => (
          <MediaRow
            key={asset.id}
            asset={asset}
            metadata={props.workspace.mediaMetadata[asset.id]}
            usage={props.workspace.usage[asset.id] ?? []}
            props={props}
          />
        ))}
      <div className="ps-actions">
        <Action variant="secondary" disabled={!mediaPage} onClick={() => setMediaPage((v) => v - 1)}>
          Previous media
        </Action>
        <span>Media page {mediaPage + 1}</span>
        <Action
          variant="secondary"
          disabled={(mediaPage + 1) * 8 >= props.state.assets.length}
          onClick={() => setMediaPage((v) => v + 1)}
        >
          Next media
        </Action>
      </div>
      {picker && (
        <MediaPicker
          slot={picker}
          config={DEFAULT_CONFIG}
          assets={[]}
          items={props.items}
          account={props.account}
          api={props.api}
          reduced={props.reduced}
          library={library}
          onUse={(value) => {
            const id = value.split(":")[1];
            if (!id) return;
            void props.onRun(() =>
              props.onLibrary({
                ...library,
                favorites:
                  selected === "favorites" ? [...new Set([...library.favorites, id])] : library.favorites,
                collections: library.collections.map((c) =>
                  c.id === selected ? { ...c, items: [...new Set([...c.items, id])] } : c,
                ),
              }),
            );
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
function SharingPanel(props: Props) {
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
function AutomationPanel(props: Props) {
  const [rules, setRules] = React.useState<AutomationRule[]>(props.workspace.automation.rules),
    [enabled, setEnabled] = React.useState(props.workspace.automation.enabled);
  React.useEffect(() => {
    setRules(props.workspace.automation.rules);
    setEnabled(props.workspace.automation.enabled);
  }, [props.workspace.automation.version, props.workspace.automation.enabled]);
  const update = (id: string, patch: Partial<AutomationRule>) =>
    setRules((values) => values.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const approved = props.workspace.presets.filter((p) => p.approvedRevisionId);
  return (
    <section>
      <h3>Automatic preset switching</h3>
      <p>
        The first matching rule wins after 20 seconds. Manual activation pauses automation. Only approved
        presets can be activated. Activity details stay on this device.
      </p>
      <label className="ps-checkbox">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable automation on this device
      </label>
      <Action
        disabled={!approved.length || rules.length >= 20}
        onClick={() =>
          setRules([
            ...rules,
            {
              id: crypto.randomUUID(),
              kind: "music",
              applicationId: "",
              presetId: approved[0]!.id,
              enabled: true,
            },
          ])
        }
      >
        Add rule
      </Action>
      {rules.map((rule, i) => (
        <fieldset className="ps-automation-rule" key={rule.id}>
          <legend>Rule {i + 1}</legend>
          <label className="ps-checkbox">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update(rule.id, { enabled: e.target.checked })}
            />
            Enabled
          </label>
          <Field id={`rule-kind-${rule.id}`} label="When">
            <Choice
              id={`rule-kind-${rule.id}`}
              value={rule.kind}
              onChange={(v) => update(rule.id, { kind: v as AutomationRule["kind"] })}
              options={[
                { value: "game", label: "Playing a game" },
                { value: "music", label: "Listening to music" },
                { value: "online", label: "Online" },
                { value: "idle", label: "Idle" },
                { value: "dnd", label: "Do Not Disturb" },
              ]}
            />
          </Field>
          {rule.kind === "game" && (
            <>
              <Field id={`rule-game-${rule.id}`} label="Game application ID">
                <input
                  id={`rule-game-${rule.id}`}
                  inputMode="numeric"
                  maxLength={20}
                  value={rule.applicationId}
                  onChange={(e) => update(rule.id, { applicationId: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
              {props.activitySuggestions?.map((g) => (
                <Action
                  key={g.applicationId}
                  variant="secondary"
                  onClick={() => update(rule.id, { applicationId: g.applicationId })}
                >
                  Use {g.name}
                </Action>
              ))}
            </>
          )}
          <Field id={`rule-preset-${rule.id}`} label="Activate preset">
            <Choice
              id={`rule-preset-${rule.id}`}
              value={rule.presetId}
              onChange={(id) => update(rule.id, { presetId: id })}
              options={approved.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <div className="ps-actions">
            <Action
              variant="secondary"
              disabled={!i}
              onClick={() => {
                const list = [...rules];
                [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
                setRules(list);
              }}
            >
              Move up
            </Action>
            <Action variant="secondary" onClick={() => setRules(rules.filter((r) => r.id !== rule.id))}>
              Remove rule
            </Action>
          </div>
        </fieldset>
      ))}
      <Action
        onClick={() =>
          void props.onRun(async () => {
            await props.api.request("/v2/me/automation", "PUT", {
              version: props.workspace.automation.version,
              rules,
              enabled,
            });
            await props.onRefresh();
            props.onMessage(
              "Automation saved. If Discord closes, the manual preset returns within 90 seconds.",
            );
          })
        }
      >
        Save automation
      </Action>
    </section>
  );
}
function ReviewPanel(props: Props) {
  const [queue, setQueue] = React.useState<{ profiles: ProfileRevision[]; shares: StyleShare[] }>({
      profiles: [],
      shares: [],
    }),
    [review, setReview] = React.useState<{
      revision: ProfileRevision;
      baseline: ProfileRevision | null;
      assets: MediaAsset[];
      changes: string[];
    } | null>(null),
    [share, setShare] = React.useState<StyleShare | null>(null),
    [urls, setUrls] = React.useState<Record<string, string>>({}),
    [reason, setReason] = React.useState(""),
    [full, setFull] = React.useState(false),
    [phase, setPhase] = React.useState<"" | "intro" | "idle" | "hover">(""),
    [replay, setReplay] = React.useState(0);
  const refresh = async () => setQueue(await props.api.request("/v2/moderation/queue"));
  React.useEffect(() => {
    void props.onRun(refresh);
  }, [props.api]);
  async function loadAssets(assets: MediaAsset[]) {
    const result = await Promise.allSettled(
      assets.map(
        async (a) =>
          [a.id, await props.api.privateMedia(props.reduced && a.previewUrl ? a.previewUrl : a.url)] as const,
      ),
    );
    setUrls(Object.fromEntries(result.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
  }
  async function decide(action: "approve" | "reject") {
    const id = review?.revision.id ?? share?.id;
    if (!id) return;
    await props.api.request(`/v2/moderation/${share ? "styles/" : ""}${id}/decision`, "POST", {
      action,
      reason: reason.trim() || undefined,
    });
    setReview(null);
    setShare(null);
    setReason("");
    await refresh();
    await props.onRefresh();
    props.onMessage(
      action === "approve" ? "The exact submitted version was approved." : "Submission rejected.",
    );
  }
  return (
    <section>
      <h3>Moderation queue</h3>
      <Action variant="secondary" onClick={() => void props.onRun(refresh)}>
        Refresh queue
      </Action>
      {!queue.profiles.length && !queue.shares.length && <p>No pending submissions.</p>}
      {queue.profiles.map((r) => (
        <Action
          key={r.id}
          variant="secondary"
          onClick={() =>
            void props.onRun(async () => {
              const value = await props.api.request<NonNullable<typeof review>>(`/v2/moderation/${r.id}`);
              setReview(value);
              setShare(null);
              await loadAssets(value.assets);
            })
          }
        >
          Review profile · {r.userId} · {r.id.slice(0, 8)}
        </Action>
      ))}
      {queue.shares.map((s) => (
        <Action
          key={s.id}
          variant="secondary"
          onClick={() =>
            void props.onRun(async () => {
              const value = await props.api.request<{ share: StyleShare; assets: MediaAsset[] }>(
                `/v2/styles/${s.id}`,
              );
              setShare(value.share);
              setReview(null);
              await loadAssets(value.assets);
            })
          }
        >
          Review shared style · {s.title}
        </Action>
      ))}
      {(review || share) && (
        <StudioDialog
          title={share ? "Review shared style" : "Compare submitted profile"}
          className="ps-review-dialog"
          onClose={() => {
            setReview(null);
            setShare(null);
          }}
        >
          <div className="ps-actions">
            <label className="ps-checkbox">
              <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
              Full profile
            </label>
            <Field id="ps-review-phase" label="Animation role">
              <Choice
                id="ps-review-phase"
                value={phase}
                onChange={(v) => setPhase(v as typeof phase)}
                options={[
                  { value: "", label: "Automatic" },
                  { value: "intro", label: "Intro" },
                  { value: "idle", label: "Idle" },
                  { value: "hover", label: "Hover" },
                ]}
              />
            </Field>
            <Action variant="secondary" onClick={() => setReplay((v) => v + 1)}>
              Replay
            </Action>
          </div>
          <div className="ps-review-cards">
            {review ? (
              <>
                <div>
                  <h4>Published at submission</h4>
                  <ProfilePreview
                    config={review.baseline?.config ?? DEFAULT_CONFIG}
                    artworkLoader={props.artworkLoader}
                    urls={urls}
                    items={props.items}
                    account={{ name: review.revision.userId }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                    key={`before:${replay}`}
                  />
                </div>
                <div>
                  <h4>Submitted snapshot</h4>
                  <ProfilePreview
                    config={review.revision.config}
                    artworkLoader={props.artworkLoader}
                    urls={urls}
                    items={props.items}
                    account={{ name: review.revision.userId }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                    key={`after:${replay}`}
                  />
                </div>
              </>
            ) : (
              share?.variants.map((v) => (
                <div key={`${v.revisionId}:${replay}`}>
                  <h4>{v.name}</h4>
                  <ProfilePreview
                    config={v.config}
                    urls={urls}
                    items={props.items}
                    account={{ name: share.title }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                  />
                </div>
              ))
            )}
          </div>
          {review && (
            <details open>
              <summary>{review.changes.length} changed fields</summary>
              <ul>
                {review.changes.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
          {share && <p>Upload copying: {share.copyUploads ? "Creator consented" : "Not permitted"}</p>}
          <Field id="ps-review-reason" label="Decision reason" help="A reason is required for rejection.">
            <textarea
              className="resize-none"
              id="ps-review-reason"
              rows={3}
              maxLength={1000}
              style={{ resize: "none" }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="ps-actions">
            <Action onClick={() => void props.onRun(() => decide("approve"))}>Approve exact version</Action>
            <Action
              variant="secondary"
              disabled={!reason.trim()}
              onClick={() => void props.onRun(() => decide("reject"))}
            >
              Reject with reason
            </Action>
          </div>
        </StudioDialog>
      )}
    </section>
  );
}
function AdminPanel(props: Props) {
  const [badges, setBadges] = React.useState<StudioBadge[]>([]),
    [name, setName] = React.useState(""),
    [icon, setIcon] = React.useState("star"),
    [description, setDescription] = React.useState(""),
    [badge, setBadge] = React.useState(""),
    [user, setUser] = React.useState(""),
    [itemId, setItem] = React.useState(""),
    [query, setQuery] = React.useState(""),
    [tags, setTags] = React.useState(""),
    [moods, setMoods] = React.useState(""),
    [colors, setColors] = React.useState(""),
    [progress, setProgress] = React.useState("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const canceled = React.useRef(false);
  React.useEffect(
    () => () => {
      canceled.current = true;
    },
    [],
  );
  React.useEffect(() => {
    void props.onRun(async () => {
      const result = await props.api.request<{ items: StudioBadge[] }>("/v2/admin/badges");
      setBadges(result.items);
      setBadge(result.items[0]?.id ?? "");
    });
  }, [props.api]);
  const item = props.items.find((i) => i.id === itemId);
  React.useEffect(() => {
    setTags(item?.metadata?.tags.join(", ") ?? "");
    setMoods(item?.metadata?.moods.join(", ") ?? "");
    setColors(item?.metadata?.colors.join(", ") ?? "");
  }, [itemId]);
  async function analyze() {
    if (!props.artworkLoader) throw new Error("Native artwork loading is unavailable.");
    canceled.current = false;
    const todo = props.items.filter((i) => !i.metadata?.colors.length);
    let done = 0;
    for (const entry of todo) {
      if (canceled.current) break;
      try {
        const data = await props.artworkLoader(entry.staticUrl),
          image = new Image();
        image.src = data;
        await image.decode();
        if (image.naturalWidth * image.naturalHeight > 16_000_000) continue;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d")!.drawImage(image, 0, 0, 32, 32);
        const palette = artworkPalette(canvas.getContext("2d")!.getImageData(0, 0, 32, 32).data);
        if (palette)
          await props.api.request(`/v2/admin/catalog/${entry.id}`, "PUT", {
            colors: [palette.accent],
            tags: entry.metadata?.tags ?? [],
            moods: entry.metadata?.moods ?? [],
          });
      } catch {
        /* Unsupported thumbnails remain unclassified. */
      }
      done++;
      setProgress(`${done}/${todo.length} thumbnails checked`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    await props.onRefresh();
  }
  return (
    <section>
      <h3>Studio badges</h3>
      <p className="ps-help">
        Community labels only. They do not represent Discord verification or grant permissions.
      </p>
      <Field id="ps-badge-name" label="Badge name">
        <input id="ps-badge-name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="ps-badge-icon" label="Built-in icon">
        <Choice
          id="ps-badge-icon"
          value={icon}
          onChange={setIcon}
          options={["star", "heart", "flask", "crown", "leaf", "fire"].map((v) => ({ value: v, label: v }))}
        />
      </Field>
      <Field id="ps-badge-description" label="Description">
        <input
          id="ps-badge-description"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Action
        disabled={!name.trim()}
        onClick={() =>
          void props.onRun(async () => {
            const result = await props.api.request<{ id: string }>("/v2/admin/badges", "POST", {
              name: name.trim(),
              icon,
              description,
            });
            setBadges([...badges, { id: result.id, name, icon, description, enabled: true }]);
            setBadge(result.id);
            setName("");
          })
        }
      >
        Create badge
      </Action>
      <Field id="ps-assignment-badge" label="Badge">
        <Choice
          id="ps-assignment-badge"
          value={badge}
          onChange={setBadge}
          options={badges.map((b) => ({ value: b.id, label: b.name }))}
        />
      </Field>
      <Field id="ps-assignment-user" label="Community member Discord ID">
        <input
          id="ps-assignment-user"
          inputMode="numeric"
          maxLength={20}
          value={user}
          onChange={(e) => setUser(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <div className="ps-actions">
        {[true, false].map((grant) => (
          <Action
            key={String(grant)}
            variant={grant ? "primary" : "secondary"}
            disabled={!badge || !/^\d{17,20}$/.test(user)}
            onClick={() =>
              void props.onRun(async () => {
                await props.api.request(`/v2/admin/badges/${badge}/assignment`, "POST", {
                  userId: user,
                  grant,
                });
                props.onMessage(grant ? "Studio badge awarded." : "Studio badge revoked.");
              })
            }
          >
            {grant ? "Award badge" : "Revoke badge"}
          </Action>
        ))}
      </div>
      <h3>Catalog labels</h3>
      <Field id="ps-admin-catalog-query" label="Find catalog item">
        <div className="ps-search">
          <input
            id="ps-admin-catalog-query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Action variant="secondary" disabled={!query} onClick={() => setQuery("")}>
            Clear
          </Action>
        </div>
      </Field>
      <Field id="ps-admin-item" label="Catalog item">
        <Choice
          id="ps-admin-item"
          value={itemId}
          onChange={setItem}
          options={[
            { value: "", label: "Choose an item" },
            ...props.items
              .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 30)
              .map((i) => ({ value: i.id, label: i.name })),
          ]}
        />
      </Field>
      {item && (
        <>
          <Thumbnail url={item.staticUrl} />
          <Field id="ps-admin-tags" label="Theme tags (comma separated)">
            <input id="ps-admin-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field id="ps-admin-moods" label="Mood tags (comma separated)">
            <input id="ps-admin-moods" value={moods} onChange={(e) => setMoods(e.target.value)} />
          </Field>
          <Field id="ps-admin-colors" label="Dominant HEX colors (comma separated)">
            <input id="ps-admin-colors" value={colors} onChange={(e) => setColors(e.target.value)} />
          </Field>
          <Action
            onClick={() =>
              void props.onRun(async () => {
                const parts = (v: string) =>
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                await props.api.request(`/v2/admin/catalog/${itemId}`, "PUT", {
                  colors: parts(colors),
                  tags: parts(tags),
                  moods: parts(moods),
                });
                await props.onRefresh();
                props.onMessage("Catalog labels saved.");
              })
            }
          >
            Save catalog labels
          </Action>
        </>
      )}
      <Action
        disabled={!props.artworkLoader || analyzing}
        onClick={() => {
          setAnalyzing(true);
          void analyze()
            .catch(() => props.onMessage("Thumbnail analysis failed. Try again shortly."))
            .finally(() => setAnalyzing(false));
        }}
      >
        Analyze remaining thumbnail colors
      </Action>
      <Action
        variant="secondary"
        onClick={() => {
          canceled.current = true;
        }}
      >
        Stop thumbnail analysis
      </Action>
      {progress && <p role="status">{progress}</p>}
    </section>
  );
}
export function StudioCommunity(props: Props) {
  return props.tab === "library" ? (
    <LibraryPanel {...props} />
  ) : props.tab === "sharing" ? (
    <SharingPanel {...props} />
  ) : props.tab === "automation" ? (
    <AutomationPanel {...props} />
  ) : props.tab === "review" && (props.state.canModerate || props.state.isOwner) ? (
    <ReviewPanel {...props} />
  ) : props.tab === "admin" && props.state.isOwner ? (
    <AdminPanel {...props} />
  ) : null;
}
