// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoverProfiles } from "../packages/plugin/hover-profiles.js";
let hover: HoverProfiles;
const id = "100000000000000002";
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  hover?.stop();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function setup() {
  const row = document.createElement("div");
  row.className = "member_test";
  row.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${id}/avatar.png?ps-user=${id}"/><span>Alice</span>`;
  document.body.append(row);
  const open = vi.fn();
  let enabled = true;
  hover = new HoverProfiles(
    () => enabled,
    () => 4000,
    open,
  );
  hover.start();
  return {
    row,
    open,
    disable: () => {
      enabled = false;
    },
  };
}
function over(row: Element) {
  row.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
}
test("a stable hover opens exactly once after four seconds, including movement inside a row", async () => {
  const { row, open } = setup();
  over(row);
  await vi.advanceTimersByTimeAsync(3000);
  expect(open).not.toHaveBeenCalled();
  row
    .querySelector("img")!
    .dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: row.querySelector("span") }));
  over(row.querySelector("span")!);
  await vi.advanceTimersByTimeAsync(1000);
  expect(open).toHaveBeenCalledExactlyOnceWith(id, row);
  over(row);
  await vi.advanceTimersByTimeAsync(5000);
  expect(open).toHaveBeenCalledTimes(1);
});
test.each(["leave", "click", "escape", "scroll", "stop", "disabled", "recycled", "modal"])(
  "%s cancels or invalidates the pending hover",
  async (reason) => {
    const { row, open, disable } = setup();
    over(row);
    if (reason === "leave") row.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    if (reason === "click") row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    if (reason === "escape")
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (reason === "scroll") document.dispatchEvent(new Event("scroll"));
    if (reason === "stop") hover.stop();
    if (reason === "disabled") disable();
    if (reason === "recycled")
      row.querySelector("img")!.src = "https://cdn.discordapp.com/embed/avatars/0.png";
    if (reason === "modal") {
      const modal = document.createElement("div");
      modal.setAttribute("role", "dialog");
      document.body.append(modal);
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(open).not.toHaveBeenCalled();
  },
);
