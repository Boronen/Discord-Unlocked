// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MediaPicker, type VisualSlot } from "../packages/plugin/MediaPicker.js";
import { DEFAULT_CONFIG, type CatalogItem } from "../packages/plugin/model.js";
import type { StudioClient } from "../packages/plugin/client.js";

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
function setup({ slot = "nameplate", custom = false }: { slot?: VisualSlot; custom?: boolean } = {}) {
  const onUse = vi.fn(),
    onClose = vi.fn();
  const items: CatalogItem[] = ["Night Flight", "Witch Dust"].map((name, i) => ({
    id: `plate-${i}`,
    name,
    kind: slot === "effect" || slot === "decoration" ? slot : "nameplate",
    imageUrl: `https://cdn.discordapp.com/${i}.webm`,
    staticUrl: `https://cdn.discordapp.com/${i}.png`,
    discordAsset: null,
    layers: [],
  }));
  render(
    <MediaPicker
      slot={slot}
      config={DEFAULT_CONFIG}
      assets={[]}
      items={items}
      api={{ privateMedia: vi.fn(), subscribe: () => () => {} } as unknown as StudioClient}
      account={{ name: "Alice" }}
      reduced={false}
      canUseCustomTint={custom}
      onUse={onUse}
      onClose={onClose}
    />,
  );
  return { onUse, onClose };
}
test("gallery selection previews without changing draft; apply is explicit", () => {
  const { onUse } = setup();
  fireEvent.click(screen.getByRole("button", { name: /Night Flight.*Discord Shop/ }));
  expect(onUse).not.toHaveBeenCalled();
  const video = document.querySelector("video")!;
  expect(video.getAttribute("src")).toBe("https://cdn.discordapp.com/0.webm");
  expect(video.muted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use selection" }));
  expect(onUse).toHaveBeenCalledWith("discord:plate-0");
});

test("effect tint previews locally and is applied with the appearance, without tinting the avatar", () => {
  const { onUse } = setup({ slot: "effect", custom: true });
  fireEvent.click(screen.getByRole("button", { name: /Night Flight.*Discord Shop/ }));
  fireEvent.click(screen.getByRole("tab", { name: "Tint" }));
  fireEvent.click(screen.getByLabelText("Enable tint"));
  fireEvent.change(screen.getByLabelText("HEX color"), { target: { value: "#ff2244" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply custom color" }));
  expect(document.querySelectorAll("feColorMatrix")).toHaveLength(1);
  expect(onUse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Show original colors"));
  expect(document.querySelectorAll("feColorMatrix")).toHaveLength(0);
  fireEvent.click(screen.getByRole("tab", { name: "Appearances" }));
  expect(
    screen.getByRole("button", { name: /Night Flight.*Discord Shop/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Use selection" }));
  expect(onUse).toHaveBeenCalledWith("discord:plate-0", { color: "#ff2244", intensity: 0.6 });
});

test("decoration tint uses basic colors for normal members and cancel discards the candidate", () => {
  const { onUse, onClose } = setup({ slot: "decoration" });
  fireEvent.click(screen.getByRole("tab", { name: "Tint" }));
  fireEvent.click(screen.getByLabelText("Enable tint"));
  expect(
    screen.getByRole("group", { name: "Avatar decoration tint basic colors" }).querySelectorAll("button"),
  ).toHaveLength(28);
  expect(screen.queryByLabelText("HEX color")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onUse).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("picker tabs support arrow navigation and are absent for untinted layers", () => {
  setup({ slot: "effect" });
  const appearances = screen.getByRole("tab", { name: "Appearances" });
  fireEvent.keyDown(appearances, { key: "ArrowRight" });
  const tint = screen.getByRole("tab", { name: "Tint" });
  expect(document.activeElement).toBe(tint);
  expect(tint.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(tint, { key: "Home" });
  expect(document.activeElement).toBe(appearances);
  cleanup();
  setup();
  expect(screen.queryByRole("tab", { name: "Tint" })).toBeNull();
});
test("search, empty state, clear and cancel preserve current draft", () => {
  const { onUse, onClose } = setup();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matching product" } });
  expect(screen.getByText(/No matching appearances/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.getByRole("button", { name: /Night Flight.*Discord Shop/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onUse).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
test("uploaded banners use authenticated preview loading and recover after failure", async () => {
  const privateMedia = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue("blob:private-banner");
  const onUse = vi.fn();
  render(
    <MediaPicker
      slot="banner"
      config={DEFAULT_CONFIG}
      assets={[
        {
          id: "11111111-1111-4111-8111-111111111111",
          ownerId: "123",
          slot: "banner",
          status: "ready",
          mime: "image/gif",
          animated: true,
          duration: null,
          width: 400,
          height: 200,
          url: "/v1/media/private",
          previewUrl: "/v1/media/private/preview",
          error: null,
          createdAt: "2026-10-16T00:00:00Z",
        },
      ]}
      items={[]}
      account={{ name: "Alice" }}
      api={{ privateMedia, subscribe: () => () => {} } as unknown as StudioClient}
      reduced
      onUse={onUse}
      onClose={() => {}}
    />,
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Retry previews" }));
  await waitFor(() => expect(document.querySelector('img[src="blob:private-banner"]')).toBeTruthy());
  expect(privateMedia).toHaveBeenCalledWith("/v1/media/private/preview", expect.any(AbortSignal));
  expect(onUse).not.toHaveBeenCalled();
});
