import { React } from "@webpack/common";
import { Button } from "@components/Button";
import {
  DEFAULT_CONFIG,
  assetIds,
  type CatalogItem,
  type EditorState,
  type ProfileConfig,
  type MediaSlot,
  type EffectStyle,
} from "./model.js";
import type { StudioClient } from "./client.js";
import { ProfilePreview } from "./visuals.js";
import { MediaPicker, visualNames, visualPatch, visualValue, type VisualSlot } from "./MediaPicker.js";
import "./styles.css";
import { FavoriteSongCard } from "./FavoriteSong.js";
import { PreviewFrame, PinnedPreview } from "./PreviewFrame.js";
import { albumStatus, useAlbumArtwork } from "./album-art.js";
import type { AnimationMode } from "./motion.js";
import type { CatalogRefreshResult } from "./catalog-refresh.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { StudioWorkspace } from "./StudioWorkspace.js";
import type { DraftStorage } from "./draft-history.js";
import type { GifExporter } from "./gif-recording.js";
import type { LiveMusic } from "./music-surface.js";
interface Props {
  activityCover?: string;
  liveMusic?: LiveMusic;
  artworkLoader?: (url: string) => Promise<string>;
  api: StudioClient;
  account: import("./model.js").ProfileAccount & { id: string };
  onPublished?: () => void;
  importCatalog?: () => Promise<CatalogItem[] | CatalogRefreshResult>;
  diagnostics?: () => string;
  onTestProfile?: (id: string | null, config: ProfileConfig) => void | Promise<void>;
  onClearCache?: () => void;
  animationMode?: AnimationMode;
  onAnimationMode?: (mode: AnimationMode) => void;
  animationsStatic?: boolean;
  onExportData?: () => Promise<boolean>;
  draftStorage?: DraftStorage;
  onExportCard?: (svg: string, width: number, height: number) => Promise<boolean>;
  gifExporter?: GifExporter;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p
      className={`ps-notice${error ? " ps-error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}
function Effects({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EffectStyle;
  onChange: (value: EffectStyle) => void;
}) {
  return (
    <div className="ps-effect-controls">
      <Field id={`${id}-preset`} label="Animation">
        <Choice
          id={`${id}-preset`}
          value={value.preset}
          onChange={(preset) => onChange({ ...value, preset: preset as EffectStyle["preset"] })}
          options={[
            { value: "none", label: "None" },
            { value: "glow", label: "Glow" },
            { value: "gradient", label: "Gradient" },
            { value: "particles", label: "Particles" },
          ]}
        />
      </Field>
      <Field id={`${id}-color`} label="Effect color">
        <input
          id={`${id}-color`}
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
      </Field>
      <Field id={`${id}-intensity`} label={`Intensity · ${Math.round(value.intensity * 100)}%`}>
        <input
          id={`${id}-intensity`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.intensity}
          onChange={(e) => onChange({ ...value, intensity: Number(e.target.value) })}
        />
      </Field>
      <Field id={`${id}-speed`} label={`Speed · ${value.speed}×`}>
        <input
          id={`${id}-speed`}
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={value.speed}
          onChange={(e) => onChange({ ...value, speed: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}
const statusNames = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};
const slotNames: Record<MediaSlot, string> = {
  avatar: "Avatar",
  decoration: "Avatar decoration",
  banner: "Banner",
  effect: "Profile effect",
  audio: "Profile sound",
};
// Retain draft work when Discord unmounts the settings section.
const localDrafts = new Map<string, { config: ProfileConfig; version: number }>();
export function Editor({
  api,
  account,
  onPublished,
  importCatalog,
  diagnostics,
  onTestProfile,
  onClearCache,
  animationMode,
  onAnimationMode,
  animationsStatic,
  onExportData,
  activityCover,
  liveMusic,
  artworkLoader,
  draftStorage,
  onExportCard,
  gifExporter,
}: Props) {
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
  // Poll outside run(): holding the operation lock during pairing prevents the
  // connected effect from loading the editor. Keep pending data on the client
  // so closing this modal to run the bot command does not lose the pairing.
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
  return (
    <section className="ps-root" lang="en" aria-label="Profile Studio editor">
      <header className="ps-heading">
        <div>
          <h2>Your profile, your style</h2>
          <p>Your approved appearance is visible to paired community beta members.</p>
        </div>
        {connected && (
          <Action
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.logout();
                setConnected(false);
              })
            }
          >
            Disconnect
          </Action>
        )}
      </header>
      <div ref={errorRef} tabIndex={-1}>
        {error && <Notice error>{error}</Notice>}
      </div>
      <div className="ps-status">
        {message && <Notice>{message}</Notice>}
        {busy && !pair && <Notice>Working…</Notice>}
      </div>
      {connected && (
        <details className="ps-field">
          <summary>Account, devices and privacy</summary>
          <p>
            Sessions remain signed in for up to 90 days of inactivity. You can manage your data here even
            after leaving the community.
          </p>
          <div className="ps-actions">
            <Action
              variant="secondary"
              busy={busy}
              onClick={() => void run(async () => setDevices(await api.sessions()))}
            >
              Show signed-in devices
            </Action>
            <Action
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  if (onExportData) {
                    setMessage(
                      (await onExportData())
                        ? "Your account and media export was saved."
                        : "Export cancelled.",
                    );
                    return;
                  }
                  const data = await api.exportData(),
                    url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                    );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "profile-studio-data.json";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setMessage("Data exported. The media manifest lists your authenticated file downloads.");
                })
              }
            >
              Export my data
            </Action>
            <Action
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await api.revokeSession();
                  await api.logout().catch(() => {});
                })
              }
            >
              Sign out all devices
            </Action>
          </div>
          {devices.map((device) => (
            <div className="ps-field" key={device.id}>
              <span>
                {device.name}
                {device.current ? " · This device" : ""} · Last used{" "}
                {new Date(device.lastSeenAt).toLocaleString("en-US")}
              </span>
              <Action
                variant="secondary"
                busy={busy}
                onClick={() =>
                  void run(async () => {
                    await api.revokeSession(device.id);
                    if (device.current) await api.logout().catch(() => {});
                    else setDevices(await api.sessions());
                  })
                }
              >
                Sign out this device
              </Action>
            </div>
          ))}
          <Field
            id="ps-delete-account"
            label="Delete my Profile Studio account"
            help="Your profile and access disappear immediately. Active files are removed within 24 hours; encrypted backups expire within 30 days. Type DELETE MY ACCOUNT to enable deletion."
          >
            <input
              id="ps-delete-account"
              value={deleteText}
              autoComplete="off"
              onChange={(event) => setDeleteText(event.target.value)}
            />
          </Field>
          <Action
            variant="secondary"
            disabled={deleteText !== "DELETE MY ACCOUNT"}
            busy={busy}
            onClick={() =>
              void run(async () => {
                await api.deleteAccount();
                setMessage("Your account was deleted. Active files will be removed within 24 hours.");
              })
            }
          >
            Permanently delete my account
          </Action>
        </details>
      )}
      {onAnimationMode && (
        <Field id="ps-viewer-motion" label="Animations on this computer">
          <Choice
            id="ps-viewer-motion"
            value={animationMode ?? "system"}
            onChange={(value) => onAnimationMode(value as AnimationMode)}
            options={[
              { value: "system", label: "Follow Discord and Windows settings" },
              { value: "always", label: "Always animate" },
              { value: "static", label: "Always static" },
            ]}
          />
          <p className="ps-help">
            {animationsStatic ? "Your current setting uses static images." : "Animations are enabled."} This
            is a viewer preference. No submission is required.
          </p>
        </Field>
      )}
      {!connected ? (
        <div className="ps-connect">
          <h3>Connect your account</h3>
          <p>The bot verifies your account with a one-time code. No Discord user token is needed.</p>
          {pair ? (
            <>
              <code className="ps-pair-code">/profile connect code:{pair.code}</code>
              <div className="ps-actions">
                <Action
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(`/profile connect code:${pair.code}`)
                      .then(() => setMessage("Command copied."))
                      .catch(() => setError("Copy failed. Select and copy the command manually."))
                  }
                >
                  Copy command
                </Action>
                <Action
                  variant="secondary"
                  onClick={() => {
                    api.pendingPair = undefined;
                    setPair(null);
                  }}
                >
                  Cancel
                </Action>
              </div>
            </>
          ) : (
            <Action busy={busy} onClick={() => void run(beginPair)}>
              Pair with the bot
            </Action>
          )}
          <small>API: {api.base}. Your session is stored encrypted on this computer.</small>
        </div>
      ) : state && api.studioV2 ? (
        <StudioWorkspace
          api={api}
          account={account}
          state={state}
          items={items}
          reduced={animationsStatic ?? !motion}
          activityCover={activityCover}
          liveMusic={liveMusic}
          artworkLoader={artworkLoader}
          draftStorage={draftStorage}
          onExportCard={onExportCard}
          gifExporter={gifExporter}
          onPublished={onPublished}
          onReload={() => load()}
          refreshShop={
            importCatalog
              ? async () => {
                  const result = await importCatalog();
                  const imported = Array.isArray(result) ? result : result.items;
                  await api.importCatalog(imported);
                  await load();
                  return `${imported.length} Discord items updated in the catalog.${!Array.isArray(result) && result.warning ? ` ${result.warning}` : ""}`;
                }
              : undefined
          }
          onTestProfile={onTestProfile}
          diagnostics={diagnostics}
          onClearCache={onClearCache}
        />
      ) : state ? (
        <div className="ps-editor-layout">
          <form
            noValidate
            className="ps-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => submit());
            }}
          >
            <fieldset disabled={busy} className="ps-fields">
              <section>
                <h3>Appearance</h3>
                <p className="ps-help">
                  Upload: <code>/profile upload</code> in the community server. Refresh to select processed
                  files.
                </p>
                <div className="ps-actions">
                  <Action variant="secondary" disabled={busy} onClick={() => void run(() => load())}>
                    Refresh files and status
                  </Action>
                  {state.isOwner && importCatalog && (
                    <Action
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await importCatalog();
                          const imported = Array.isArray(result) ? result : result.items;
                          await api.importCatalog(imported);
                          await load();
                          setMessage(
                            `${imported.length} Discord items updated in the catalog.${!Array.isArray(result) && result.warning ? ` ${result.warning}` : ""}`,
                          );
                        })
                      }
                    >
                      Refresh Discord Shop catalog
                    </Action>
                  )}
                </div>
                <div className="ps-appearance-choices">
                  {(["avatar", "decoration", "banner", "effect", "nameplate"] as VisualSlot[]).map((slot) => {
                    const value = visualValue(config, slot);
                    const id = value.split(":")[1];
                    const item = value.startsWith("discord:") ? items.find((item) => item.id === id) : null;
                    return (
                      <div key={slot} className="ps-appearance-choice">
                        <div>
                          <strong>{visualNames[slot]}</strong>
                          <small>
                            {item?.name ??
                              (value ? "Your uploaded appearance" : "Original Discord appearance")}
                          </small>
                        </div>
                        <Action
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setPicker(slot)}
                          aria-label={"Browse " + visualNames[slot].toLowerCase()}
                        >
                          Browse
                        </Action>
                      </div>
                    );
                  })}
                </div>
                <fieldset className="ps-album-controls">
                  <legend>Album artwork background</legend>
                  <label className="ps-checkbox">
                    <input
                      type="checkbox"
                      checked={!!config.albumBackground?.enabled}
                      onChange={(event) =>
                        change({
                          albumBackground: {
                            enabled: event.target.checked,
                            opacity: config.albumBackground?.opacity ?? 0.25,
                            blur: config.albumBackground?.blur ?? 12,
                          },
                        })
                      }
                    />
                    Use album artwork behind your profile
                  </label>
                  {config.albumBackground?.enabled && (
                    <>
                      <label htmlFor="ps-album-opacity">
                        Opacity · {Math.round(config.albumBackground.opacity * 100)}%
                      </label>
                      <input
                        id="ps-album-opacity"
                        type="range"
                        min="0"
                        max="1"
                        step=".05"
                        value={config.albumBackground.opacity}
                        onChange={(event) =>
                          change({
                            albumBackground: {
                              ...config.albumBackground!,
                              opacity: Number(event.target.value),
                            },
                          })
                        }
                      />
                      <label htmlFor="ps-album-blur">Blur · {config.albumBackground.blur}px</label>
                      <input
                        id="ps-album-blur"
                        type="range"
                        min="0"
                        max="32"
                        step="1"
                        value={config.albumBackground.blur}
                        onChange={(event) =>
                          change({
                            albumBackground: { ...config.albumBackground!, blur: Number(event.target.value) },
                          })
                        }
                      />
                      <p role="status" className="ps-help">
                        {albumStatus(album)}
                      </p>
                    </>
                  )}
                </fieldset>
                <Field
                  id="ps-audio"
                  label="Profile sound"
                  help={
                    config.favoriteSong
                      ? "Your favorite song replaces the uploaded profile sound."
                      : "MP3, WAV or OGG; 3–5 sec, up to 15 MiB."
                  }
                >
                  <Choice
                    id="ps-audio"
                    disabled={busy || !!config.favoriteSong}
                    value={selectedValue("audio")}
                    options={assetOptions("audio")}
                    onChange={(value) => selectAsset("audio", value)}
                  />
                </Field>
                {config.effect?.source === "media" && (
                  <div>
                    <label className="ps-checkbox">
                      <input
                        type="checkbox"
                        checked={config.effectBlend === "screen"}
                        onChange={(e) => change({ effectBlend: e.target.checked ? "screen" : "normal" })}
                        aria-describedby="ps-effect-blend-help"
                      />
                      Hide black background
                    </label>
                    <p id="ps-effect-blend-help" className="ps-help">
                      For effects with a black background. Bright details remain visible.
                    </p>
                  </div>
                )}
                <label className="ps-checkbox">
                  <input
                    type="checkbox"
                    checked={!!config.colors}
                    onChange={(e) => change({ colors: e.target.checked ? ["#26344a", "#161a2b"] : null })}
                  />
                  Custom profile colors
                </label>
                {config.colors && (
                  <div className="ps-two-col">
                    {config.colors.map((color, index) => (
                      <Field
                        key={index}
                        id={`ps-profile-color-${index}`}
                        label={index === 0 ? "Primary color" : "Secondary color"}
                      >
                        <input
                          id={`ps-profile-color-${index}`}
                          type="color"
                          value={color}
                          onChange={(e) =>
                            change({
                              colors: config.colors!.map((old, i) =>
                                i === index ? e.target.value : old,
                              ) as [string, string],
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                )}
                <Effects
                  id="ps-profile-effect"
                  value={config.profileEffect}
                  onChange={(profileEffect) => change({ profileEffect })}
                />
              </section>
              <section>
                <h3>Music card</h3>
                <h4>Favorite song</h4>
                <p className="ps-help">
                  Paste a Spotify, Apple Music or YouTube Music song link. Playback is provided by the
                  service; full tracks may require sign-in or a subscription.
                </p>
                <Field id="ps-favorite-url" label="Song link">
                  <input
                    id="ps-favorite-url"
                    type="url"
                    value={songInput}
                    placeholder="https://open.spotify.com/track/…"
                    onChange={(event) => setSongInput(event.target.value)}
                  />
                </Field>
                <div className="ps-actions">
                  <Action
                    variant="secondary"
                    disabled={!songInput.trim()}
                    onClick={() =>
                      void run(async () => {
                        const song = await api.resolveSong(songInput);
                        change({ favoriteSong: song, audio: null });
                        setSongInput(song.url);
                        setMessage("Song selected. Save your draft and submit it for review.");
                      })
                    }
                  >
                    Load song details
                  </Action>
                  {config.favoriteSong && (
                    <Action
                      variant="secondary"
                      onClick={() => {
                        change({ favoriteSong: null });
                        setSongInput("");
                      }}
                    >
                      Remove favorite song
                    </Action>
                  )}
                </div>
                {config.favoriteSong && (
                  <>
                    <Field id="ps-favorite-title" label="Song title">
                      <input
                        id="ps-favorite-title"
                        maxLength={200}
                        value={config.favoriteSong.title}
                        onChange={(event) =>
                          change({ favoriteSong: { ...config.favoriteSong!, title: event.target.value } })
                        }
                      />
                    </Field>
                    <Field
                      id="ps-favorite-artist"
                      label="Artist"
                      help="You can enter this manually if the service did not provide it."
                    >
                      <input
                        id="ps-favorite-artist"
                        maxLength={200}
                        value={config.favoriteSong.artist}
                        onChange={(event) =>
                          change({ favoriteSong: { ...config.favoriteSong!, artist: event.target.value } })
                        }
                      />
                    </Field>
                    <FavoriteSongCard song={config.favoriteSong} style={config.music} reduced={!motion} />
                  </>
                )}
                <Field id="ps-music-mode" label="Color mode">
                  <Choice
                    id="ps-music-mode"
                    value={config.music.mode}
                    onChange={(mode) =>
                      change({ music: { ...config.music, mode: mode as "artwork" | "manual" } })
                    }
                    options={[
                      { value: "artwork", label: "Automatic, from album artwork" },
                      { value: "manual", label: "Custom color" },
                    ]}
                  />
                </Field>
                <Field
                  id="ps-music-background"
                  label={config.music.mode === "artwork" ? "Fallback background color" : "Background color"}
                >
                  <input
                    id="ps-music-background"
                    type="color"
                    value={config.music.background}
                    onChange={(e) => change({ music: { ...config.music, background: e.target.value } })}
                  />
                </Field>
                <Effects
                  id="ps-music-effect"
                  value={config.music}
                  onChange={(effect) => change({ music: { ...config.music, ...effect } })}
                />
                <p className="ps-help">
                  Live colors come from the artwork in the Discord music activity. The preview uses a sample
                  track.
                </p>
              </section>
              <section>
                <h3>Save and review</h3>
                <p>{dirty ? "Unsaved local draft" : `Saved draft · version ${version}`}</p>
                <p>Published profile: {state.published ? "Approved revision" : "None yet"}</p>
                {pending && (
                  <Notice>You have a revision awaiting review. You can submit again after a decision.</Notice>
                )}
                <div className="ps-actions">
                  <Action
                    variant="secondary"
                    disabled={!dirty}
                    busy={busy}
                    onClick={() =>
                      void run(async () => {
                        await save();
                      })
                    }
                  >
                    Save draft
                  </Action>
                  <Action type="submit" disabled={!!pending} busy={busy}>
                    Submit for review
                  </Action>
                </div>
                {error && (
                  <Action
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await load(true);
                        setMessage("Server draft loaded.");
                      })
                    }
                  >
                    Load server draft
                  </Action>
                )}
                {state.revisions.slice(0, 3).map((revision) => (
                  <p key={revision.id} className="ps-revision">
                    <strong>{statusNames[revision.status]}</strong> ·{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(revision.createdAt),
                    )}
                    {revision.reason && <span>{revision.reason}</span>}
                  </p>
                ))}
              </section>
              {state.assets.some((asset) => asset.status !== "ready") && (
                <section>
                  <h3>Processing</h3>
                  {state.assets
                    .filter((asset) => asset.status !== "ready")
                    .slice(0, 10)
                    .map((asset) => (
                      <p key={asset.id}>
                        {slotNames[asset.slot]} · {statusNames[asset.status]}
                        {asset.error && <span className="ps-error"> — {asset.error}</span>}
                      </p>
                    ))}
                </section>
              )}
              {state.canModerate && (
                <section>
                  <h3>Moderator preview</h3>
                  <p>Use the revision ID from the bot message to review animations and sound.</p>
                  <Field id="ps-review-id" label="Submitted revision ID">
                    <input
                      id="ps-review-id"
                      value={reviewId}
                      onChange={(event) => setReviewId(event.target.value)}
                    />
                  </Field>
                  <Action
                    variant="secondary"
                    disabled={!/^[0-9a-f-]{36}$/i.test(reviewId)}
                    busy={busy}
                    onClick={() =>
                      void run(async () => {
                        const value = await api.review(reviewId);
                        const urls = await Promise.all(
                          value.assets.map(async (asset) => [
                            asset.id,
                            await api.privateMedia(
                              !motion && asset.previewUrl ? asset.previewUrl : asset.url,
                            ),
                          ]),
                        );
                        if (!alive.current) return;
                        setReview(value);
                        setReviewUrls(Object.fromEntries(urls));
                        setMessage("Submitted revision preview loaded. Use the bot to approve or reject it.");
                      })
                    }
                  >
                    Open revision
                  </Action>
                  {review && (
                    <div className="ps-review-preview">
                      <p>
                        {review.revision.userId} · {statusNames[review.revision.status]}
                      </p>
                      <ProfilePreview
                        config={review.revision.config}
                        urls={reviewUrls}
                        items={items}
                        account={{ name: review.revision.userId }}
                        reduced={!motion}
                      />
                      {review.revision.config.audio && reviewUrls[review.revision.config.audio] && (
                        <audio
                          controls
                          aria-label="Submitted profile sound"
                          src={reviewUrls[review.revision.config.audio]}
                          preload="metadata"
                        />
                      )}
                    </div>
                  )}
                </section>
              )}
              {state.isOwner && (
                <section className="ps-admin">
                  <h3>Admin testing</h3>
                  <p>Direct publishing changes your own profile and is recorded in the audit log.</p>
                  <div className="ps-actions">
                    {onClearCache && (
                      <Action
                        variant="secondary"
                        onClick={() => {
                          onClearCache();
                          setMessage("Profile and artwork caches cleared.");
                        }}
                      >
                        Clear cache
                      </Action>
                    )}
                    <Action
                      disabled={!!pending}
                      busy={busy}
                      onClick={() =>
                        void run(async () => {
                          const currentVersion = dirty ? await save() : version;
                          setConfirmation(await api.beginPublishConfirmation(currentVersion));
                          setMessage(
                            "Run the confirmation command with the bot, then publish this draft within five minutes.",
                          );
                        })
                      }
                    >
                      Prepare test publication
                    </Action>
                  </div>
                  {confirmation && (
                    <div className="ps-field">
                      <Field
                        id="ps-publish-code"
                        label="Confirm once with the bot"
                        help="This code is tied to your account and saved draft. Editing the draft invalidates it."
                      >
                        <input
                          id="ps-publish-code"
                          readOnly
                          value={`/profile confirm code:${confirmation.code}`}
                          onFocus={(event) => event.target.select()}
                        />
                      </Field>
                      <Action busy={busy} onClick={() => void run(() => submit(true))}>
                        Publish confirmed draft
                      </Action>
                    </div>
                  )}
                  {onTestProfile && (
                    <>
                      <Field
                        id="ps-test-id"
                        label="Discord user ID for local testing"
                        help="Changes appear only on this client. Nothing is published for another user."
                      >
                        <input
                          id="ps-test-id"
                          value={testId}
                          inputMode="numeric"
                          onChange={(e) => setTestId(e.target.value)}
                        />
                      </Field>
                      <div className="ps-actions">
                        <Action
                          variant="secondary"
                          disabled={!/^\d{17,20}$/.test(testId)}
                          onClick={() =>
                            void run(async () => {
                              await onTestProfile(testId, config);
                              setMessage("Local test profile enabled. Other clients cannot see it.");
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
                              setMessage("Local test cleared.");
                            })
                          }
                        >
                          Clear local test
                        </Action>
                      </div>
                    </>
                  )}
                  {diagnostics && (
                    <details>
                      <summary>Diagnostics</summary>
                      <pre>{diagnostics()}</pre>
                    </details>
                  )}
                </section>
              )}
            </fieldset>
          </form>
          <PinnedPreview>
            <div className="ps-preview-toolbar">
              <h3>Live preview</h3>
              <label>
                <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
                Full profile
              </label>
              <label>
                <input type="checkbox" checked={motion} onChange={(e) => setMotion(e.target.checked)} />
                Animation
              </label>
            </div>
            <PreviewFrame>
              <ProfilePreview
                config={config}
                urls={urls}
                items={items}
                account={account}
                reduced={!motion}
                full={full}
                albumUrl={album.url}
              />
            </PreviewFrame>
            {config.audio && urls[config.audio] && (
              <div className="ps-audio-preview">
                <label htmlFor="ps-audio-preview">Preview profile sound</label>
                <audio id="ps-audio-preview" src={urls[config.audio]} controls preload="metadata" />
              </div>
            )}
            <p className="ps-help">This is your local draft. Others see your latest approved profile.</p>
          </PinnedPreview>
        </div>
      ) : (
        <>
          <Notice>{busy ? "Loading the editor…" : "The editor is not available yet."}</Notice>
          {!busy && <Action onClick={() => void run(() => load())}>Try again</Action>}
        </>
      )}
      {picker && connected && state && (
        <MediaPicker
          slot={picker}
          config={config}
          assets={state.assets}
          items={items}
          account={account}
          api={api}
          reduced={!motion}
          albumUrl={album.url}
          canUseCustomTint={state.canUseCustomTint === true || state.isOwner}
          onUse={(value, tint) =>
            change({
              ...visualPatch(picker, value),
              ...(picker === "effect"
                ? { effectTint: tint }
                : picker === "decoration"
                  ? { decorationTint: tint }
                  : {}),
            })
          }
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
