// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { it, expect, afterEach, vi } from "vitest";
import { Editor } from "../packages/plugin/Editor";
import { StudioClient } from "../packages/plugin/client";
import { DEFAULT_CONFIG, type EditorState } from "../packages/plugin/model";
import { ProfilePreview } from "../packages/plugin/visuals";
import { profileConfigSchema } from "../packages/shared/schema";
afterEach(cleanup);
let sequence = 10;
function setup({
  isOwner = true,
  initialFailure = false,
  paired = true,
  customEffect = false,
  catalogImport = undefined as React.ComponentProps<typeof Editor>["importCatalog"],
} = {}) {
  const id = `1000000000000000${sequence++}`;
  const state: EditorState = {
    userId: id,
    isOwner,
    draft: structuredClone(DEFAULT_CONFIG),
    draftVersion: 0,
    assets: [],
    published: null,
    revisions: [],
  };
  let failure = initialFailure;
  if (customEffect) state.draft.effect = { source: "media", id: "11111111-1111-4111-8111-111111111111" };
  let pairReady = false;
  const transport = vi.fn(async (_base: string, path: string, method: string, body?: string) => {
    if (failure)
      return {
        status: 503,
        body: JSON.stringify({ code: "OFFLINE", message: "A szerver átmenetileg nem elérhető." }),
      };
    if (path === "/v1/me") return { status: 200, body: JSON.stringify(state) };
    if (path === "/v1/me/publish-confirmation")
      return {
        status: 200,
        body: JSON.stringify({ id: "confirmation", code: "one-use-code", expiresIn: 300 }),
      };
    if (path === "/v1/catalog") return { status: 200, body: '{"items":[]}' };
    if (path.startsWith("/v1/music/resolve?"))
      return {
        status: 200,
        body: JSON.stringify({
          url: "https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ",
          title: "Favorite Track",
          artist: "Artist",
          artwork: null,
        }),
      };
    if (path === "/v1/auth/pair")
      return {
        status: 200,
        body: JSON.stringify({ id: "pair-id", code: "pair-code", pollSecret: "secret", expiresIn: 300 }),
      };
    if (path === "/v1/auth/poll")
      return {
        status: 200,
        body: JSON.stringify(pairReady ? { ready: true, token: "test", userId: id } : { ready: false }),
      };
    if (path === "/v1/me/draft") {
      const input = JSON.parse(body!);
      state.draft = input.config;
      state.draftVersion++;
      return { status: 200, body: JSON.stringify({ version: state.draftVersion }) };
    }
    if (path === "/v1/me/submit") {
      const revision = {
        id: "11111111-1111-4111-8111-111111111111",
        userId: id,
        config: structuredClone(state.draft),
        status: "pending",
        createdAt: new Date().toISOString(),
        decidedAt: null,
        reason: null,
      };
      state.revisions.unshift(revision as any);
      return { status: 200, body: JSON.stringify(revision) };
    }
    return { status: 200, body: "{}" };
  });
  const api = new StudioClient("http://localhost:3100", transport);
  if (paired) {
    api.token = "test";
    api.userId = id;
  }
  const view = render(
    <Editor api={api} account={{ id, name: "Teszt Elek" }} importCatalog={catalogImport} />,
  );
  return {
    state,
    transport,
    api,
    view,
    confirmPair: () => {
      pairReady = true;
    },
    setFailure: (value: boolean) => {
      failure = value;
    },
  };
}
it("has labelled appearance browsing actions without submitting the form", async () => {
  const { transport } = setup();
  await screen.findByRole("button", { name: "Browse avatar" });
  expect(screen.getByRole("button", { name: "Browse banner" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Browse nameplate" })).toBeTruthy();
  expect(transport.mock.calls.some((call) => call[1] === "/v1/me/submit")).toBe(false);
  expect(screen.getByLabelText("Profile sound").tagName).toBe("SELECT");
});
it("loads the editor after pairing without holding the operation lock", async () => {
  const context = setup({ paired: false });
  context.confirmPair();
  fireEvent.click(screen.getByRole("button", { name: "Pair with the bot" }));
  await screen.findByRole("button", { name: "Browse avatar" });
  expect(context.api.token).toBe("test");
  expect(context.transport.mock.calls.some((call) => call[1] === "/v1/me")).toBe(true);
});

it("resumes pairing when reopened after running the bot command", async () => {
  const context = setup({ paired: false });
  fireEvent.click(screen.getByRole("button", { name: "Pair with the bot" }));
  await screen.findByText("/profile connect code:pair-code");
  context.view.unmount();
  context.confirmPair();
  render(<Editor api={context.api} account={{ id: context.state.userId, name: "Teszt Elek" }} />);
  await screen.findByRole("button", { name: "Browse avatar" });
  expect(context.api.pendingPair).toBeUndefined();
  expect(context.transport.mock.calls.filter((call) => call[1] === "/v1/auth/pair")).toHaveLength(1);
});
it("saves first then submits an immutable snapshot and shows pending state", async () => {
  const { state } = setup();
  await screen.findByLabelText("Custom profile colors");
  fireEvent.click(screen.getByLabelText("Custom profile colors"));
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await screen.findByText("Profile submitted for review.");
  expect(state.draftVersion).toBe(1);
  expect(state.revisions).toHaveLength(1);
  expect(state.revisions[0]?.config.colors).not.toBeNull();
  expect((screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("preserves edited values on server failure and supports retry", async () => {
  const context = setup();
  await screen.findByLabelText("Custom profile colors");
  fireEvent.click(screen.getByLabelText("Custom profile colors"));
  context.setFailure(true);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Custom profile colors") as HTMLInputElement).checked).toBe(true);
  context.setFailure(false);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Your published profile will change after approval.");
  expect(context.state.draft.colors).not.toBeNull();
});
it("recovers failed initial load and keeps admin controls owner-only", async () => {
  const context = setup({ isOwner: false, initialFailure: true });
  await screen.findByRole("alert");
  context.setFailure(false);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Browse avatar" });
  expect(screen.queryByRole("heading", { name: "Admin testing" })).toBeNull();
});
it("turns off both profile and music motion in the preview", async () => {
  setup();
  await screen.findByRole("button", { name: "Browse avatar" });
  fireEvent.change(document.getElementById("ps-profile-effect-preset")!, { target: { value: "particles" } });
  fireEvent.change(document.getElementById("ps-music-effect-preset")!, { target: { value: "gradient" } });
  fireEvent.click(screen.getByLabelText("Animation", { selector: "input" }));
  await waitFor(() => expect(document.querySelector(".ps-profile .ps-effect-particles")).toBeNull());
  expect(document.querySelector(".ps-profile .ps-effect-gradient")).toBeNull();
});

it("saves black background removal with the draft and defaults older profiles to normal", async () => {
  const context = setup({ customEffect: true });
  const toggle = await screen.findByLabelText("Hide black background");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Your published profile will change after approval.");
  expect(context.state.draft.effectBlend).toBe("screen");
  const { effectBlend, ...oldConfig } = DEFAULT_CONFIG;
  expect(profileConfigSchema.parse(oldConfig).effectBlend).toBe("normal");
  expect(profileConfigSchema.safeParse({ ...DEFAULT_CONFIG, effectBlend: "arbitrary-css" }).success).toBe(
    false,
  );
});

it("composites custom effects against the profile at the group boundary", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  render(
    <ProfilePreview
      account={{ name: "Teszt Elek" }}
      config={{ ...DEFAULT_CONFIG, effect: { source: "media", id }, effectBlend: "screen" }}
      urls={{ [id]: "blob:effect" }}
      items={[]}
      reduced={false}
    />,
  );
  expect((document.querySelector(".ps-effect") as HTMLElement).style.mixBlendMode).toBe("screen");
});

it("selects favorite song metadata, removes the old sound, and saves without publishing", async () => {
  const context = setup();
  await screen.findByLabelText("Song link");
  fireEvent.change(screen.getByLabelText("Song link"), {
    target: { value: "https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load song details" }));
  expect(await screen.findAllByText("Favorite Track")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Your published profile will change after approval.");
  expect(context.state.draft.favoriteSong?.title).toBe("Favorite Track");
  expect(context.state.draft.audio).toBeNull();
  expect(context.transport.mock.calls.some((call) => call[1] === "/v1/me/submit")).toBe(false);
});

it("imports usable shop items and reports partial refresh without blocking the editor", async () => {
  const warning = "Partial refresh (profile-effects: HTTP 503). Previously loaded items were kept.";
  const context = setup({
    catalogImport: async () => ({
      items: [
        {
          id: "cached",
          kind: "decoration",
          name: "Cached",
          imageUrl: "https://cdn.discordapp.com/a.png",
          staticUrl: "https://cdn.discordapp.com/a.png",
          discordAsset: "a_asset",
          layers: [],
        },
      ],
      warning,
    }),
  });
  fireEvent.click(await screen.findByRole("button", { name: "Refresh Discord Shop catalog" }));
  await screen.findByText(`1 Discord items updated in the catalog. ${warning}`);
  expect(
    context.transport.mock.calls.some(
      (call) => call[1] === "/v1/admin/catalog/batch" && call[3]?.includes('"id":"cached"'),
    ),
  ).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});
