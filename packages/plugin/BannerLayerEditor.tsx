import { React } from "@webpack/common";
import { StudioAction as Action, StudioField as Field } from "./studio-controls.js";
import { MediaPicker, visualPatch } from "./MediaPicker.js";
import { TintControls } from "./TintControls.js";
import { DEFAULT_TRANSFORM, newBannerLayer, resolveBannerLayers, type BannerLayer } from "./studio-model.js";
import type { WorkspaceController } from "./useWorkspaceController.js";
import type { WorkspaceProps } from "./workspace-types.js";

export function BannerLayerEditor({
  controller,
  context,
}: {
  controller: WorkspaceController;
  context: WorkspaceProps;
}) {
  const { config, change, custom, album } = controller;
  const { api, state, items, account, reduced } = context;
  const [selected, setSelected] = React.useState<string>();
  const [browse, setBrowse] = React.useState(false);
  const layers = resolveBannerLayers(config);
  const layer = layers.find((l) => l.id === selected) ?? layers[0];
  const commit = (next: BannerLayer[], key?: string) =>
    change({ ...config, studio: { ...config.studio, bannerLayers: next } }, key);
  const update = (patch: Partial<BannerLayer>, key?: string) => {
    if (layer)
      commit(
        layers.map((l) => (l.id === layer.id ? { ...l, ...patch } : l)),
        key,
      );
  };
  const move = (offset: number) => {
    if (!layer) return;
    const index = layers.indexOf(layer),
      target = index + offset;
    if (target < 0 || target >= layers.length) return;
    const next = [...layers];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
  };
  if (!api.bannerLayersSupported) return null;
  return (
    <fieldset className="ps-banner-editor ps-album-controls">
      <legend>Banner layers</legend>
      <p className="ps-help">
        Up to three uploaded banner images, shared by small and full profiles. Later layers appear on top.
        Each layer can follow the music palette independently.
      </p>
      <div className="ps-layer-list" role="group" aria-label="Banner layers">
        {layers.map((value, index) => (
          <div className="ps-layer-row" key={value.id}>
            <button
              type="button"
              aria-pressed={value.id === layer?.id}
              onClick={() => {
                setSelected(value.id);
                setBrowse(false);
              }}
            >
              {value.assetId && controller.urls?.[value.assetId] && (
                <img
                  className="ps-banner-layer-thumb"
                  src={controller.urls[`${value.assetId}:static`] ?? controller.urls[value.assetId]}
                  alt=""
                />
              )}
              {index + 1}.{" "}
              {(value.assetId ? controller.workspace?.mediaMetadata[value.assetId]?.label : undefined) ??
                (value.assetId ? `Uploaded banner · ${value.assetId.slice(-6)}` : "Choose a banner")}
              {value.followMusicColors ? " · Music colors" : " · Original/manual colors"}
            </button>
          </div>
        ))}
      </div>
      <div className="ps-actions">
        <Action
          variant="secondary"
          disabled={layers.length >= 3}
          onClick={() => {
            const next = newBannerLayer();
            commit([...layers, next]);
            setSelected(next.id);
          }}
        >
          Add banner layer
        </Action>
        <Action
          variant="secondary"
          disabled={!layers.length}
          onClick={() => {
            commit([]);
            setSelected(undefined);
            setBrowse(false);
          }}
        >
          Use original Discord banner
        </Action>
      </div>
      {layer && (
        <>
          <h4>Editing banner layer {layers.indexOf(layer) + 1}</h4>
          <div className="ps-actions">
            <Action variant="secondary" onClick={() => setBrowse(true)}>
              Choose layer image
            </Action>
            <Action variant="secondary" disabled={layers.indexOf(layer) === 0} onClick={() => move(-1)}>
              Move down
            </Action>
            <Action
              variant="secondary"
              disabled={layers.indexOf(layer) === layers.length - 1}
              onClick={() => move(1)}
            >
              Move up
            </Action>
            <Action
              variant="secondary"
              onClick={() => {
                commit(layers.filter((l) => l.id !== layer.id));
                setSelected(undefined);
                setBrowse(false);
              }}
            >
              Remove banner layer
            </Action>
          </div>
          <label className="ps-checkbox">
            <input
              type="checkbox"
              checked={layer.followMusicColors}
              onChange={(e) => update({ followMusicColors: e.target.checked })}
            />
            Follow music colors
          </label>
          <p className="ps-help">
            When enabled, this image follows the available music artwork palette. Otherwise its original
            colors or manual tint remain. Manual tint is also the fallback when no palette is available.
          </p>
          <div className="ps-two-col">
            {(["x", "y", "scale", "rotation", "opacity"] as const).map((key) => (
              <Field
                key={key}
                id={`ps-banner-${key}`}
                label={
                  {
                    x: "Horizontal offset",
                    y: "Vertical offset",
                    scale: "Scale",
                    rotation: "Rotation (degrees)",
                    opacity: "Opacity",
                  }[key]
                }
              >
                <input
                  id={`ps-banner-${key}`}
                  type="number"
                  min={
                    key === "rotation" ? -180 : key === "x" || key === "y" ? -1 : key === "scale" ? 0.1 : 0
                  }
                  max={key === "rotation" ? 180 : key === "scale" ? 3 : 1}
                  step={key === "rotation" ? 1 : 0.01}
                  value={layer.transform[key]}
                  onChange={(e) => {
                    if (!e.target.value || !Number.isFinite(e.target.valueAsNumber)) return;
                    update(
                      {
                        transform: {
                          ...layer.transform,
                          [key]: Math.max(
                            Number(e.target.min),
                            Math.min(Number(e.target.max), e.target.valueAsNumber),
                          ),
                        },
                      },
                      `banner-${layer.id}-${key}`,
                    );
                  }}
                />
              </Field>
            ))}
          </div>
          <Action variant="secondary" onClick={() => update({ transform: { ...DEFAULT_TRANSFORM } })}>
            Reset banner position and size
          </Action>
          <TintControls
            key={layer.id}
            id={`ps-banner-tint-${layer.id}`}
            label="Manual banner tint"
            custom={custom}
            value={layer.tint}
            onChange={(tint) => update({ tint })}
          />
        </>
      )}
      {browse && layer && (
        <MediaPicker
          slot="banner"
          config={{ ...config, banner: layer.assetId }}
          assets={state.assets}
          items={items}
          account={account}
          api={api}
          reduced={reduced}
          albumUrl={album.url}
          previewConfig={(candidate) => ({
            ...config,
            studio: {
              ...config.studio,
              bannerLayers: layers.map((l) =>
                l.id === layer.id ? { ...l, assetId: visualPatch("banner", candidate).banner ?? null } : l,
              ),
            },
          })}
          onUse={(candidate) => update({ assetId: visualPatch("banner", candidate).banner ?? null })}
          onClose={() => setBrowse(false)}
        />
      )}
    </fieldset>
  );
}
