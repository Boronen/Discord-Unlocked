import {
  LegacyPreview,
  LegacyAdmin,
  LegacyCatalogAdmin,
  LegacyModeration,
  LegacyPairing,
  LegacyAccount,
} from "./legacy-panels.js";
import { slotNames, statusNames } from "./editor-labels.js";
import { React } from "@webpack/common";
import { MediaPicker, visualNames, visualPatch, visualValue, type VisualSlot } from "./MediaPicker.js";
import "./styles.css";
import { FavoriteSongCard } from "./FavoriteSong.js";
import { albumStatus } from "./album-art.js";
import type { AnimationMode } from "./motion.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { StudioWorkspace } from "./StudioWorkspace.js";
import type { EditorProps } from "./editor-types.js";
import { useEditorController } from "./useEditorController.js";
import { Notice } from "./studio-notice.js";
import { Effects } from "./legacy-effects.js";
export function Editor(props: EditorProps) {
  const controller = useEditorController(props);
  const {
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
    activityCover,
    liveMusic,
    artworkLoader,
    draftStorage,
    onExportCard,
    gifExporter,
  } = props;
  const {
    state,
    config,
    album,
    version,
    dirty,
    message,
    setMessage,
    error,
    busy,
    connected,
    setConnected,
    pair,
    items,
    motion,
    songInput,
    setSongInput,
    picker,
    setPicker,
    errorRef,
    run,
    load,
    change,
    save,
    submit,
    assetOptions,
    selectedValue,
    selectAsset,
    pending,
  } = controller;
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
      <LegacyAccount controller={controller} context={props} />
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
        <LegacyPairing controller={controller} context={props} />
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
                  <LegacyCatalogAdmin controller={controller} context={props} />
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
              <LegacyModeration controller={controller} context={props} />
              <LegacyAdmin controller={controller} context={props} />
            </fieldset>
          </form>
          <LegacyPreview controller={controller} context={props} />
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
export { Notice } from "./studio-notice.js";
