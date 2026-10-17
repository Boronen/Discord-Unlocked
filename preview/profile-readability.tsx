import React from "react";
import { createRoot } from "react-dom/client";
import { ProfilePreview } from "../packages/plugin/visuals";
import { LayerEditor } from "../packages/plugin/studio-editor-panels";
import { normalizeStudio, newLayer, resolveScene } from "../packages/plugin/studio-model";
import { DEFAULT_CONFIG } from "../packages/plugin/model";
import { applyProfileColors, applyProfileReadability } from "../packages/plugin/profile-dom";
import { SceneRenderer, StudioBlocks, StudioBadges } from "../packages/plugin/scene-renderer";
import "../preview/preview.css";
import "../packages/plugin/styles.css";
const frame =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="880"><rect x="8" y="8" width="434" height="864" rx="24" fill="none" stroke="#3bd38b" stroke-width="12"/><path d="M10 180Q160 200 440 80M10 800Q260 750 440 800" stroke="#92e8ac" stroke-width="18" fill="none"/></svg>',
  );
const items: any[] = [
  {
    id: "frame",
    kind: "effect",
    name: "Leaf frame",
    imageUrl: frame,
    staticUrl: frame,
    discordAsset: null,
    layers: [
      {
        src: frame,
        x: 0,
        y: 0,
        width: 450,
        height: 880,
        start: 0,
        duration: 100000,
        loop: true,
        loopDelay: 0,
        zIndex: 0,
      },
    ],
  },
];
const initial = normalizeStudio(DEFAULT_CONFIG);
initial.studio.base.colors = ["#f00045", "#151f34"];
initial.studio.base.layers = [
  { ...newLayer("discord"), assetId: "frame", id: "frame" },
  { ...newLayer("texture"), texture: "stars", id: "stars", plane: "front" },
];
initial.studio.base.blocks = [
  { id: "music", kind: "music", title: "Favorite songs", text: "", links: [], visible: true },
  {
    id: "text",
    kind: "text",
    title: "About this profile",
    text: "Readable labels across bright artwork and dark gradients.",
    links: [{ url: "https://example.com", label: "My setup" }],
    visible: true,
  },
];
initial.studio.songs = [
  {
    url: "https://music.apple.com/us/album/song/123456?i=123456",
    title: "Favorite track",
    artist: "Sample artist",
    provider: "apple",
    artwork: null,
  } as any,
];
function App() {
  const [config, setConfig] = React.useState(initial),
    [selected, setSelected] = React.useState("frame"),
    [locked, setLocked] = React.useState<string[]>([]),
    [light, setLight] = React.useState(true),
    [more, setMore] = React.useState(false),
    [album, setAlbum] = React.useState(false),
    [actions, setActions] = React.useState(0);
  const scene = resolveScene(config, "full");
  const native = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    if (!native.current) return;
    const a = applyProfileColors(native.current, scene.colors!);
    const b = applyProfileReadability(native.current, scene.colors);
    return () => {
      b();
      a();
    };
  }, [scene.colors]);
  const change = (s: any) => setConfig((c) => ({ ...c, studio: { ...c.studio, base: s } }));
  return (
    <main className={`preview-shell ps-root ${light ? "light" : "dark"}`} style={{ padding: 24 }}>
      <h1>Profile Studio rendering verification</h1>
      <label>
        <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
        Light theme
      </label>{" "}
      <label>
        <input type="checkbox" checked={album} onChange={(e) => setAlbum(e.target.checked)} />
        Album background
      </label>{" "}
      <button
        onClick={() => {
          setMore((v) => !v);
          change({
            ...scene,
            blocks: more
              ? scene.blocks.slice(0, 2)
              : [
                  ...scene.blocks,
                  ...Array.from({ length: 4 }, (_, i) => ({
                    id: `extra${i}`,
                    kind: "text",
                    title: `Extra panel ${i + 1}`,
                    text: "An added panel increases the card height.",
                    links: [],
                    visible: true,
                  })),
                ],
          });
        }}
      >
        Toggle extra panels
      </button>{" "}
      <button
        onClick={() =>
          change({
            ...scene,
            colors: scene.colors?.[0] === "#ffffff" ? ["#f00045", "#151f34"] : ["#ffffff", "#ffffdd"],
          })
        }
      >
        Switch profile palette
      </button>
      <div style={{ display: "flex", alignItems: "start", flexWrap: "wrap", gap: 28, marginTop: 20 }}>
        <section>
          <h2>Native card with appended blocks</h2>
          <article
            ref={native}
            className={`outer_fixture ps-host${album ? " ps-album-host" : ""}`}
            data-ps-custom-effect="true"
            style={{ width: 300, borderRadius: 12, overflow: "hidden" }}
          >
            <div className="inner_fixture">
              <div style={{ height: 106, background: "#20364c", color: "#ffffff", padding: 16 }}>
                Native banner
              </div>
              <div style={{ padding: 16, color: "var(--text-normal)" }}>
                <h3>boronen</h3>
                <p>Native profile bio and controls.</p>
                <button
                  style={{ color: "inherit", background: "transparent" }}
                  onClick={() => setActions((v) => v + 1)}
                >
                  Edit profile · {actions}
                </button>
              </div>
              <div
                className="ps-live-music"
                style={
                  {
                    margin: 16,
                    padding: 12,
                    "--ps-music-bg": "#20364c",
                    color: "white",
                  } as React.CSSProperties
                }
              >
                <strong>Listening to Apple Music</strong>
                <p>Current track · Sample artist</p>
              </div>
              <div className="ps-favorite-mount">
                <StudioBadges
                  badges={
                    [{ id: "one", name: "Developer", icon: "star", description: "Studio badge" }] as any
                  }
                />
                <StudioBlocks config={config} surface="full" reduced />
                <details className="ps-viewer-controls">
                  <summary>Profile display on this device</summary>
                  <label>
                    <input type="checkbox" defaultChecked />
                    Show effects
                  </label>
                </details>
              </div>
            </div>
            {album && (
              <div className="ps-album-background" style={{ background: "#4d467a" }} aria-hidden="true" />
            )}
            <SceneRenderer scene={scene} items={items} urls={{}} reduced host={native} />
          </article>
        </section>
        <section style={{ width: 300 }}>
          <h2>Shared preview</h2>
          <ProfilePreview
            config={config}
            urls={{}}
            items={items}
            account={{ name: "boronen" }}
            full
            reduced
          />
        </section>
        <section style={{ width: 300 }}>
          <h2>Legacy preview</h2>
          <ProfilePreview
            config={{ ...DEFAULT_CONFIG, effect: { source: "discord", id: "frame" } }}
            urls={{}}
            items={items}
            account={{ name: "Legacy profile" }}
            full
            reduced
          />
        </section>
        <section style={{ width: 340 }}>
          <h2>Layer selection</h2>
          <LayerEditor
            scene={scene}
            onChange={change}
            selected={selected}
            onSelect={setSelected}
            lockedLayers={locked}
            onLock={(id, value) =>
              setLocked((current) => (value ? [...current, id] : current.filter((v) => v !== id)))
            }
            config={config}
            items={items}
            assets={[]}
            api={{} as any}
            account={{ name: "boronen" }}
            custom
            reduced
          />
          <ProfilePreview
            config={config}
            urls={{}}
            items={items}
            account={{ name: "Layer preview" }}
            full
            reduced
            sceneEditor={{
              selected,
              lockedLayers: locked,
              onSelect: setSelected,
              onTransform: (id, transform) =>
                change({
                  ...scene,
                  layers: scene.layers.map((l) => (l.id === id ? { ...l, transform } : l)),
                }),
            }}
          />
        </section>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
