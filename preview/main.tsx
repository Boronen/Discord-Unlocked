/// <reference types="vite/client" />
import React from "react";
import { studioFixture } from "./studio-fixture";
import { createRoot } from "react-dom/client";
import { Editor } from "../packages/plugin/Editor";
import { StudioClient } from "../packages/plugin/client";
import { DEFAULT_CONFIG, type EditorState, type CatalogItem } from "../packages/plugin/model";
import { songLink } from "../packages/plugin/music-links";
import { configureSteamGames, steamGameId } from "../packages/plugin/steam-games";
import "./preview.css";
const previewCover =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#f03052"/><stop offset=".5" stop-color="#834ada"/><stop offset="1" stop-color="#12b8bd"/></linearGradient></defs><rect width="512" height="512" fill="url(#a)"/><circle cx="360" cy="160" r="112" fill="#ffd0a0" opacity=".55"/></svg>',
  );
const previewArtworkLoader = async () => previewCover;
configureSteamGames(async (value) => {
  const id = steamGameId(value);
  return {
    appId: id,
    name: `Preview Steam game · ${id}`,
    url: `https://store.steampowered.com/app/${id}/`,
    images: [1, 2, 3].map(
      (i) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/ss_${i}.jpg`,
    ),
  };
}, previewArtworkLoader);
const userId = "100000000000000001";
const previewCatalog: CatalogItem[] = Array.from({ length: 26 }, (_, index) => {
  const kind = index % 3 === 0 ? "nameplate" : index % 2 ? "effect" : "decoration";
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      kind === "nameplate"
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64"><rect width="320" height="64" rx="8" fill="${index % 2 ? "#243644" : "#38305d"}"/><circle cx="280" cy="32" r="24" fill="${index % 2 ? "#9be0dd" : "#b7a0e7"}"/><path d="M60 16h140M60 32h110M60 48h130" stroke="white" opacity=".2" stroke-width="4"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="48" fill="none" stroke="${index % 2 ? "#50bda1" : "#a69cff"}" stroke-width="10"/><text x="60" y="68" text-anchor="middle" fill="white" font-size="24">${index + 1}</text></svg>`,
    );
  return {
    id: `preview-${index}`,
    kind,
    name: `Sample ${kind} ${index + 1}`,
    imageUrl: image,
    staticUrl: image,
    discordAsset: null,
    layers: [],
  };
});
const state: EditorState = {
  userId,
  isOwner: true,
  canModerate: true,
  draft: structuredClone(DEFAULT_CONFIG),
  draftVersion: 0,
  revisions: [],
  published: null,
  assets: [],
};
const v2fixture = studioFixture(state, previewCatalog);
let fail = false,
  delay = 0;
const client = new StudioClient("http://localhost:3100", async (_base, path, method, body) => {
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (fail)
    return {
      status: 503,
      body: JSON.stringify({
        code: "PREVIEW_OFFLINE",
        message: "Simulated server error. Your local draft is preserved.",
      }),
    };
  const v2response = v2fixture(path, method, body);
  if (v2response) return v2response;
  if (path === "/v1/me" && method === "GET") return { status: 200, body: JSON.stringify(state) };
  if (path === "/v1/catalog")
    return { status: 200, body: JSON.stringify({ items: previewCatalog, nextCursor: null }) };
  if (path === "/v1/auth/sessions" && method === "GET")
    return {
      status: 200,
      body: JSON.stringify([
        {
          id: "preview-session",
          name: "Windows Discord",
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          current: true,
        },
      ]),
    };
  if (path === "/v1/me/publish-confirmation")
    return {
      status: 200,
      body: JSON.stringify({
        id: "preview-confirmation",
        code: "PREVIEW-ONLY-NOT-A-REAL-CODE",
        expiresIn: 300,
      }),
    };
  if (path === "/v1/admin/catalog/batch") return { status: 200, body: JSON.stringify({ ok: true }) };
  if (path.startsWith("/v1/music/resolve?")) {
    try {
      const song = songLink(new URL(path, "http://localhost").searchParams.get("url") ?? "");
      return {
        status: 200,
        body: JSON.stringify({
          url: song.url,
          title: "Preview sample track",
          artist: "Sample artist",
          artwork: null,
        }),
      };
    } catch {
      return { status: 400, body: JSON.stringify({ message: "Enter a supported song link." }) };
    }
  }
  if (path === "/v1/me/draft") {
    const input = JSON.parse(body!);
    if (input.version !== state.draftVersion)
      return {
        status: 409,
        body: JSON.stringify({
          code: "DRAFT_CONFLICT",
          message: "Simulated save conflict. Your local changes are preserved.",
        }),
      };
    state.draft = input.config;
    state.draftVersion++;
    return { status: 200, body: JSON.stringify({ version: state.draftVersion }) };
  }
  if (path === "/v1/me/submit" || path === "/v1/me/publish") {
    const published = path.endsWith("publish");
    const revision = {
      id: crypto.randomUUID(),
      userId,
      config: structuredClone(state.draft),
      status: published ? "approved" : "pending",
      createdAt: new Date().toISOString(),
      decidedAt: published ? new Date().toISOString() : null,
      reason: null,
    };
    state.revisions.unshift(revision as any);
    if (published)
      state.published = {
        userId,
        revisionId: revision.id,
        config: revision.config,
        media: {},
        updatedAt: new Date().toISOString(),
      };
    return { status: 200, body: JSON.stringify(revision) };
  }
  if (path === "/v1/auth/logout") return { status: 200, body: "{}" };
  if (path === "/v1/auth/pair")
    return {
      status: 200,
      body: JSON.stringify({
        id: crypto.randomUUID(),
        code: "preview-pairing-code",
        pollSecret: "preview-secret",
        expiresIn: 300,
      }),
    };
  if (path === "/v1/auth/poll")
    return { status: 200, body: JSON.stringify({ ready: true, token: "preview-only", userId }) };
  return { status: 404, body: JSON.stringify({ message: "This action is not available in the preview." }) };
});
client.token = "preview-only";
client.userId = userId;
function Preview() {
  const [theme, setTheme] = React.useState("dark");
  const fixture = new URLSearchParams(location.search);
  const modal = fixture.get("layout") === "discord";
  const width = Math.max(360, Math.min(1100, Number(fixture.get("width")) || 680));
  return (
    <div
      className={`preview-shell ${theme}${modal ? " preview-discord-modal" : ""}`}
      style={modal ? { maxWidth: width } : undefined}
    >
      <nav className="preview-tools" aria-label="Preview controls">
        <strong>Profile Studio · Editor preview</strong>
        <span>Simulated data, real plugin UI</span>
        <label>
          <input type="checkbox" onChange={(e) => setTheme(e.target.checked ? "light" : "dark")} />
          Light theme
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              fail = e.target.checked;
            }}
          />
          Server error
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              delay = e.target.checked ? 1500 : 0;
            }}
          />
          Slow connection
        </label>
        <button
          onClick={() => {
            state.draftVersion++;
          }}
        >
          Simulate save conflict
        </button>
      </nav>
      <div className="preview-scrollport">
        <main className={modal ? "preview-clipped-content" : undefined}>
          <Editor
            api={client}
            activityCover="https://cdn.discordapp.com/profile-studio-preview-artwork.png"
            liveMusic={
              fixture.has("live")
                ? {
                    title: "Preview current track",
                    artist: "Preview artist",
                    provider: "Apple Music",
                    artwork: "https://cdn.discordapp.com/profile-studio-preview-artwork.png",
                  }
                : undefined
            }
            artworkLoader={previewArtworkLoader}
            onExportCard={fixture.has("export") ? async () => false : undefined}
            gifExporter={
              fixture.has("export")
                ? {
                    begin: async () => "simulated-export-no-file",
                    frame: async () => {
                      await new Promise((resolve) => setTimeout(resolve, 200));
                    },
                    finish: async () => false,
                    cancel: async () => {},
                  }
                : undefined
            }
            account={{ id: userId, name: "Example member" }}
            importCatalog={async () => previewCatalog}
            diagnostics={() => "Browser editor preview. Discord patches are not active here."}
          />
        </main>
      </div>
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
