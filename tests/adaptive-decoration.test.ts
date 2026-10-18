// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { DecorationTints } from "../packages/plugin/decoration-tints.js";

test("native decoration follows its own profile cover and restores its saved tint", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const root = document.createElement("div");
  root.dataset.psMusicTint = "2255dd";
  const image = root.appendChild(document.createElement("img"));
  image.className = "avatarDecoration_test";
  image.src = "https://cdn.discordapp.com/test.png#ps-tint=dd3344-50";
  const avatar = root.appendChild(document.createElement("img"));
  avatar.className = "avatar_test";
  avatar.src = "https://cdn.discordapp.com/avatar.png";
  document.body.append(root);
  const tints = new DecorationTints();
  const flush = async () => {
    await Promise.resolve();
    frames.splice(0).forEach((callback) => callback(0));
  };
  try {
    tints.start();
    await flush();
    expect(image.style.filter).toContain("2255dd-80");
    expect(avatar.style.filter).toBe("");
    root.dataset.psMusicTint = "22dd55";
    await flush();
    expect(image.style.filter).toContain("22dd55-80");
    delete root.dataset.psMusicTint;
    await flush();
    expect(image.style.filter).toContain("dd3344-50");
    tints.stop();
    expect(image.style.filter).toBe("");
    expect(document.querySelectorAll(".ps-filter-definitions")).toHaveLength(0);
  } finally {
    tints.stop();
    root.remove();
    vi.unstubAllGlobals();
  }
});
