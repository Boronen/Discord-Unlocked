import { usePrivateMedia } from "./usePrivateMedia.js";
import { React } from "@webpack/common";
import { DEFAULT_CONFIG, assetIds, type ProfileConfig } from "./model.js";
import {
  normalizeStudio,
  resolveScene,
  legacyConfig,
  type ProfileConfigV2,
  type WorkspaceState,
  type Preset,
  type SceneConfig,
  type SceneLayer,
  type Surface,
  type PersonalLibrary,
} from "./studio-model.js";
import { DraftHistory, type DraftBackup } from "./draft-history.js";
import { type VisualSlot } from "./MediaPicker.js";
import { useAlbumArtwork } from "./album-art.js";
import { artworkPalette } from "./palette.js";
import type { PerformanceMode } from "./scene-renderer.js";
import type { WorkspaceProps } from "./workspace-types.js";

export function useWorkspaceController({
  api,
  account,
  state,
  reduced,
  activityCover,
  artworkLoader,
  draftStorage,
}: WorkspaceProps) {
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
  const [songInput, setSongInput] = React.useState(""),
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
  const needed = new Set(ids.split(","));
  const { urls } = usePrivateMedia(
    api,
    state.assets
      .filter((a) => a.status === "ready" && needed.has(a.id))
      .flatMap((a) => [a, ...(a.previewUrl ? [{ ...a, id: `${a.id}:static`, url: a.previewUrl }] : [])])
      .map((a) => [a.id, (reduced || quality === "low") && a.previewUrl ? a.previewUrl : a.url]),
  );
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
  return {
    workspace,
    preset,
    config,
    setConfig,
    dirty,
    setDirty,
    busy,
    error,
    message,
    setMessage,
    tab,
    setTab,
    surface,
    setSurface,
    scope,
    setScope,
    selectedLayer,
    setSelectedLayer,
    lockedLayers,
    setLockedLayers,
    picker,
    setPicker,
    compare,
    setCompare,
    phase,
    setPhase,
    replay,
    setReplay,
    quality,
    setQuality,
    paletteSource,
    setPaletteSource,
    publication,
    setPublication,
    testId,
    setTestId,
    presetBrowser,
    setPresetBrowser,
    presetPage,
    setPresetPage,
    name,
    setName,
    backup,
    setBackup,
    confirm,
    setConfirm,
    urls,
    songInput,
    setSongInput,
    activateOnApproval,
    setActivateOnApproval,
    history,
    preview,
    root,
    current,
    dirtyRef,
    scene,
    album,
    custom,
    run,
    loadWorkspace,
    selectPreset,
    change,
    changeScene,
    save,
    saveLibrary,
    applyGenerated,
    palette,
    selectedConfig,
    tabs,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
