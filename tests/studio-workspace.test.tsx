// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { StudioWorkspace } from "../packages/plugin/StudioWorkspace.js";
import { StudioCommunity } from "../packages/plugin/studio-community.js";
import { StudioClient } from "../packages/plugin/client.js";
import { DEFAULT_CONFIG, type EditorState } from "../packages/plugin/model.js";
import { studioFixture } from "../preview/studio-fixture.js";
import type { DraftBackup } from "../packages/plugin/draft-history.js";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

test("protected panels do not mount or fetch data for an unauthorized or downgraded user", () => {
  const request = vi.fn();
  const state = { isOwner: false, canModerate: false };
  const props = { state, api: { request } } as any;
  const { rerender, container } = render(<StudioCommunity {...props} tab="admin" />);
  expect(container.textContent).toBe("");
  rerender(<StudioCommunity {...props} tab="review" />);
  expect(container.textContent).toBe("");
  rerender(<StudioCommunity {...props} tab="unknown" />);
  expect(container.textContent).toBe("");
  expect(request).not.toHaveBeenCalled();
});
function setup() {
  const state: EditorState = {
    userId: "100000000000000001",
    isOwner: true,
    canModerate: true,
    draft: structuredClone(DEFAULT_CONFIG),
    draftVersion: 0,
    assets: [],
    published: null,
    revisions: [],
  };
  const fixture = studioFixture(state, []),
    transport = vi.fn(
      async (_base: string, path: string, method: string, body?: string) =>
        fixture(path, method, body) ?? { status: 404, body: '{"message":"Not available"}' },
    );
  const api = new StudioClient("http://localhost:3100", transport);
  api.token = "test-only";
  api.userId = state.userId;
  api.accessAllowed = true;
  api.studioV2 = true;
  api.musicPrioritySupported = true;
  const saved = new Map<string, DraftBackup>();
  const storage = {
    load: vi.fn(async (_id: string, _base: string, preset: string) => saved.get(preset) ?? null),
    save: vi.fn(async (v: DraftBackup) => {
      saved.set(v.presetId, structuredClone(v));
    }),
    remove: vi.fn(async (_id: string, _base: string, preset?: string) => {
      if (preset) saved.delete(preset);
    }),
  };
  render(
    <StudioWorkspace
      api={api}
      state={state}
      account={{ id: state.userId, name: "Alice" }}
      items={[]}
      reduced
      draftStorage={storage}
      onReload={async () => {}}
    />,
  );
  return { api, state, transport, storage };
}
test("editing a panel saves only encrypted-recovery input after idle; undo restores text", async () => {
  const c = setup();
  fireEvent.click(await screen.findByRole("tab", { name: "Panels", exact: true }));
  fireEvent.change(screen.getByLabelText("Panel type"), { target: { value: "text" } });
  fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
  fireEvent.change(screen.getByLabelText("Panel text"), { target: { value: "A private draft" } });
  await waitFor(() => expect(c.storage.save).toHaveBeenCalled(), { timeout: 2000 });
  expect(c.storage.save.mock.calls.at(-1)![0].config.studio!.base.blocks.at(-1)!.text).toBe(
    "A private draft",
  );
  expect(c.transport.mock.calls.some((call) => call[2] === "PUT")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect((screen.getByLabelText("Panel text") as HTMLTextAreaElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Redo", exact: true }));
  expect((screen.getByLabelText("Panel text") as HTMLTextAreaElement).value).toBe("A private draft");
});
test("preset creation and save are separate from review and activation", async () => {
  const c = setup();
  fireEvent.click(await screen.findByRole("button", { name: "New preset", exact: true }));
  await screen.findByDisplayValue("New preset");
  fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Weekend" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preset", exact: true }));
  await screen.findByText("Preset draft saved. Your approved appearance has not changed.");
  expect(c.state.published).toBeNull();
  expect(c.state.revisions).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Submit preset for review", exact: true }));
  await screen.findByText("Preset submitted for review. The submitted snapshot cannot change.");
  expect(c.state.revisions).toHaveLength(1);
  expect(c.state.published).toBeNull();
});
test("a closed saved-preset dialog preserves the current edit", async () => {
  setup();
  await screen.findByRole("button", { name: "Browse saved presets" });
  fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Unsaved name" } });
  fireEvent.click(screen.getByRole("button", { name: "Browse saved presets" }));
  const dialog = await screen.findByRole("dialog", { name: "Saved presets" });
  (dialog as HTMLDialogElement).close();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect((screen.getByLabelText("Preset name") as HTMLInputElement).value).toBe("Unsaved name");
});
test("music priority is saved as a moderated preference without publishing live listening data", async () => {
  const c = setup();
  fireEvent.click(await screen.findByRole("tab", { name: "Music", exact: true }));
  fireEvent.change(screen.getByLabelText("Music priority"), { target: { value: "activity" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preset", exact: true }));
  await screen.findByText("Preset draft saved. Your approved appearance has not changed.");
  const save = c.transport.mock.calls.findLast((call) => call[2] === "PUT" && call[1].includes("/presets/"));
  expect(JSON.parse(save![3]!).config.musicPriority).toBe(true);
  expect(JSON.parse(save![3]!).config).not.toHaveProperty("liveMusic");
  expect(c.state.published).toBeNull();
});
