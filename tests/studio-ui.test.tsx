// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudioField, StudioChoice, StudioSearch, StudioTabs } from "../packages/plugin/studio-controls.js";
import { Notice } from "../packages/plugin/studio-notice.js";
import { usePanelQuery } from "../packages/plugin/usePanelQuery.js";
import { StudioClient } from "../packages/plugin/client.js";
import { LibraryPanel } from "../packages/plugin/community/library-panel.js";
import { DEFAULT_CONFIG, type EditorState, type MediaAsset } from "../packages/plugin/model.js";
import {
  EMPTY_LIBRARY,
  normalizeStudio,
  type WorkspaceState,
  type Preset,
} from "../packages/plugin/studio-model.js";
import type { CommunityProps } from "../packages/plugin/community/types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("shared fields associate help/errors with native and shared controls and focus committed errors", () => {
  render(
    <>
      <StudioField id="native" label="Name" help="A short name" error="Enter a name">
        <input />
      </StudioField>
      <StudioField id="choice" label="Mode" help="Choose one">
        <StudioChoice id="choice" value="a" onChange={() => {}} options={[{ value: "a", label: "A" }]} />
      </StudioField>
      <Notice error focus>
        Save failed. Your draft is preserved.
      </Notice>
    </>,
  );
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe("native-help native-error");
  expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Mode").getAttribute("aria-describedby")).toBe("choice-help");
  expect(document.activeElement).toBe(screen.getByRole("alert"));
});

test("manual section tabs move focus without fetching/activating until selected; picker tabs activate automatically", () => {
  const change = vi.fn(),
    options = [
      { value: "a", label: "Appearance" },
      { value: "b", label: "Library" },
    ];
  const { rerender } = render(
    <StudioTabs id="sections" label="Sections" value="a" options={options} onChange={change} />,
  );
  const a = screen.getByRole("tab", { name: "Appearance" }),
    b = screen.getByRole("tab", { name: "Library" });
  fireEvent.keyDown(a, { key: "ArrowRight" });
  expect(document.activeElement).toBe(b);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(b);
  expect(change).toHaveBeenCalledWith("b");
  rerender(
    <StudioTabs id="sections" label="Sections" value="a" options={options} onChange={change} automatic />,
  );
  change.mockClear();
  fireEvent.keyDown(a, { key: "End" });
  expect(change).toHaveBeenCalledWith("b");
  expect(b.getAttribute("aria-controls")).toBe("sections-panel");
  change.mockClear();
  fireEvent.keyDown(a, { key: "ArrowRight", isComposing: true });
  expect(change).not.toHaveBeenCalled();
});

test("search clear updates immediately and restores input focus", () => {
  function Fixture() {
    const [value, setValue] = React.useState("portrait");
    return (
      <StudioField id="search" label="Search">
        <StudioSearch id="search" label="media search" value={value} onChange={setValue} />
      </StudioField>
    );
  }
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Clear media search" }));
  const input = screen.getByRole("searchbox") as HTMLInputElement;
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
});

test("panel reads keep data on refresh failure and reject stale or access-lost responses", async () => {
  let finish!: (value: { status: number; body: string }) => void;
  const transport = vi.fn(
    () =>
      new Promise<{ status: number; body: string }>((done) => {
        finish = done;
      }),
  );
  const api = new StudioClient("http://localhost:3100", transport);
  api.token = "test";
  api.accessAllowed = true;
  function Fixture({ path }: { path: string }) {
    const query = usePanelQuery<{ label: string }>(api, path);
    return (
      <>
        <output>{query.data?.label ?? "No data"}</output>
        <span>{query.loading ? "Loading" : query.error || "Ready"}</span>
        <button onClick={() => void query.refresh()}>Refresh</button>
      </>
    );
  }
  const { rerender, unmount } = render(<Fixture path="/first" />);
  await act(async () => finish({ status: 200, body: '{"label":"First"}' }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await act(async () => finish({ status: 503, body: '{"message":"Unavailable"}' }));
  expect(screen.getByText("First")).toBeTruthy();
  expect(screen.getByText("Unavailable")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const stale = finish;
  rerender(<Fixture path="/second" />);
  await act(async () => stale({ status: 200, body: '{"label":"Stale"}' }));
  expect(screen.queryByText("Stale")).toBeNull();
  await act(async () => finish({ status: 200, body: '{"label":"Second"}' }));
  expect(screen.getByText("Second")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  act(() => api.disconnect());
  await act(async () => finish({ status: 200, body: '{"label":"After logout"}' }));
  expect(screen.getByText("No data")).toBeTruthy();
  expect(screen.queryByText("After logout")).toBeNull();
  unmount();
});

test("media pagination uses filtered results, resets on search and clamps after removal", async () => {
  const assets: MediaAsset[] = Array.from({ length: 17 }, (_, i) => ({
    id: `media-${i}`,
    userId: "member",
    slot: "avatar",
    status: "ready",
    url: `media:${i}`,
    previewUrl: null,
    createdAt: "2026-01-01",
    bytes: 1,
  })) as MediaAsset[];
  const state = { assets } as EditorState;
  const config = normalizeStudio(DEFAULT_CONFIG);
  const preset = { id: "preset", name: "Profile", draft: config } as Preset;
  const workspace = {
    library: structuredClone(EMPTY_LIBRARY),
    capacity: 5,
    mediaMetadata: Object.fromEntries(
      assets.map((a, i) => [a.id, { label: `Portrait ${i}`, tags: [], folder: i === 16 ? "Last" : "Main" }]),
    ),
    usage: {},
  } as WorkspaceState;
  const api = {
    subscribe: () => () => {},
    privateMedia: vi.fn(async () => "blob:fixture"),
  } as unknown as StudioClient;
  const props = {
    api,
    state,
    workspace,
    preset,
    config,
    items: [],
    account: { id: "member", name: "Member" },
    urls: {},
    reduced: true,
    onRun: async (task: () => Promise<void>) => task(),
    onMessage: () => {},
    onRefresh: async () => {},
    onLibrary: async () => {},
    onSelectPreset: async () => {},
    onConfirm: () => {},
    tab: "library",
  } satisfies CommunityProps;
  const { rerender } = render(<LibraryPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Next media" }));
  expect(screen.getByText("Media page 2 of 3")).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Portrait 16" } });
  expect(screen.getByText("Media page 1 of 1")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Next media" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Portrait 16");
  fireEvent.click(screen.getByRole("button", { name: "Clear media search" }));
  fireEvent.click(screen.getByRole("button", { name: "Next media" }));
  rerender(<LibraryPanel {...props} state={{ ...state, assets: assets.slice(0, 2) }} />);
  await waitFor(() => expect(screen.getByText("Media page 1 of 1")).toBeTruthy());
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
  expect(screen.getByText("No matching media")).toBeTruthy();
});
