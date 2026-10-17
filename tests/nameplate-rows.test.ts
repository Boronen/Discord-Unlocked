// @vitest-environment jsdom
import { test, expect, vi } from "vitest";
import { NameplateRows } from "../packages/plugin/nameplates.js";
import type { CatalogItem } from "../packages/plugin/model.js";

test("recycled DM rows discard previous nameplates, release subscriptions and clean up on stop", () => {
  let pending: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const flush = () => {
    const next = pending;
    pending = undefined;
    next?.(0);
  };
  const row = document.createElement("div");
  row.dataset.listItemId = "private-channels-123";
  const image = document.createElement("img");
  image.src = "https://cdn.discordapp.com/avatar.png?ps-user=100000000000000001";
  row.append(image);
  document.body.append(row);
  const item: CatalogItem = {
    id: "plate",
    kind: "nameplate",
    name: "Night",
    imageUrl: "https://cdn.discordapp.com/plate.webm",
    staticUrl: "https://cdn.discordapp.com/plate.png",
    discordAsset: null,
    layers: [],
  };
  const disposed = vi.fn();
  const manager = new NameplateRows(
    (id) => (id.endsWith("1") ? item : undefined),
    () => disposed,
    () => true,
  );
  try {
    manager.start();
    flush();
    expect(row.querySelector(".ps-row-nameplate")?.getAttribute("src")).toBe(item.staticUrl);
    image.src = "https://cdn.discordapp.com/avatar.png?ps-user=100000000000000002";
    manager.refresh();
    flush();
    expect(row.querySelector(".ps-row-nameplate")).toBeNull();
    expect(row.classList.contains("ps-nameplate-host")).toBe(false);
    expect(disposed).toHaveBeenCalledOnce();
  } finally {
    manager.stop();
    row.remove();
    vi.unstubAllGlobals();
  }
  expect(disposed).toHaveBeenCalledTimes(2);
});
