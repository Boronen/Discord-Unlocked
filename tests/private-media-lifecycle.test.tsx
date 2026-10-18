// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { usePrivateMedia } from "../packages/plugin/usePrivateMedia.js";
import type { StudioClient } from "../packages/plugin/client.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test("displayed media is leased until replacement commits; abandoned requests and unmount release ownership", async () => {
  const calls: { signal: AbortSignal; finish: (url: string) => void }[] = [];
  const api = {
    subscribe: () => () => {},
    privateMedia: vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise<string>((finish) => {
          calls.push({ signal, finish });
        }),
    ),
  } as unknown as StudioClient;
  function Fixture({ source }: { source: string }) {
    const { urls } = usePrivateMedia(api, [["image", source]]);
    return <output>{urls.image ?? "loading"}</output>;
  }
  const { rerender, unmount } = render(<Fixture source="first" />);
  await act(async () => {
    calls[0].finish("blob:first");
  });
  expect(screen.getByText("blob:first")).toBeTruthy();
  rerender(<Fixture source="abandoned" />);
  expect(calls[0].signal.aborted).toBe(false);
  rerender(<Fixture source="last" />);
  expect(calls[1].signal.aborted).toBe(true);
  await act(async () => {
    calls[1].finish("blob:stale");
  });
  expect(screen.getByText("blob:first")).toBeTruthy();
  await act(async () => {
    calls[2].finish("blob:last");
  });
  expect(screen.getByText("blob:last")).toBeTruthy();
  expect(calls[0].signal.aborted).toBe(true);
  expect(calls[2].signal.aborted).toBe(false);
  unmount();
  expect(calls.every((c) => c.signal.aborted)).toBe(true);
});

test("access loss clears rendered URLs and a late result cannot restore them", async () => {
  let notify!: () => void, finish!: (url: string) => void;
  const api = {
    canView: true,
    subscribe: (cb: () => void) => {
      notify = cb;
      return () => {};
    },
    privateMedia: vi.fn(
      () =>
        new Promise<string>((done) => {
          finish = done;
        }),
    ),
  };
  function Fixture() {
    const { urls } = usePrivateMedia(api as unknown as StudioClient, [["image", "private"]]);
    return <output>{urls.image ?? "empty"}</output>;
  }
  render(<Fixture />);
  act(() => {
    api.canView = false;
    notify();
  });
  await act(async () => {
    finish("blob:stale");
  });
  expect(screen.getByText("empty")).toBeTruthy();
  expect(screen.queryByText("blob:stale")).toBeNull();
});
