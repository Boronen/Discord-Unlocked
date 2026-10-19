import { React } from "@webpack/common";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import {
  DEFAULT_TRANSFORM,
  TEXTURES,
  newLayer,
  type SceneConfig,
  type SceneLayer,
  type StudioBlock,
  type PersonalLibrary,
} from "./studio-model.js";
import type { ProfileConfig, CatalogItem, MediaAsset } from "./model.js";
import type { StudioClient } from "./client.js";
import { MediaPicker, visualPatch } from "./MediaPicker.js";
import { loadSteamGame } from "./steam-games.js";
export function LayerEditor({
  scene,
  onChange,
  selected,
  onSelect,
  lockedLayers = [],
  onLock,
  config,
  items,
  assets,
  api,
  account,
  custom,
  reduced,
  albumUrl,
  library,
  onLibraryChange,
  musicColorsSupported = false,
}: {
  scene: SceneConfig;
  onChange: (scene: SceneConfig, key?: string) => void;
  selected?: string;
  onSelect: (id: string) => void;
  lockedLayers?: readonly string[];
  onLock?: (id: string, locked: boolean) => void;
  config: ProfileConfig;
  items: CatalogItem[];
  assets: MediaAsset[];
  api: StudioClient;
  account: { name: string; avatar?: string };
  custom: boolean;
  reduced: boolean;
  albumUrl?: string;
  library?: PersonalLibrary;
  onLibraryChange?: (doc: PersonalLibrary) => void;
  musicColorsSupported?: boolean;
}) {
  const [browse, setBrowse] = React.useState(false),
    [source, setSource] = React.useState<SceneLayer["source"]>("discord");
  const layer = scene.layers.find((l) => l.id === selected) ?? scene.layers[0];
  const update = (patch: Partial<SceneLayer>, key = "layer") => {
    if (layer)
      onChange(
        { ...scene, layers: scene.layers.map((l) => (l.id === layer.id ? { ...l, ...patch } : l)) },
        key,
      );
  };
  const reorder = (offset: number) => {
    if (!layer) return;
    const next = [...scene.layers],
      index = next.findIndex((l) => l.id === layer.id),
      target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...scene, layers: next });
  };
  return (
    <section>
      <h3>Effect layers</h3>
      <p className="ps-help">
        Select a layer here before moving it in the preview. Only the selected, unlocked layer accepts
        dragging.
      </p>
      <div className="ps-inline">
        <Field id="ps-layer-source" label="New layer">
          <Choice
            id="ps-layer-source"
            value={source}
            onChange={(v) => setSource(v as SceneLayer["source"])}
            options={[
              { value: "discord", label: "Discord effect" },
              { value: "media", label: "Your uploaded effect" },
              { value: "texture", label: "Built-in texture" },
              { value: "preset", label: "Glow, gradient or particles" },
            ]}
          />
        </Field>
        <Action
          disabled={scene.layers.length >= 3}
          onClick={() => {
            const layer = newLayer(source);
            onChange({ ...scene, layers: [...scene.layers, layer] });
            onSelect(layer.id);
          }}
        >
          Add layer
        </Action>
      </div>
      <div className="ps-layer-list" role="group" aria-label="Scene layers">
        {scene.layers.map((l, i) => (
          <div key={l.id} className="ps-layer-row">
            <button type="button" aria-pressed={l.id === layer?.id} onClick={() => onSelect(l.id)}>
              {i + 1}.{" "}
              {l.source === "texture"
                ? l.texture
                : l.source === "preset"
                  ? l.preset
                  : (items.find((v) => v.id === l.assetId)?.name ??
                    (l.assetId ? "Uploaded effect" : "Choose an effect"))}{" "}
              · {l.phase}
            </button>
            {onLock && (
              <label className="ps-layer-lock">
                <input
                  type="checkbox"
                  aria-label={`Lock layer ${i + 1}`}
                  checked={lockedLayers.includes(l.id)}
                  onChange={(e) => onLock(l.id, e.target.checked)}
                />
                Lock
              </label>
            )}
          </div>
        ))}
      </div>
      {layer && (
        <>
          <p className="ps-help" role="status">
            Editing layer {scene.layers.indexOf(layer) + 1}
            {lockedLayers.includes(layer.id)
              ? " · Locked in preview. Unlock to move or resize."
              : " · Drag its outlined frame, or use the numeric controls."}
          </p>
          <div className="ps-actions">
            <Action onClick={() => reorder(-1)} disabled={scene.layers[0]?.id === layer.id}>
              Move back
            </Action>
            <Action onClick={() => reorder(1)} disabled={scene.layers.at(-1)?.id === layer.id}>
              Move forward
            </Action>
            <Action
              onClick={() => onChange({ ...scene, layers: scene.layers.filter((l) => l.id !== layer.id) })}
            >
              Remove layer
            </Action>
          </div>
          {(layer.source === "discord" || layer.source === "media") && (
            <Action onClick={() => setBrowse(true)}>Choose effect and tint</Action>
          )}
          {layer.source === "texture" && (
            <Field id="ps-texture" label="Texture">
              <Choice
                id="ps-texture"
                value={layer.texture}
                onChange={(v) => update({ texture: v as SceneLayer["texture"] })}
                options={TEXTURES.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
              />
            </Field>
          )}
          {layer.source === "preset" && (
            <Field id="ps-layer-preset" label="Built-in effect">
              <Choice
                id="ps-layer-preset"
                value={layer.preset}
                onChange={(v) => update({ preset: v as SceneLayer["preset"] })}
                options={["glow", "gradient", "particles"].map((v) => ({ value: v, label: v }))}
              />
            </Field>
          )}
          {(layer.source === "texture" || layer.source === "preset") && (
            <Field id="ps-layer-color" label="Effect color">
              <input
                id="ps-layer-color"
                type="color"
                value={layer.color}
                onChange={(e) => update({ color: e.target.value }, "layer-color")}
              />
            </Field>
          )}
          <div className="ps-two-col">
            <Field id="ps-layer-phase" label="Animation role">
              <Choice
                id="ps-layer-phase"
                value={layer.phase}
                onChange={(v) => update({ phase: v as SceneLayer["phase"] })}
                options={["intro", "idle", "hover"].map((v) => ({
                  value: v,
                  label: v[0]!.toUpperCase() + v.slice(1),
                }))}
              />
            </Field>
            <Field id="ps-layer-plane" label="Placement">
              <Choice
                id="ps-layer-plane"
                value={layer.plane}
                onChange={(v) => update({ plane: v as SceneLayer["plane"] })}
                options={[
                  { value: "front", label: "Front effect group" },
                  { value: "behind", label: "Back effect group" },
                ]}
              />
            </Field>
          </div>
          <div className="ps-two-col">
            {(["x", "y", "scale", "rotation", "opacity"] as const).map((key) => (
              <Field
                key={key}
                id={`ps-transform-${key}`}
                label={
                  key === "x"
                    ? "Horizontal offset"
                    : key === "y"
                      ? "Vertical offset"
                      : key === "scale"
                        ? "Scale"
                        : key === "rotation"
                          ? "Rotation (degrees)"
                          : "Opacity"
                }
              >
                <input
                  id={`ps-transform-${key}`}
                  type="number"
                  min={
                    key === "rotation" ? -180 : key === "x" || key === "y" ? -1 : key === "scale" ? 0.1 : 0
                  }
                  max={key === "rotation" ? 180 : key === "scale" ? 3 : 1}
                  step={key === "rotation" ? 1 : 0.01}
                  value={layer.transform[key]}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    const value = Number(e.target.value);
                    if (Number.isFinite(value))
                      update(
                        {
                          transform: {
                            ...layer.transform,
                            [key]: Math.max(Number(e.target.min), Math.min(Number(e.target.max), value)),
                          },
                        },
                        `transform-${key}`,
                      );
                  }}
                />
              </Field>
            ))}
          </div>
          {musicColorsSupported && (
            <label className="ps-checkbox">
              <input
                type="checkbox"
                checked={layer.followMusicColors !== false}
                onChange={(e) => update({ followMusicColors: e.target.checked })}
              />
              Follow music colors
            </label>
          )}
          <Action variant="secondary" onClick={() => update({ transform: { ...DEFAULT_TRANSFORM } })}>
            Reset position and size
          </Action>
          <Field id="ps-layer-delay" label="Start delay (ms)">
            <input
              id="ps-layer-delay"
              type="number"
              min="0"
              max="10000"
              step="100"
              value={layer.delayMs}
              onChange={(e) =>
                update({ delayMs: Math.max(0, Math.min(10000, Number(e.target.value))) }, "delay")
              }
            />
          </Field>
          {layer.phase === "intro" && (
            <Field id="ps-layer-duration" label="Intro duration (ms)">
              <input
                id="ps-layer-duration"
                type="number"
                min="100"
                max="10000"
                step="100"
                value={layer.durationMs}
                onChange={(e) =>
                  update({ durationMs: Math.max(100, Math.min(10000, Number(e.target.value))) }, "duration")
                }
              />
            </Field>
          )}
          {layer.source === "media" && (
            <label className="ps-checkbox">
              <input
                type="checkbox"
                checked={layer.blend === "screen"}
                onChange={(e) => update({ blend: e.target.checked ? "screen" : "normal" })}
              />
              Hide black background
            </label>
          )}
        </>
      )}
      <fieldset className="ps-field">
        <legend>Depth effect</legend>
        <label className="ps-checkbox">
          <input
            type="checkbox"
            checked={scene.parallax.enabled}
            onChange={(e) =>
              onChange({ ...scene, parallax: { ...scene.parallax, enabled: e.target.checked } })
            }
          />
          Follow pointer movement
        </label>
        <Field id="ps-depth" label={`Depth strength · ${Math.round(scene.parallax.amount * 100)}%`}>
          <input
            id="ps-depth"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={scene.parallax.amount}
            onChange={(e) =>
              onChange({ ...scene, parallax: { ...scene.parallax, amount: Number(e.target.value) } }, "depth")
            }
          />
        </Field>
      </fieldset>
      {browse && layer && (
        <MediaPicker
          slot="effect"
          config={{
            ...config,
            effect:
              layer.assetId && (layer.source === "media" || layer.source === "discord")
                ? { source: layer.source, id: layer.assetId }
                : null,
            effectTint: layer.tint,
          }}
          assets={assets}
          items={items}
          api={api}
          account={account}
          canUseCustomTint={custom}
          reduced={reduced}
          albumUrl={albumUrl}
          library={library}
          onLibraryChange={onLibraryChange}
          onUse={(value, tint) => {
            const patch = visualPatch("effect", value);
            if (patch.effect)
              update({ source: patch.effect.source, assetId: patch.effect.id, tint: tint ?? null });
            else update({ assetId: null, tint: tint ?? null });
            if (patch.effect?.source === "discord" && library && onLibraryChange)
              onLibraryChange({
                ...library,
                recent: [patch.effect.id, ...library.recent.filter((id) => id !== patch.effect!.id)].slice(
                  0,
                  20,
                ),
              });
          }}
          onClose={() => setBrowse(false)}
        />
      )}
    </section>
  );
}
export function BlockEditor({
  scene,
  onChange,
}: {
  scene: SceneConfig;
  onChange: (scene: SceneConfig, key?: string) => void;
}) {
  const [selected, setSelected] = React.useState(""),
    [kind, setKind] = React.useState<StudioBlock["kind"]>("text");
  const block = scene.blocks.find((b) => b.id === selected) ?? scene.blocks[0];
  const [gameLink, setGameLink] = React.useState(""),
    [gameError, setGameError] = React.useState(""),
    [gameBusy, setGameBusy] = React.useState(false);
  const gameRequest = React.useRef(0),
    latestScene = React.useRef(scene);
  latestScene.current = scene;
  React.useEffect(() => {
    gameRequest.current++;
    setGameLink(block?.kind === "games" ? (block.links[0]?.url ?? "") : "");
    setGameError("");
    setGameBusy(false);
    return () => {
      gameRequest.current++;
    };
  }, [block?.id, block?.links[0]?.url]);
  const update = (patch: Partial<StudioBlock>, key = "block") => {
    if (block)
      onChange(
        { ...scene, blocks: scene.blocks.map((b) => (b.id === block.id ? { ...b, ...patch } : b)) },
        key,
      );
  };
  const move = (id: string, target: number) => {
    const list = [...scene.blocks],
      from = list.findIndex((b) => b.id === id);
    if (from < 0 || target < 0 || target >= list.length) return;
    const [value] = list.splice(from, 1);
    list.splice(target, 0, value!);
    onChange({ ...scene, blocks: list });
  };
  return (
    <section>
      <h3>Studio panels</h3>
      <p className="ps-help">
        Discord identity and buttons stay in their original positions. Small profiles show the first three
        visible Studio panels; full profiles show up to eight.
      </p>
      <Field id="ps-new-panel" label="Panel type">
        <Choice
          id="ps-new-panel"
          value={kind}
          onChange={(v) => setKind(v as StudioBlock["kind"])}
          options={["text", "interests", "games", "setup", "quote", "links", "music"].map((v) => ({
            value: v,
            label: v[0]!.toUpperCase() + v.slice(1),
          }))}
        />
      </Field>
      <Action
        disabled={scene.blocks.length >= 8}
        onClick={() => {
          const value: StudioBlock = {
            id: crypto.randomUUID(),
            kind,
            title: kind === "music" ? "Favorite songs" : kind === "games" ? "Favorite game" : "New panel",
            text: "",
            links: [],
            visible: true,
          };
          onChange({ ...scene, blocks: [...scene.blocks, value] });
          setSelected(value.id);
        }}
      >
        Add panel
      </Action>
      <div className="ps-panel-list">
        {scene.blocks.map((b, i) => (
          <div
            key={b.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", b.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              move(e.dataTransfer.getData("text/plain"), i);
            }}
          >
            <button type="button" aria-pressed={b.id === block?.id} onClick={() => setSelected(b.id)}>
              {b.visible ? "●" : "○"} {b.title || b.kind}
            </button>
            <Action
              variant="secondary"
              disabled={!i}
              onClick={() => move(b.id, i - 1)}
              aria-label={`Move ${b.title || b.kind} up`}
            >
              Up
            </Action>
            <Action
              variant="secondary"
              disabled={i === scene.blocks.length - 1}
              onClick={() => move(b.id, i + 1)}
              aria-label={`Move ${b.title || b.kind} down`}
            >
              Down
            </Action>
          </div>
        ))}
      </div>
      {block && (
        <>
          <label className="ps-checkbox">
            <input
              type="checkbox"
              checked={block.visible}
              onChange={(e) => update({ visible: e.target.checked })}
            />
            Show this panel
          </label>
          <Field id="ps-panel-title" label="Panel title">
            <input
              id="ps-panel-title"
              maxLength={64}
              value={block.title}
              onChange={(e) => update({ title: e.target.value }, "panel-title")}
            />
          </Field>
          {block.kind === "games" && (
            <fieldset className="ps-game-editor">
              <legend>Favorite Steam game</legend>
              <Field
                id="ps-steam-game-link"
                label="Steam game link or App ID"
                help="Use a Steam store game link. The profile shows a small slideshow of its store screenshots."
              >
                <input
                  id="ps-steam-game-link"
                  value={gameLink}
                  aria-describedby={gameError ? "ps-steam-game-error" : undefined}
                  maxLength={1200}
                  onChange={(e) => {
                    gameRequest.current++;
                    setGameBusy(false);
                    setGameLink(e.target.value);
                    setGameError("");
                  }}
                />
              </Field>
              <Action
                disabled={gameBusy || !gameLink.trim()}
                onClick={() => {
                  const request = ++gameRequest.current,
                    id = block.id;
                  setGameBusy(true);
                  setGameError("");
                  void Promise.resolve()
                    .then(() => loadSteamGame(gameLink))
                    .then((game) => {
                      if (request !== gameRequest.current) return;
                      const current = latestScene.current;
                      onChange(
                        {
                          ...current,
                          blocks: current.blocks.map((b) =>
                            b.id === id
                              ? { ...b, links: [{ label: game.name.slice(0, 80), url: game.url }] }
                              : b,
                          ),
                        },
                        "favorite-game",
                      );
                    })
                    .catch((error) => {
                      if (request === gameRequest.current)
                        setGameError(
                          error instanceof Error ? error.message : "The game could not be loaded.",
                        );
                    })
                    .finally(() => {
                      if (request === gameRequest.current) setGameBusy(false);
                    });
                }}
              >
                {gameBusy ? "Loading game…" : "Select Steam game"}
              </Action>
              {block.links[0] && (
                <>
                  <p className="ps-help">Selected: {block.links[0].label}</p>
                  <Action variant="secondary" onClick={() => update({ links: [] })}>
                    Remove selected game
                  </Action>
                </>
              )}
              {gameError && (
                <p id="ps-steam-game-error" role="alert">
                  {gameError}
                </p>
              )}
            </fieldset>
          )}
          {block.kind !== "music" && (
            <Field id="ps-panel-text" label="Panel text" help="Plain text, up to 1,000 characters.">
              <textarea
                className="resize-none"
                id="ps-panel-text"
                maxLength={1000}
                rows={5}
                style={{ resize: "none" }}
                value={block.text}
                onChange={(e) => update({ text: e.target.value }, "panel-text")}
              />
            </Field>
          )}
          {block.kind === "links" && (
            <>
              <Action
                disabled={block.links.length >= 8}
                onClick={() =>
                  update({ links: [...block.links, { label: "Website", url: "https://example.com/" }] })
                }
              >
                Add link
              </Action>
              {block.links.map((link, i) => (
                <div className="ps-link-editor" key={i}>
                  <Field id={`ps-link-label-${i}`} label={`Link ${i + 1} label`}>
                    <input
                      id={`ps-link-label-${i}`}
                      maxLength={80}
                      value={link.label}
                      onChange={(e) =>
                        update(
                          {
                            links: block.links.map((l, index) =>
                              index === i ? { ...l, label: e.target.value } : l,
                            ),
                          },
                          `link-${i}`,
                        )
                      }
                    />
                  </Field>
                  <Field id={`ps-link-url-${i}`} label="HTTPS URL">
                    <input
                      id={`ps-link-url-${i}`}
                      type="url"
                      maxLength={1000}
                      value={link.url}
                      aria-invalid={!/^https:\/\//.test(link.url)}
                      onChange={(e) =>
                        update(
                          {
                            links: block.links.map((l, index) =>
                              index === i ? { ...l, url: e.target.value } : l,
                            ),
                          },
                          `url-${i}`,
                        )
                      }
                    />
                  </Field>
                  <Action
                    variant="secondary"
                    onClick={() => update({ links: block.links.filter((_, index) => index !== i) })}
                  >
                    Remove link
                  </Action>
                </div>
              ))}
            </>
          )}
          <Action
            variant="secondary"
            onClick={() => onChange({ ...scene, blocks: scene.blocks.filter((b) => b.id !== block.id) })}
          >
            Remove panel
          </Action>
        </>
      )}
    </section>
  );
}
