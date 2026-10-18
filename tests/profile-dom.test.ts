// @vitest-environment jsdom
import { expect, test } from "vitest";
import {
  applyProfileColors,
  applyProfileReadability,
  profileRoot,
  tagAvatarSource,
} from "../packages/plugin/profile-dom.js";

test("tags default avatars so asynchronous approved media can repaint them", () => {
  const original = "https://cdn.discordapp.com/embed/avatars/0.png?size=128";
  const tagged = new URL(tagAvatarSource(original, "100000000000000001"));
  expect(tagged.searchParams.get("ps-user")).toBe("100000000000000001");
  expect(tagged.searchParams.get("size")).toBe("128");
  expect(tagAvatarSource("blob:https://discord.com/approved", "123")).toBe(
    "blob:https://discord.com/approved#ps-user=123",
  );
  expect(tagAvatarSource("data:image/png;base64,AAAA", "123")).toBe("data:image/png;base64,AAAA");
});

test("profile text roles are local to the card and restore their original priority", () => {
  const root = document.createElement("div");
  root.style.setProperty("--text-normal", "#252525", "important");
  const restore = applyProfileReadability(root, ["#101014", "#202f33"]);
  expect(root.style.getPropertyValue("--text-normal")).toBe("#ffffff");
  expect(root.style.getPropertyValue("--ps-profile-surface")).toMatch(/^#[a-f\d]{6}$/);
  restore();
  expect(root.style.getPropertyValue("--text-normal")).toBe("#252525");
  expect(root.style.getPropertyPriority("--text-normal")).toBe("important");
  expect(root.style.getPropertyValue("--ps-profile-surface")).toBe("");
});

test("applies approved colors to a mounted profile and restores only owned properties", () => {
  const root = document.createElement("div");
  root.className = "outer_test";
  root.getBoundingClientRect = () => ({ width: 300 }) as DOMRect;
  root.style.setProperty("--profile-gradient-primary-color", "#ffffff");
  root.style.setProperty("padding", "8px");
  const anchor = root.appendChild(document.createElement("span"));
  expect(profileRoot(anchor)).toBe(root);
  const restore = applyProfileColors(root, ["#26344a", "#161a2b"]);
  expect(root.style.getPropertyValue("--profile-gradient-primary-color")).toBe("#26344a");
  expect(root.style.getPropertyValue("--profile-gradient-secondary-color")).toBe("#161a2b");
  root.style.setProperty("padding", "12px");
  restore();
  expect(root.style.getPropertyValue("--profile-gradient-primary-color")).toBe("#ffffff");
  expect(root.style.getPropertyValue("--profile-gradient-secondary-color")).toBe("");
  expect(root.style.padding).toBe("12px");
});

test("artwork colors replace inner Discord theme owners and restore them on track change/unmount", () => {
  const root = document.createElement("div"),
    inner = root.appendChild(document.createElement("div"));
  inner.style.setProperty("--profile-gradient-primary-color", "#ff0000", "important");
  inner.style.setProperty("--profile-gradient-button-color", "#aa0000");
  inner.style.setProperty("padding", "6px");
  const unrelated = root.appendChild(document.createElement("span"));
  unrelated.style.color = "red";
  const outside = document.createElement("div");
  outside.style.setProperty("--profile-gradient-primary-color", "#ff0000");
  const restore = applyProfileColors(root, ["#102040", "#8844ee"]);
  expect(inner.style.getPropertyValue("--profile-gradient-primary-color")).toBe("#102040");
  expect(inner.style.getPropertyValue("--profile-gradient-button-color")).not.toBe("#aa0000");
  expect(outside.style.getPropertyValue("--profile-gradient-primary-color")).toBe("#ff0000");
  expect(unrelated.style.color).toBe("red");
  restore();
  expect(inner.style.getPropertyValue("--profile-gradient-primary-color")).toBe("#ff0000");
  expect(inner.style.getPropertyPriority("--profile-gradient-primary-color")).toBe("important");
  expect(inner.style.getPropertyValue("--profile-gradient-button-color")).toBe("#aa0000");
  expect(inner.style.padding).toBe("6px");
  expect(inner.style.getPropertyValue("--profile-body-background-color")).toBe("");
});

test("transparent banners keep their image while the backing color follows artwork", () => {
  const root = document.createElement("div");
  const banner = root.appendChild(document.createElement("div"));
  banner.className = "banner_test";
  banner.style.backgroundImage = 'url("transparent.gif")';
  banner.style.setProperty("background-color", "red", "important");
  const restore = applyProfileColors(root, ["#123456", "#abcdef"]);
  expect(banner.style.backgroundColor).toBe("rgb(18, 52, 86)");
  expect(banner.style.backgroundImage).toContain("transparent.gif");
  restore();
  expect(banner.style.backgroundColor).toBe("red");
  expect(banner.style.getPropertyPriority("background-color")).toBe("important");
});
