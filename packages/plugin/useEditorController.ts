import { slotNames } from "./editor-labels.js";
import { React } from "@webpack/common";
import {
  DEFAULT_CONFIG,
  assetIds,
  type CatalogItem,
  type EditorState,
  type ProfileConfig,
  type MediaSlot,
} from "./model.js";
import type { StudioClient } from "./client.js";
import { type VisualSlot } from "./MediaPicker.js";
import { useAlbumArtwork } from "./album-art.js";
import type { EditorProps } from "./editor-types.js";
const localDrafts = new Map<string, { config: ProfileConfig; version: number }>();
export function useEditorController({
  api,
  account,
  onPublished,
  animationsStatic,
  activityCover,
  artworkLoader,
}: EditorProps) {
  const key = `${api.base}:${account.id}`;
  const [state, setState] = React.useState<EditorState | null>(null);
  const [config, setConfig] = React.useState<ProfileConfig>(() => structuredClone(DEFAULT_CONFIG));
  const album = useAlbumArtwork(
    activityCover,
    config.favoriteSong?.artwork,
    !!config.albumBackground?.enabled,
    artworkLoader,
  );
  const [version, setVersion] = React.useState(0),
    [dirty, setDirty] = React.useState(false);
  const [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false),
    [connected, setConnected] = React.useState(!!api.token);
  const [pair, setPair] = React.useState<Awaited<ReturnType<StudioClient["pair"]>> | null>(() =>
    api.pendingPair?.userId === account.id ? api.pendingPair : null,
  );
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [urls, setUrls] = React.useState<Record<string, string>>({}),
    [full, setFull] = React.useState(false),
    [motion, setMotion] = React.useState(true);
  const [testId, setTestId] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<{
    id: string;
    code: string;
    expiresIn: number;
  } | null>(null);
  const [devices, setDevices] = React.useState<Awaited<ReturnType<StudioClient["sessions"]>>>([]);
  const [deleteText, setDeleteText] = React.useState("");
  React.useEffect(() => {
    if (animationsStatic !== undefined) setMotion(!animationsStatic);
  }, [animationsStatic]);
  const [reviewId, setReviewId] = React.useState("");
  const [review, setReview] = React.useState<Awaited<ReturnType<StudioClient["review"]>> | null>(null);
  const [reviewUrls, setReviewUrls] = React.useState<Record<string, string>>({});
  const [songInput, setSongInput] = React.useState("");
  const [picker, setPicker] = React.useState<VisualSlot | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const alive = React.useRef(true),
    operation = React.useRef(false);
  const configRef = React.useRef(config);
  configRef.current = config;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
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
        setTimeout(() => errorRef.current?.focus(), 0);
      }
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function load(replace = false) {
    await api.capabilities();
    const [value, catalogue] = await Promise.all([api.editor(), api.catalog()]);
    if (!alive.current) return;
    setState(value);
    setItems(catalogue);
    if (!dirtyRef.current) setSongInput(value.draft.favoriteSong?.url ?? "");
    const local = localDrafts.get(key);
    if (replace) {
      localDrafts.delete(key);
      setConfig(value.draft);
      setVersion(value.draftVersion);
      setDirty(false);
    } else if (!dirtyRef.current) {
      if (local) {
        setConfig(local.config);
        setVersion(local.version);
        setDirty(true);
        setMessage("Your previous local draft has been restored.");
      } else {
        setConfig(value.draft);
        setVersion(value.draftVersion);
      }
    }
  }
  React.useEffect(() => {
    alive.current = true;
    const unsubscribe = api.subscribe(() => {
      if (alive.current) setConnected(!!api.token);
      if (!api.token) {
        localDrafts.clear();
        setConfirmation(null);
        setDevices([]);
        setReview(null);
        setReviewUrls({});
        setConfig(structuredClone(DEFAULT_CONFIG));
        setDirty(false);
      }
    });
    void api.restore(account.id).catch((reason) => {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : "The saved session could not be restored.");
    });
    return () => {
      alive.current = false;
      unsubscribe();
    };
  }, [api]);
  React.useEffect(() => {
    if (connected) void run(() => load());
    else {
      setState(null);
      setUrls({});
    }
  }, [connected, key]);
  React.useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  React.useEffect(() => {
    if (dirty) localDrafts.set(key, { config, version });
  }, [config, dirty, key, version]);
  const selected = assetIds(config).join(",");
  React.useEffect(() => {
    let cancelled = false;
    const assets =
      state?.assets.filter(
        (asset) => assetIds(configRef.current).includes(asset.id) && asset.status === "ready",
      ) ?? [];
    void Promise.allSettled(
      assets.map(
        async (asset) =>
          [
            asset.id,
            await api.privateMedia(!motion && asset.previewUrl ? asset.previewUrl : asset.url),
          ] as const,
      ),
    ).then((results) => {
      if (cancelled) return;
      setUrls(
        Object.fromEntries(
          results
            .filter(
              (item): item is PromiseFulfilledResult<readonly [string, string]> =>
                item.status === "fulfilled",
            )
            .map((item) => item.value),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selected, state?.assets, api, motion]);
  function change(patch: Partial<ProfileConfig>) {
    setConfirmation(null);
    setConfig((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setMessage("");
  }
  async function save() {
    const result = await api.save(configRef.current, version);
    if (!alive.current) return result.version;
    setVersion(result.version);
    setDirty(false);
    localDrafts.delete(key);
    setMessage("Draft saved. Your published profile will change after approval.");
    return result.version;
  }
  async function submit(publish = false) {
    const currentVersion = dirty ? await save() : version;
    await api.submit(currentVersion, publish, confirmation?.id);
    setConfirmation(null);
    if (!alive.current) return;
    await load();
    setMessage(publish ? "Test profile published." : "Profile submitted for review.");
    onPublished?.();
  }
  async function beginPair() {
    const value = await api.pair(account.id);
    if (!alive.current) return;
    setPair(value);
    setMessage("Run this command in the community server. The code expires in 5 minutes.");
  }
  React.useEffect(() => {
    if (!pair || connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (cancelled || api.pendingPair?.id !== pair!.id) return;
      if (Date.now() >= pair!.expiresAt) {
        api.pendingPair = undefined;
        setPair(null);
        setMessage("The code expired. Start pairing again.");
        return;
      }
      try {
        const ready = await api.poll(pair!.id, pair!.pollSecret);
        if (cancelled) return;
        if (ready) {
          setPair(null);
          setConnected(true);
          setMessage(
            api.persistenceError ?? "Account paired. Your session will be remembered on this computer.",
          );
          return;
        }
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Pairing could not be checked.");
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pair, connected, api]);
  function assetOptions(slot: MediaSlot) {
    return [
      { value: "", label: "Original Discord appearance" },
      ...(state?.assets
        .filter((asset) => asset.slot === slot && asset.status === "ready")
        .map((asset) => ({
          value: `media:${asset.id}`,
          label: `Uploaded ${slotNames[slot].toLocaleLowerCase("en-US")} · ${asset.id.slice(0, 8)}${asset.animated ? " · animated" : ""}`,
        })) ?? []),
    ];
  }
  function selectedValue(slot: MediaSlot) {
    const value = config[slot];
    if (!value) return "";
    return typeof value === "string" ? `media:${value}` : `${value.source}:${value.id}`;
  }
  function selectAsset(slot: MediaSlot, value: string) {
    const [source, ...parts] = value.split(":");
    const id = parts.join(":");
    change({
      [slot]: !value ? null : slot === "decoration" || slot === "effect" ? { source, id } : id,
    } as Partial<ProfileConfig>);
  }
  const pending = state?.revisions.find((revision) => revision.status === "pending");
  return {
    key,
    state,
    config,
    album,
    version,
    dirty,
    message,
    setMessage,
    error,
    setError,
    busy,
    connected,
    setConnected,
    pair,
    setPair,
    items,
    urls,
    full,
    setFull,
    motion,
    setMotion,
    testId,
    setTestId,
    confirmation,
    setConfirmation,
    devices,
    setDevices,
    deleteText,
    setDeleteText,
    reviewId,
    setReviewId,
    review,
    setReview,
    reviewUrls,
    setReviewUrls,
    songInput,
    setSongInput,
    picker,
    setPicker,
    errorRef,
    alive,
    run,
    load,
    change,
    save,
    submit,
    beginPair,
    assetOptions,
    selectedValue,
    selectAsset,
    pending,
  };
}
export type EditorController = ReturnType<typeof useEditorController>;
