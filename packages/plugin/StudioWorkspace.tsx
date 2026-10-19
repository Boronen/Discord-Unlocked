import { StudioState } from "./studio-state.js";
import { Notice } from "./studio-notice.js";
import { StudioTabs } from "./studio-controls.js";
import { usePrivateMedia } from "./usePrivateMedia.js";
import { WorkspaceMusicStyle, WorkspaceSongs } from "./workspace-music.js";
import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";
import { type EditorState } from "./model.js";
import { normalizeStudio, type Preset, type Surface } from "./studio-model.js";
import { MediaPicker, visualPatch } from "./MediaPicker.js";
import { LayerEditor, BlockEditor } from "./studio-editor-panels.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { CardExportControls } from "./CardExportControls.js";
import { StudioCommunity, StudioDialog } from "./studio-community.js";
import type { WorkspaceProps } from "./workspace-types.js";
import { useWorkspaceController } from "./useWorkspaceController.js";
import { ConfirmAction } from "./studio-dialogs.js";
import { WorkspaceAppearance } from "./workspace-appearance.js";
import { WorkspacePreview } from "./workspace-preview.js";
function PresetThumbnail({ preset, state, api }: { preset: Preset; state: EditorState; api: StudioClient }) {
  const id = preset.draft.banner ?? preset.draft.avatar;
  const asset = state.assets.find((a) => a.id === id && a.status === "ready");
  const { urls } = usePrivateMedia(api, asset ? [[asset.id, asset.previewUrl ?? asset.url]] : []);
  const url = asset ? urls[asset.id] : undefined;
  return (
    <div
      className="ps-preset-thumbnail"
      style={{ background: preset.draft.colors?.[0] ?? "var(--ps-input)" }}
    >
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">◌</span>}
    </div>
  );
}
export function StudioWorkspace(props: WorkspaceProps) {
  const {
    api,
    account,
    state,
    items,
    reduced,
    artworkLoader,
    draftStorage,
    onExportCard,
    gifExporter,
    onPublished,
    onReload,
    onTestProfile,
    diagnostics,
    onClearCache,
  } = props;
  const controller = useWorkspaceController(props);
  const navigationId = React.useId();
  const {
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
    tabs,
  } = controller;
  if (!workspace || !preset)
    return (
      <StudioState
        title={error ? "Workspace unavailable" : "Loading Studio workspace…"}
        error={!!error}
        busy={busy}
        retry={
          error
            ? () =>
                void run(async () => {
                  const w = await loadWorkspace();
                  if (w.presets[0]) await selectPreset(w.presets[0].id);
                })
            : undefined
        }
      >
        {error || "Your saved presets will appear here."}
      </StudioState>
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
          !event.nativeEvent.isComposing &&
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
      <div className="ps-editor-layout">
        <div className="ps-workspace-content">
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
                variant="secondary"
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
          <div className="ps-workspace-status">
            <p className="ps-draft-status" role="status" aria-live="polite" aria-atomic="true">
              <span className={`ps-status-dot${dirty ? " ps-status-dirty" : ""}`} aria-hidden="true" />
              {busy ? "Working…" : dirty ? "Unsaved local draft" : `Saved preset · version ${preset.version}`}
            </p>
            {message && <Notice>{message}</Notice>}
            {error && (
              <div className="ps-feedback-error">
                <Notice error focus>
                  {error}
                </Notice>
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
          <StudioTabs
            id={navigationId}
            label="Studio sections"
            value={tab}
            onChange={setTab}
            className="ps-workspace-tabs"
            options={tabs.map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))}
          />
          <form
            id={`${navigationId}-panel`}
            role="tabpanel"
            aria-labelledby={`${navigationId}-${tab}-tab`}
            tabIndex={0}
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
              <WorkspaceAppearance controller={controller} context={props} />
              {tab === "layers" && (
                <LayerEditor
                  musicColorsSupported={api.bannerLayersSupported}
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
              <WorkspaceSongs controller={controller} context={props} />
              <WorkspaceMusicStyle controller={controller} context={props} />
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
        </div>
        <WorkspacePreview controller={controller} context={props} />
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
export { ConfirmAction } from "./studio-dialogs.js";
