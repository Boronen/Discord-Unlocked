import { React } from "@webpack/common";
import { DEFAULT_CONFIG } from "./model.js";
import { type Surface } from "./studio-model.js";
import { ProfilePreview } from "./visuals.js";
import { PreviewFrame, PinnedPreview } from "./PreviewFrame.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import type { PerformanceMode } from "./scene-renderer.js";
import type { WorkspaceController } from "./useWorkspaceController.js";
import type { WorkspaceProps } from "./workspace-types.js";
export function WorkspacePreview({
  controller,
  context,
}: {
  controller: WorkspaceController;
  context: WorkspaceProps;
}) {
  const {
    workspace,
    preset,
    config,
    tab,
    surface,
    setSurface,
    selectedLayer,
    setSelectedLayer,
    lockedLayers,
    compare,
    setCompare,
    phase,
    setPhase,
    replay,
    setReplay,
    quality,
    setQuality,
    urls,
    preview,
    scene,
    album,
    changeScene,
    selectedConfig,
  } = controller;
  const { account, state, items, reduced, liveMusic, artworkLoader } = context;
  if (!workspace || !preset) return null;
  return (
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
  );
}
