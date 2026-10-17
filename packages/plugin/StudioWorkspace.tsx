import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";
import { DEFAULT_CONFIG, assetIds, type ProfileConfig, type EditorState, type CatalogItem } from "./model.js";
import {
  normalizeStudio,
  resolveScene,
  legacyConfig,
  EMPTY_LIBRARY,
  type ProfileConfigV2,
  type WorkspaceState,
  type Preset,
  type SceneConfig,
  type SceneLayer,
  type Surface,
  type StyleShare,
  type PersonalLibrary,
  type AutomationRule,
  type StudioBadge,
} from "./studio-model.js";
import { DraftHistory, type DraftStorage, type DraftBackup } from "./draft-history.js";
import { ProfilePreview } from "./visuals.js";
import { PreviewFrame, PinnedPreview } from "./PreviewFrame.js";
import { MediaPicker, visualNames, visualPatch, type VisualSlot } from "./MediaPicker.js";
import { LayerEditor, BlockEditor } from "./studio-editor-panels.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { useAlbumArtwork, albumStatus } from "./album-art.js";
import { colorProposals, nearestBasic } from "./color-proposals.js";
import { artworkPalette } from "./palette.js";
import { CardExportControls } from "./CardExportControls.js";
import type { GifExporter } from "./gif-recording.js";
import type { LiveMusic } from "./music-surface.js";
import { TINT_PALETTE } from "./tint.js";
import type { PerformanceMode } from "./scene-renderer.js";
import { StudioCommunity, StudioDialog } from "./studio-community.js";
function PresetThumbnail({ preset, state, api }: { preset: Preset; state: EditorState; api: StudioClient }) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    let canceled = false;
    const id = preset.draft.banner ?? preset.draft.avatar;
    const asset = state.assets.find((a) => a.id === id && a.status === "ready");
    if (asset)
      void api
        .privateMedia(asset.previewUrl ?? asset.url)
        .then((v) => {
          if (!canceled) setUrl(v);
        })
        .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [preset.id, preset.version, api]);
  return (
    <div
      className="ps-preset-thumbnail"
      style={{ background: preset.draft.colors?.[0] ?? "var(--ps-input)" }}
    >
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">◌</span>}
    </div>
  );
}
type Props = {
  api: StudioClient;
  account: import("./model.js").ProfileAccount & { id: string };
  state: EditorState;
  items: CatalogItem[];
  reduced: boolean;
  activityCover?: string;
  liveMusic?: LiveMusic;
  artworkLoader?: (url: string) => Promise<string>;
  draftStorage?: DraftStorage;
  onExportCard?: (svg: string, width: number, height: number) => Promise<boolean>;
  gifExporter?: GifExporter;
  onPublished?: () => void;
  onReload: () => Promise<void>;
  onTestProfile?: (id: string | null, config: ProfileConfig) => void | Promise<void>;
  diagnostics?: () => string;
  onClearCache?: () => void;
  refreshShop?: () => Promise<string>;
};
export function ConfirmAction({
  title,
  detail,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
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
      className="ps-confirm"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
    >
      <h3>{title}</h3>
      <p>{detail}</p>
      <div className="ps-actions">
        <Action autoFocus variant="secondary" onClick={() => ref.current?.close()}>
          Cancel
        </Action>
        <Action
          onClick={() => {
            onConfirm();
            ref.current?.close();
          }}
        >
          {action}
        </Action>
      </div>
    </dialog>
  );
}
export function StudioWorkspace({
  api,
  account,
  state,
  items,
  reduced,
  activityCover,
  liveMusic,
  artworkLoader,
  draftStorage,
  onExportCard,
  gifExporter,
  onPublished,
  onReload,
  onTestProfile,
  diagnostics,
  onClearCache,
  refreshShop,
}: Props) {
  const [workspace, setWorkspace] = React.useState<WorkspaceState | null>(null),
    [preset, setPreset] = React.useState<Preset | null>(null),
    [config, setConfig] = React.useState<ProfileConfigV2>(() => normalizeStudio(DEFAULT_CONFIG));
  const [dirty, setDirty] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState(""),
    [message, setMessage] = React.useState("");
  const [tab, setTab] = React.useState("appearance"),
    [surface, setSurface] = React.useState<Surface>("small"),
    [scope, setScope] = React.useState<"base" | Surface>("base"),
    [selectedLayer, setSelectedLayer] = React.useState(""),
    [lockedLayers, setLockedLayers] = React.useState<string[]>([]);
  const [picker, setPicker] = React.useState<VisualSlot | null>(null),
    [compare, setCompare] = React.useState<"draft" | "published" | "original" | "side">("draft"),
    [phase, setPhase] = React.useState<SceneLayer["phase"] | "">(""),
    [replay, setReplay] = React.useState(0),
    [quality, setQuality] = React.useState<PerformanceMode>("auto");
  const [paletteSource, setPaletteSource] = React.useState("artwork");
  const [publication, setPublication] = React.useState<{ id: string; code: string } | null>(null),
    [testId, setTestId] = React.useState("");
  const [presetBrowser, setPresetBrowser] = React.useState(false),
    [presetPage, setPresetPage] = React.useState(0);
  const [name, setName] = React.useState(""),
    [backup, setBackup] = React.useState<DraftBackup | null>(null),
    [confirm, setConfirm] = React.useState<{
      title: string;
      detail: string;
      action: string;
      run: () => void;
    } | null>(null);
  const [urls, setUrls] = React.useState<Record<string, string>>({}),
    [songInput, setSongInput] = React.useState(""),
    [activateOnApproval, setActivateOnApproval] = React.useState(true);
  const history = React.useRef(new DraftHistory(config)),
    operation = React.useRef(false),
    alive = React.useRef(true),
    loading = React.useRef(0),
    preview = React.useRef<HTMLDivElement>(null),
    root = React.useRef<HTMLElement>(null),
    current = React.useRef(config),
    currentPreset = React.useRef(preset),
    dirtyRef = React.useRef(dirty);
  current.current = config;
  currentPreset.current = preset;
  dirtyRef.current = dirty;
  const scene = { ...config.studio.base, ...(scope === "base" ? {} : config.studio[scope]) };
  const displayScene = resolveScene(config, surface);
  const album = useAlbumArtwork(
    config.musicPriority === false ? undefined : activityCover,
    config.studio.songs[0]?.artwork,
    displayScene.albumBackground.enabled || !!config.musicPriority,
    artworkLoader,
  );
  const custom = workspace?.canUseCustomTint ?? state.isOwner;
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      loading.current++;
    };
  }, []);
  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : "The action failed.");
        root.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
      }
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function loadWorkspace() {
    const value = await api.workspace();
    if (alive.current) {
      setWorkspace(value);
      setPreset((previous) => {
        const updated = value.presets.find((p) => p.id === previous?.id);
        return previous && updated
          ? { ...previous, approvedRevisionId: updated.approvedRevisionId, approved: updated.approved }
          : previous;
      });
    }
    return value;
  }
  async function selectPreset(id: string) {
    const generation = ++loading.current;
    if (dirtyRef.current && currentPreset.current && draftStorage)
      await draftStorage.save({
        name,
        version: 1,
        userId: account.id,
        base: api.base,
        presetId: currentPreset.current.id,
        serverVersion: currentPreset.current.version,
        savedAt: new Date().toISOString(),
        config: current.current,
      });
    const value = await api.request<Preset>(`/v2/me/presets/${id}`);
    if (!alive.current || generation !== loading.current) return;
    const doc = normalizeStudio(value.draft);
    setPreset(value);
    setName(value.name);
    setConfig(doc);
    history.current = new DraftHistory(doc);
    setDirty(false);
    setBackup(null);
    setMessage("");
    setSelectedLayer("");
    setActivateOnApproval(
      !workspace?.activeRevisionId || workspace?.manualRevisionId === value.approvedRevisionId,
    );
    if (draftStorage) {
      const saved = await draftStorage.load(account.id, api.base, id);
      if (
        alive.current &&
        generation === loading.current &&
        saved &&
        (JSON.stringify(normalizeStudio(saved.config)) !== JSON.stringify(doc) ||
          (saved.name && saved.name !== value.name))
      )
        setBackup(saved);
    }
  }
  React.useEffect(() => {
    void run(async () => {
      const value = await loadWorkspace();
      if (value.presets[0]) await selectPreset(value.presets[0].id);
    });
  }, [api, account.id]);
  function change(value: ProfileConfig | ((value: ProfileConfigV2) => ProfileConfig), group = "edit") {
    setPublication(null);
    const next = normalizeStudio(typeof value === "function" ? value(current.current) : value);
    const canonical = { ...legacyConfig(next), configVersion: 2 as const, studio: next.studio };
    history.current.push(canonical, group);
    current.current = canonical;
    setConfig(canonical);
    setDirty(true);
    setMessage("");
  }
  const changeScene = (next: SceneConfig, group = "scene") =>
    change((value) => ({ ...value, studio: { ...value.studio, [scope]: next } }), group);
  React.useEffect(() => {
    if (!dirty || !preset || !draftStorage) return;
    let canceled = false;
    const timer = setTimeout(() => {
      void draftStorage
        .save({
          version: 1,
          userId: account.id,
          base: api.base,
          presetId: preset.id,
          serverVersion: preset.version,
          savedAt: new Date().toISOString(),
          config,
          name,
        })
        .catch(() => {
          if (!canceled && alive.current)
            setError("Local recovery could not be saved. Save your draft before restarting Discord.");
        });
    }, 500);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [config, name, dirty, preset?.id, preset?.version, draftStorage, account.id, api.base]);
  React.useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  const ids = [
    ...new Set([
      ...assetIds(config),
      ...assetIds(preset?.approved?.config ?? DEFAULT_CONFIG),
      ...assetIds(state.published?.config ?? DEFAULT_CONFIG),
    ]),
  ].join(",");
  React.useEffect(() => {
    let cancel = false;
    const needed = new Set(ids.split(","));
    void Promise.allSettled(
      state.assets
        .filter((a) => a.status === "ready" && needed.has(a.id))
        .flatMap((a) => [a, ...(a.previewUrl ? [{ ...a, id: `${a.id}:static`, url: a.previewUrl }] : [])])
        .map(
          async (a) =>
            [
              a.id,
              await api.privateMedia((reduced || quality === "low") && a.previewUrl ? a.previewUrl : a.url),
            ] as const,
        ),
    ).then((result) => {
      if (!cancel)
        setUrls(Object.fromEntries(result.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
    });
    return () => {
      cancel = true;
    };
  }, [ids, state.assets, api, reduced, quality]);
  async function save() {
    if (!preset) return 0;
    const result = await api.request<{ version: number }>(`/v2/me/presets/${preset.id}`, "PUT", {
      version: preset.version,
      config: current.current,
      name,
    });
    setPreset((p) => (p ? { ...p, version: result.version, draft: current.current, name } : p));
    setDirty(false);
    dirtyRef.current = false;
    if (draftStorage) await draftStorage.remove(account.id, api.base, preset.id);
    setMessage("Preset draft saved. Your approved appearance has not changed.");
    await loadWorkspace();
    return result.version;
  }
  async function saveLibrary(document: PersonalLibrary) {
    if (!workspace) return;
    const result = await api.request<{ version: number }>("/v2/me/library", "PUT", {
      version: workspace.libraryVersion,
      document,
    });
    setWorkspace((w) => (w ? { ...w, library: document, libraryVersion: result.version } : w));
  }
  async function applyGenerated() {
    if (!artworkLoader) throw new Error("Artwork loading is unavailable.");
    const url = paletteSource === "artwork" ? (activityCover ?? config.studio.songs[0]?.artwork) : undefined;
    let source: string;
    if (url) source = await artworkLoader(url);
    else if (paletteSource === "banner" && config.banner && urls[config.banner])
      source = urls[config.banner]!;
    else throw new Error("Choose a banner or a song with artwork first.");
    const img = new Image();
    img.src = source;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 16_000_000) throw new Error("This image is too large.");
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    c.getContext("2d")!.drawImage(img, 0, 0, 32, 32);
    const colors = artworkPalette(c.getContext("2d")!.getImageData(0, 0, 32, 32).data);
    if (!colors) throw new Error("No usable colors were found in this image.");
    setPalette(colors);
  }
  const [palette, setPalette] = React.useState<ReturnType<typeof artworkPalette>>(null);
  const selectedConfig =
    compare === "original"
      ? DEFAULT_CONFIG
      : compare === "published"
        ? (state.published?.config ?? DEFAULT_CONFIG)
        : config;
  const tabs = [
    "appearance",
    "layers",
    "panels",
    "music",
    "library",
    "sharing",
    "automation",
    ...(state.canModerate || state.isOwner ? ["review"] : []),
    ...(state.isOwner ? ["admin"] : []),
  ];
  if (!workspace || !preset)
    return (
      <div>
        {error ? <p role="alert">{error}</p> : <p role="status">Loading Studio workspace…</p>}
        {!busy && (
          <Action
            onClick={() =>
              void run(async () => {
                const w = await loadWorkspace();
                if (w.presets[0]) await selectPreset(w.presets[0].id);
              })
            }
          >
            Try again
          </Action>
        )}
      </div>
    );
  return (
    <section
      ref={root}
      className="ps-workspace"
      aria-label="Studio workspace"
      onPointerDownCapture={() => history.current.begin()}
      onPointerUpCapture={() => history.current.end()}
      onPointerCancelCapture={() => history.current.end()}
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z" &&
          !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)
        ) {
          event.preventDefault();
          const value = event.shiftKey ? history.current.redo() : history.current.undo();
          current.current = normalizeStudio(value);
          setConfig(current.current);
          setDirty(true);
        }
      }}
    >
      <div className="ps-workspace-toolbar">
        <Field
          id="ps-current-preset"
          label={`Saved presets · ${workspace.presets.length}/${workspace.capacity}`}
        >
          <Choice
            id="ps-current-preset"
            value={preset.id}
            disabled={busy}
            onChange={(id) => void run(() => selectPreset(id))}
            options={workspace.presets.map((p) => ({
              value: p.id,
              label: `${p.name}${p.approvedRevisionId ? " · approved" : " · draft"}`,
            }))}
          />
        </Field>
        <Field id="ps-preset-name" label="Preset name">
          <input
            id="ps-preset-name"
            maxLength={64}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <div className="ps-actions">
          <Action variant="secondary" disabled={busy} onClick={() => setPresetBrowser(true)}>
            Browse saved presets
          </Action>
          <Action
            disabled={busy || workspace.presets.length >= workspace.capacity}
            onClick={() =>
              void run(async () => {
                const p = await api.request<Preset>("/v2/me/presets", "POST", { name: "New preset" });
                await loadWorkspace();
                await selectPreset(p.id);
              })
            }
          >
            New preset
          </Action>
          <Action
            variant="secondary"
            disabled={busy || workspace.presets.length >= workspace.capacity}
            onClick={() =>
              void run(async () => {
                if (dirtyRef.current) await save();
                const p = await api.request<Preset>("/v2/me/presets", "POST", {
                  name: `${name.slice(0, 55)} copy`,
                  sourceId: preset.id,
                });
                await loadWorkspace();
                await selectPreset(p.id);
              })
            }
          >
            Duplicate
          </Action>
          <Action
            variant="secondary"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: "Delete preset?",
                detail: `Delete “${preset.name}”? Active presets, your original preset and pending reviews must be kept. Media is not deleted with a preset.`,
                action: "Delete preset",
                run: () =>
                  void run(async () => {
                    await api.request(`/v2/me/presets/${preset.id}`, "DELETE");
                    const next = await loadWorkspace();
                    await selectPreset(next.presets[0]!.id);
                  }),
              })
            }
          >
            Delete
          </Action>
        </div>
      </div>
      <div className="ps-workspace-status" aria-live="polite">
        {busy ? (
          <p role="status">Working…</p>
        ) : (
          <p>{dirty ? "Unsaved local draft" : `Saved preset · version ${preset.version}`}</p>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <div>
            <p role="alert" tabIndex={-1}>
              {error}
            </p>
            <Action
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => selectPreset(preset.id))}
            >
              Reload saved preset and compare recovery
            </Action>
          </div>
        )}
      </div>
      {backup && (
        <div className="ps-recovery">
          <h3>Recover your local draft</h3>
          <p>
            {backup.serverVersion === preset.version
              ? "A previous local draft is available."
              : "The saved preset changed on another device. Restoring keeps the current server version and makes your recovered draft a new local edit."}
          </p>
          <div className="ps-actions">
            <Action
              onClick={() => {
                change(backup.config, "recover");
                if (backup.name) setName(backup.name);
                setBackup(null);
              }}
            >
              Restore local draft
            </Action>
            <Action
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  await draftStorage?.remove(account.id, api.base, preset.id);
                  setBackup(null);
                })
              }
            >
              Use saved preset
            </Action>
          </div>
        </div>
      )}
      <nav className="ps-workspace-tabs" aria-label="Studio sections">
        {tabs.map((value) => (
          <button
            type="button"
            key={value}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      <div className="ps-editor-layout">
        <form
          noValidate
          className="ps-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await save();
            });
          }}
        >
          <fieldset disabled={busy} className="ps-fields">
            <div className="ps-actions">
              <Action
                variant="secondary"
                disabled={!history.current.past.length}
                onClick={() => {
                  const next = normalizeStudio(history.current.undo());
                  current.current = next;
                  setConfig(next);
                  setDirty(true);
                }}
              >
                Undo
              </Action>
              <Action
                variant="secondary"
                disabled={!history.current.future.length}
                onClick={() => {
                  const next = normalizeStudio(history.current.redo());
                  current.current = next;
                  setConfig(next);
                  setDirty(true);
                }}
              >
                Redo
              </Action>
            </div>
            {["appearance", "layers", "panels"].includes(tab) && (
              <div className="ps-scene-scope">
                <Field id="ps-scene-scope" label="Editing scope">
                  <Choice
                    id="ps-scene-scope"
                    value={scope}
                    onChange={(value) => {
                      setScope(value as typeof scope);
                      if (value !== "base") setSurface(value as Surface);
                    }}
                    options={[
                      { value: "base", label: "Shared base scene" },
                      { value: "small", label: "Small profile override" },
                      { value: "full", label: "Full profile override" },
                    ]}
                  />
                </Field>
                {scope !== "base" && (
                  <Action
                    variant="secondary"
                    onClick={() =>
                      change((value) => ({ ...value, studio: { ...value.studio, [scope]: {} } }))
                    }
                  >
                    Reset to shared scene
                  </Action>
                )}
              </div>
            )}
            {tab === "appearance" && (
              <section>
                <h3>Appearance</h3>
                {state.isOwner && refreshShop && (
                  <Action
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        setMessage(await refreshShop());
                      })
                    }
                  >
                    Refresh Discord Shop catalog
                  </Action>
                )}
                <p className="ps-help">Use /profile upload in the community server to add media.</p>
                <Action
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      await onReload();
                      await loadWorkspace();
                    })
                  }
                >
                  Refresh uploads and status
                </Action>
                <div className="ps-appearance-choices">
                  {(["avatar", "decoration", "banner", "nameplate"] as VisualSlot[]).map((slot) => (
                    <div key={slot} className="ps-appearance-choice">
                      <strong>{visualNames[slot]}</strong>
                      <Action variant="secondary" onClick={() => setPicker(slot)}>
                        Browse {visualNames[slot].toLowerCase()}
                      </Action>
                    </div>
                  ))}
                </div>
                <fieldset className="ps-album-controls">
                  <legend>Album artwork background</legend>
                  <label className="ps-checkbox">
                    <input
                      type="checkbox"
                      checked={scene.albumBackground.enabled}
                      onChange={(e) =>
                        changeScene({
                          ...scene,
                          albumBackground: { ...scene.albumBackground, enabled: e.target.checked },
                        })
                      }
                    />
                    Use album artwork behind your profile
                  </label>
                  {scene.albumBackground.enabled && (
                    <>
                      <Field
                        id="ps-v2-opacity"
                        label={`Opacity · ${Math.round(scene.albumBackground.opacity * 100)}%`}
                      >
                        <input
                          id="ps-v2-opacity"
                          type="range"
                          min="0"
                          max="1"
                          step=".05"
                          value={scene.albumBackground.opacity}
                          onChange={(e) =>
                            changeScene(
                              {
                                ...scene,
                                albumBackground: {
                                  ...scene.albumBackground,
                                  opacity: Number(e.target.value),
                                },
                              },
                              "album-opacity",
                            )
                          }
                        />
                      </Field>
                      <Field id="ps-v2-blur" label={`Blur · ${scene.albumBackground.blur}px`}>
                        <input
                          id="ps-v2-blur"
                          type="range"
                          min="0"
                          max="32"
                          step="1"
                          value={scene.albumBackground.blur}
                          onChange={(e) =>
                            changeScene(
                              {
                                ...scene,
                                albumBackground: { ...scene.albumBackground, blur: Number(e.target.value) },
                              },
                              "album-blur",
                            )
                          }
                        />
                      </Field>
                      <p role="status">{albumStatus(album)}</p>
                    </>
                  )}
                </fieldset>
                <label className="ps-checkbox">
                  <input
                    type="checkbox"
                    checked={!!scene.colors}
                    onChange={(e) =>
                      changeScene({ ...scene, colors: e.target.checked ? ["#26344a", "#161a2b"] : null })
                    }
                  />
                  Custom profile colors
                </label>
                {scene.colors && (
                  <div className="ps-two-col">
                    {scene.colors.map((color, index) => (
                      <Field
                        key={index}
                        id={`ps-v2-profile-color-${index}`}
                        label={index ? "Secondary color" : "Primary color"}
                      >
                        <input
                          id={`ps-v2-profile-color-${index}`}
                          type="color"
                          value={color}
                          onChange={(e) =>
                            changeScene(
                              {
                                ...scene,
                                colors: scene.colors!.map((v, i) => (i === index ? e.target.value : v)) as [
                                  string,
                                  string,
                                ],
                              },
                              `profile-color-${index}`,
                            )
                          }
                        />
                      </Field>
                    ))}
                  </div>
                )}
                <Field id="ps-palette-source" label="Generate colors from">
                  <Choice
                    id="ps-palette-source"
                    value={paletteSource}
                    onChange={setPaletteSource}
                    options={[
                      { value: "artwork", label: "Album artwork" },
                      { value: "banner", label: "My banner" },
                    ]}
                  />
                </Field>
                <Action onClick={() => void run(applyGenerated)}>Generate color suggestions</Action>
                {palette && (
                  <div className="ps-palette-options">
                    {colorProposals(palette).map((option) => (
                      <button
                        type="button"
                        key={option.name}
                        style={{
                          background: option.primary,
                          color: palette.text,
                          borderColor: option.accent,
                        }}
                        onClick={() => {
                          const tint = custom ? option.accent : nearestBasic(option.accent);
                          change((value) => ({
                            ...value,
                            decorationTint: { color: tint, intensity: option.intensity },
                            music: { ...value.music, background: option.primary, color: option.accent },
                            studio: {
                              ...value.studio,
                              [scope]: {
                                ...scene,
                                colors: [option.primary, option.secondary],
                                layers: scene.layers.map((l) => ({
                                  ...l,
                                  tint: { color: tint, intensity: option.intensity },
                                })),
                              },
                            },
                          }));
                        }}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                )}
                <label className="ps-checkbox">
                  <input
                    type="checkbox"
                    checked={!config.studio.hiddenBadges.length}
                    onChange={(e) =>
                      change({
                        ...config,
                        studio: {
                          ...config.studio,
                          hiddenBadges: e.target.checked ? [] : workspace.badges.map((b) => b.id),
                        },
                      })
                    }
                  />
                  Show my Studio badges
                </label>
              </section>
            )}
            {tab === "layers" && (
              <LayerEditor
                scene={scene}
                onChange={changeScene}
                selected={selectedLayer}
                onSelect={setSelectedLayer}
                lockedLayers={lockedLayers}
                onLock={(id, locked) =>
                  setLockedLayers((current) =>
                    locked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
                  )
                }
                config={config}
                items={items}
                assets={state.assets}
                api={api}
                account={account}
                custom={custom}
                library={workspace.library}
                onLibraryChange={(doc) => void run(() => saveLibrary(doc))}
                reduced={reduced}
                albumUrl={album.url}
              />
            )}
            {tab === "panels" && <BlockEditor scene={scene} onChange={changeScene} />}
            {tab === "music" && (
              <section>
                <Field
                  id="ps-music-priority"
                  label="Music priority"
                  help={
                    api.musicPrioritySupported
                      ? "Current Discord music replaces the favorite card and supplies the profile artwork and colors. Favorites return when playback stops. Save and submit this setting for approval."
                      : "The server must be updated before current-music priority can be saved."
                  }
                >
                  <Choice
                    id="ps-music-priority"
                    value={config.musicPriority ? "activity" : "favorites"}
                    disabled={!api.musicPrioritySupported}
                    onChange={(value) => change({ ...config, musicPriority: value === "activity" })}
                    options={[
                      { value: "favorites", label: "Favorite songs" },
                      { value: "activity", label: "Current Discord music first" },
                    ]}
                  />
                </Field>
                <h3>Favorite songs</h3>
                <p>Choose up to three songs. Playback opens only when a viewer chooses Play.</p>
                <Field id="ps-v2-song" label="Song link">
                  <input
                    id="ps-v2-song"
                    type="url"
                    value={songInput}
                    placeholder="https://open.spotify.com/track/…"
                    onChange={(e) => setSongInput(e.target.value)}
                  />
                </Field>
                <Action
                  disabled={!songInput || config.studio.songs.length >= 3}
                  onClick={() =>
                    void run(async () => {
                      const song = await api.resolveSong(songInput);
                      if (config.studio.songs.some((s) => s.url === song.url))
                        throw new Error("This song is already in your favorites.");
                      change((value) => ({
                        ...value,
                        studio: { ...value.studio, songs: [...value.studio.songs, song] },
                      }));
                      setSongInput("");
                    })
                  }
                >
                  Add favorite song
                </Action>
                {config.studio.songs.map((song, i) => (
                  <div className="ps-song-editor" key={song.url}>
                    <Field id={`ps-song-title-${i}`} label={`Song ${i + 1} title`}>
                      <input
                        id={`ps-song-title-${i}`}
                        maxLength={200}
                        value={song.title}
                        onChange={(e) =>
                          change(
                            (value) => ({
                              ...value,
                              studio: {
                                ...value.studio,
                                songs: value.studio.songs.map((s, index) =>
                                  index === i ? { ...s, title: e.target.value } : s,
                                ),
                              },
                            }),
                            `song-title-${i}`,
                          )
                        }
                      />
                    </Field>
                    <Field id={`ps-song-artist-${i}`} label="Artist">
                      <input
                        id={`ps-song-artist-${i}`}
                        maxLength={200}
                        value={song.artist}
                        onChange={(e) =>
                          change(
                            (value) => ({
                              ...value,
                              studio: {
                                ...value.studio,
                                songs: value.studio.songs.map((s, index) =>
                                  index === i ? { ...s, artist: e.target.value } : s,
                                ),
                              },
                            }),
                            `song-artist-${i}`,
                          )
                        }
                      />
                    </Field>
                    <div className="ps-actions">
                      <Action
                        variant="secondary"
                        disabled={!i}
                        onClick={() =>
                          change((value) => {
                            const songs = [...value.studio.songs];
                            [songs[i - 1], songs[i]] = [songs[i]!, songs[i - 1]!];
                            return { ...value, studio: { ...value.studio, songs } };
                          })
                        }
                      >
                        Move up
                      </Action>
                      <Action
                        variant="secondary"
                        onClick={() =>
                          change((value) => ({
                            ...value,
                            studio: {
                              ...value.studio,
                              songs: value.studio.songs.filter((_, index) => index !== i),
                            },
                          }))
                        }
                      >
                        Remove song
                      </Action>
                    </div>
                  </div>
                ))}
                <Field id="ps-v2-music-mode" label="Music color mode">
                  <Choice
                    id="ps-v2-music-mode"
                    value={config.music.mode}
                    onChange={(mode) =>
                      change({ ...config, music: { ...config.music, mode: mode as "manual" | "artwork" } })
                    }
                    options={[
                      { value: "artwork", label: "Automatic, from artwork" },
                      { value: "manual", label: "Custom color" },
                    ]}
                  />
                </Field>
                <Field id="ps-v2-music-bg" label="Fallback background color">
                  <input
                    id="ps-v2-music-bg"
                    type="color"
                    value={config.music.background}
                    onChange={(e) =>
                      change(
                        { ...config, music: { ...config.music, background: e.target.value } },
                        "music-color",
                      )
                    }
                  />
                </Field>
                <Field id="ps-v2-music-animation" label="Music card animation">
                  <Choice
                    id="ps-v2-music-animation"
                    value={config.music.preset}
                    onChange={(value) =>
                      change({
                        ...config,
                        music: { ...config.music, preset: value as typeof config.music.preset },
                      })
                    }
                    options={["none", "glow", "gradient", "particles"].map((v) => ({ value: v, label: v }))}
                  />
                </Field>
              </section>
            )}
            {tab === "music" && (
              <>
                <div className="ps-two-col">
                  <Field id="ps-music-effect-color" label="Music effect color">
                    <input
                      id="ps-music-effect-color"
                      type="color"
                      value={config.music.color}
                      onChange={(e) =>
                        change({ ...config, music: { ...config.music, color: e.target.value } }, "music-tint")
                      }
                    />
                  </Field>
                  <Field id="ps-music-speed" label="Music effect speed">
                    <input
                      id="ps-music-speed"
                      type="range"
                      min=".25"
                      max="3"
                      step=".25"
                      value={config.music.speed}
                      onChange={(e) =>
                        change(
                          { ...config, music: { ...config.music, speed: Number(e.target.value) } },
                          "music-speed",
                        )
                      }
                    />
                  </Field>
                </div>
                <Field id="ps-music-strength" label="Music effect strength">
                  <input
                    id="ps-music-strength"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={config.music.intensity}
                    onChange={(e) =>
                      change(
                        { ...config, music: { ...config.music, intensity: Number(e.target.value) } },
                        "music-strength",
                      )
                    }
                  />
                </Field>
                <Field
                  id="ps-uploaded-audio"
                  label="Optional profile sound"
                  help="Used only when there are no favorite songs."
                >
                  <Choice
                    id="ps-uploaded-audio"
                    value={config.audio ?? ""}
                    onChange={(audio) => change({ ...config, audio: audio || null })}
                    options={[
                      { value: "", label: "No profile sound" },
                      ...state.assets
                        .filter((a) => a.slot === "audio" && a.status === "ready")
                        .map((a) => ({
                          value: a.id,
                          label:
                            workspace.mediaMetadata[a.id]?.label ||
                            `Uploaded sound · ${new Date(a.createdAt).toLocaleDateString("en-US")}`,
                        })),
                    ]}
                  />
                </Field>
                {config.audio && urls[config.audio] && (
                  <audio controls src={urls[config.audio]} preload="none" />
                )}
              </>
            )}
            {["library", "sharing", "automation", "review", "admin"].includes(tab) && (
              <StudioCommunity
                tab={tab}
                api={api}
                workspace={workspace}
                state={state}
                config={config}
                preset={preset}
                items={items}
                account={account}
                urls={urls}
                reduced={reduced}
                onRun={run}
                onMessage={setMessage}
                onRefresh={async () => {
                  await loadWorkspace();
                  await onReload();
                }}
                onLibrary={saveLibrary}
                onSelectPreset={selectPreset}
                onConfirm={setConfirm}
                artworkLoader={artworkLoader}
                onSaveCurrent={save}
              />
            )}
            <section className="ps-workspace-save">
              {tab === "admin" && state.isOwner && (
                <details>
                  <summary>Owner test tools</summary>
                  <Action
                    onClick={() =>
                      void run(async () => {
                        const version = dirty ? await save() : preset.version;
                        setPublication(
                          await api.request(`/v2/me/presets/${preset.id}/publish-confirmation`, "POST", {
                            version,
                          }),
                        );
                      })
                    }
                  >
                    Prepare test publication
                  </Action>
                  {publication && (
                    <>
                      <Field
                        id="ps-v2-confirmation"
                        label="Confirm once with the bot"
                        help="This code is valid for five minutes and only for this saved preset."
                      >
                        <input
                          id="ps-v2-confirmation"
                          readOnly
                          value={`/profile confirm code:${publication.code}`}
                          onFocus={(e) => e.target.select()}
                        />
                      </Field>
                      <Action
                        disabled={dirty}
                        onClick={() =>
                          void run(async () => {
                            await api.request(`/v2/me/presets/${preset.id}/test-publication`, "POST", {
                              version: preset.version,
                              confirmationId: publication.id,
                            });
                            setPublication(null);
                            await loadWorkspace();
                            await onReload();
                            onPublished?.();
                            setMessage("Confirmed test preset published.");
                          })
                        }
                      >
                        Publish confirmed preset
                      </Action>
                    </>
                  )}
                  {onTestProfile && (
                    <>
                      <Field id="ps-v2-local-user" label="Discord user ID for a local test">
                        <input
                          id="ps-v2-local-user"
                          inputMode="numeric"
                          value={testId}
                          maxLength={20}
                          onChange={(e) => setTestId(e.target.value.replace(/\D/g, ""))}
                        />
                      </Field>
                      <div className="ps-actions">
                        <Action
                          disabled={!/^\d{17,20}$/.test(testId)}
                          onClick={() =>
                            void run(async () => {
                              await onTestProfile(testId, config);
                              setMessage("Local test enabled. No other account was modified.");
                            })
                          }
                        >
                          Apply local test
                        </Action>
                        <Action
                          variant="secondary"
                          onClick={() =>
                            void run(async () => {
                              await onTestProfile(null, config);
                              setMessage("Local tests cleared.");
                            })
                          }
                        >
                          Clear local test
                        </Action>
                      </div>
                    </>
                  )}
                  {onClearCache && (
                    <Action variant="secondary" onClick={onClearCache}>
                      Clear display cache
                    </Action>
                  )}
                  {diagnostics && <pre className="ps-diagnostics">{diagnostics()}</pre>}
                </details>
              )}
              <h3>Save and review</h3>
              <label className="ps-checkbox">
                <input
                  type="checkbox"
                  checked={activateOnApproval}
                  onChange={(e) => setActivateOnApproval(e.target.checked)}
                />
                Use this preset after approval
              </label>
              <div className="ps-actions">
                <Action
                  disabled={busy || (!dirty && name === preset.name)}
                  onClick={() =>
                    void run(async () => {
                      await save();
                    })
                  }
                >
                  Save preset
                </Action>
                <Action
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const version = dirty || name !== preset.name ? await save() : preset.version;
                      await api.request(`/v2/me/presets/${preset.id}/submit`, "POST", {
                        version,
                        activate: activateOnApproval,
                      });
                      await loadWorkspace();
                      await onReload();
                      setMessage("Preset submitted for review. The submitted snapshot cannot change.");
                    })
                  }
                >
                  Submit preset for review
                </Action>
                <Action
                  variant="secondary"
                  disabled={busy || !preset.approvedRevisionId}
                  onClick={() =>
                    void run(async () => {
                      await api.request(`/v2/me/presets/${preset.id}/activate`, "POST", {});
                      await loadWorkspace();
                      onPublished?.();
                      setMessage(
                        "Approved preset activated. Automation is paused until you enable it again.",
                      );
                    })
                  }
                >
                  Activate approved preset
                </Action>
              </div>
            </section>
            <section aria-label="Profile card export">
              <CardExportControls
                disabled={busy}
                getCard={() =>
                  preview.current
                    ?.querySelectorAll<HTMLElement>(".ps-profile")
                    .item(compare === "side" ? 1 : 0)
                }
                artworkLoader={artworkLoader}
                png={onExportCard}
                gif={gifExporter}
              />
            </section>
          </fieldset>
        </form>
        <PinnedPreview>
          <div className="ps-preview-toolbar">
            <h3>Live preview</h3>
            <Field id="ps-preview-surface" label="Profile view">
              <Choice
                id="ps-preview-surface"
                value={surface}
                onChange={(v) => setSurface(v as Surface)}
                options={[
                  { value: "small", label: "Small profile" },
                  { value: "full", label: "Full profile" },
                ]}
              />
            </Field>
            <Field id="ps-preview-version" label="Compare">
              <Choice
                id="ps-preview-version"
                value={compare}
                onChange={(v) => setCompare(v as typeof compare)}
                options={[
                  { value: "draft", label: "Local draft" },
                  { value: "published", label: "Published profile" },
                  { value: "original", label: "Original Discord" },
                  { value: "side", label: "Before / after" },
                ]}
              />
            </Field>
            <details className="ps-preview-options">
              <summary>Animation and quality</summary>
              <Field id="ps-preview-phase" label="Preview phase">
                <Choice
                  id="ps-preview-phase"
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
                Replay animation
              </Action>
              <Field id="ps-preview-quality" label="Performance">
                <Choice
                  id="ps-preview-quality"
                  value={quality}
                  onChange={(v) => setQuality(v as PerformanceMode)}
                  options={["auto", "quality", "low"].map((v) => ({ value: v, label: v }))}
                />
              </Field>
            </details>
          </div>
          <PreviewFrame width={compare === "side" ? 616 : 300}>
            <div className={compare === "side" ? "ps-compare-cards" : ""} ref={preview}>
              {compare === "side" && (
                <div>
                  <small>Published profile</small>
                  <ProfilePreview
                    config={state.published?.config ?? DEFAULT_CONFIG}
                    urls={urls}
                    items={items}
                    account={account}
                    full={surface === "full"}
                    reduced={true}
                  />
                </div>
              )}
              <ProfilePreview
                key={`${preset.id}:${replay}`}
                config={selectedConfig}
                originalView={compare === "original"}
                artworkLoader={artworkLoader}
                urls={urls}
                items={items}
                account={account}
                full={surface === "full"}
                reduced={reduced || quality === "low"}
                performanceMode={quality}
                forcedPhase={phase || undefined}
                albumUrl={album.url}
                liveMusic={liveMusic}
                badges={workspace.badges.filter((b) => !config.studio.hiddenBadges.includes(b.id))}
                sceneEditor={
                  tab === "layers" && compare === "draft"
                    ? {
                        selected: selectedLayer,
                        lockedLayers,
                        onSelect: setSelectedLayer,
                        onTransform: (id, transform) =>
                          changeScene(
                            {
                              ...scene,
                              layers: scene.layers.map((l) => (l.id === id ? { ...l, transform } : l)),
                            },
                            "layer-transform",
                          ),
                      }
                    : undefined
                }
              />
            </div>
          </PreviewFrame>
          <p className="ps-help">Local preview. Changes become visible after approval.</p>
        </PinnedPreview>
      </div>
      {picker && (
        <MediaPicker
          slot={picker}
          config={config}
          assets={state.assets}
          items={items}
          account={account}
          api={api}
          reduced={reduced}
          canUseCustomTint={custom}
          albumUrl={album.url}
          library={workspace.library}
          onLibraryChange={(doc) => void run(() => saveLibrary(doc))}
          onUse={(value, tint) => {
            change({
              ...config,
              ...visualPatch(picker, value),
              ...(picker === "decoration" ? { decorationTint: tint ?? null } : {}),
            });
            const id = value.split(":")[1];
            if (id)
              void run(() =>
                saveLibrary({
                  ...workspace.library,
                  recent: [id, ...workspace.library.recent.filter((v) => v !== id)].slice(0, 20),
                }),
              );
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {presetBrowser && (
        <StudioDialog title="Saved presets" onClose={() => setPresetBrowser(false)}>
          <div className="ps-preset-grid">
            {workspace.presets.slice(presetPage * 4, presetPage * 4 + 4).map((p) => (
              <article key={p.id}>
                <PresetThumbnail preset={p} state={state} api={api} />
                <strong>{p.name}</strong>
                <p>{p.approvedRevisionId ? "Approved version available" : "Draft only"}</p>
                <Action
                  onClick={() => {
                    setPresetBrowser(false);
                    void run(() => selectPreset(p.id));
                  }}
                >
                  Edit {p.name}
                </Action>
              </article>
            ))}
          </div>
          <div className="ps-actions">
            <Action variant="secondary" disabled={!presetPage} onClick={() => setPresetPage((v) => v - 1)}>
              Previous presets
            </Action>
            <span>Page {presetPage + 1}</span>
            <Action
              variant="secondary"
              disabled={(presetPage + 1) * 4 >= workspace.presets.length}
              onClick={() => setPresetPage((v) => v + 1)}
            >
              Next presets
            </Action>
          </div>
        </StudioDialog>
      )}
      {confirm && (
        <ConfirmAction
          title={confirm.title}
          detail={confirm.detail}
          action={confirm.action}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
