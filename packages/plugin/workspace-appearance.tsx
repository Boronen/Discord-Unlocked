import { React } from "@webpack/common";
import { visualNames, type VisualSlot } from "./MediaPicker.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import { albumStatus } from "./album-art.js";
import { colorProposals, nearestBasic } from "./color-proposals.js";
import type { WorkspaceController } from "./useWorkspaceController.js";
import type { WorkspaceProps } from "./workspace-types.js";
export function WorkspaceAppearance({
  controller,
  context,
}: {
  controller: WorkspaceController;
  context: WorkspaceProps;
}) {
  const {
    workspace,
    config,
    setMessage,
    tab,
    scope,
    setPicker,
    paletteSource,
    setPaletteSource,
    scene,
    album,
    custom,
    run,
    loadWorkspace,
    change,
    changeScene,
    applyGenerated,
    palette,
  } = controller;
  const { state, onReload, refreshShop } = context;
  if (!workspace) return null;
  return (
    tab === "appearance" && (
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
    )
  );
}
