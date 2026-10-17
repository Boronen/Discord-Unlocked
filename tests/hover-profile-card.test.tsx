// @vitest-environment jsdom
import React from "react";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { HoverProfileCard, type NativeHoverCardProps } from "../packages/plugin/HoverProfileCard.js";
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
function setup() {
  const id = "100000000000000002";
  const anchor = document.createElement("div");
  anchor.className = "member_test";
  anchor.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${id}/a.png">`;
  document.body.append(anchor);
  const native = vi.fn((_props: NativeHoverCardProps) => <div role="dialog">Native small card</div>);
  const close = vi.fn();
  const view = render(
    <HoverProfileCard
      id={id}
      anchor={anchor}
      guildId="guild"
      channelId="channel"
      component={native}
      onClose={close}
    />,
  );
  return { id, anchor, native, close, view };
}
test("uses the native small-card wrapper anchored to the original row without a focus trap", () => {
  const { id, anchor, native, close } = setup();
  const props = native.mock.calls[0]![0];
  expect(props.userId).toBe(id);
  expect(props.targetElementRef.current).toBe(anchor);
  expect(props).toMatchObject({
    shouldShow: true,
    fixed: true,
    position: "right",
    align: "top",
    clickTrap: false,
    scrollBehavior: "close",
    guildId: "guild",
    channelId: "channel",
  });
  expect(props.children()).toBeNull();
  expect(props.onRequestClose).toBe(close);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
test.each(["removed", "recycled"])("closes when the source row is %s", async (mode) => {
  const { anchor, close } = setup();
  if (mode === "removed") anchor.remove();
  else anchor.querySelector("img")!.src = "https://cdn.discordapp.com/avatars/100000000000000003/b.png";
  await waitFor(() => expect(close).toHaveBeenCalled());
});
test("removes its Escape listener on unmount", () => {
  const { view, close } = setup();
  view.unmount();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
});
