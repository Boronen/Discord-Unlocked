// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PinnedPreview } from "../packages/plugin/PreviewFrame.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("preview follows the real scrollport across an overflow-hidden wrapper and cleans up listeners", () => {
  let scroll = 0,
    available = 600;
  let pending: FrameRequestCallback | undefined;
  const raf = vi.fn((callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.port
      ? 150
      : this.classList.contains("ps-preview-panel")
        ? 400 - scroll + Number.parseFloat(this.style.getPropertyValue("--ps-preview-offset") || "0")
        : 200 - scroll;
    return {
      top,
      bottom: top + (this.dataset.port ? available : 3000),
      left: 0,
      right: 650,
      width: 650,
      height: this.dataset.port ? available : 3000,
      x: 0,
      y: top,
      toJSON() {},
    };
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.port ? available : 3000;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return Math.min(500, Number.parseFloat(this.style.getPropertyValue("--ps-preview-height") || "500"));
  });
  const view = render(
    <div data-port="true" style={{ overflowY: "auto" }}>
      <div style={{ overflowY: "hidden" }}>
        <div className="ps-editor-layout">
          <form />
          <PinnedPreview>
            <p>Live preview</p>
          </PinnedPreview>
        </div>
      </div>
    </div>,
  );
  const panel = view.container.querySelector<HTMLElement>(".ps-preview-panel")!;
  const port = view.container.querySelector<HTMLElement>("[data-port]")!;
  const flush = () =>
    act(() => {
      const callback = pending;
      pending = undefined;
      callback?.(0);
    });
  expect(panel.style.getPropertyValue("--ps-preview-offset")).toBe("0px");
  expect(panel.style.getPropertyValue("--ps-preview-height")).toBe("338px");
  scroll = 500;
  port.dispatchEvent(new Event("scroll"));
  flush();
  expect(panel.getBoundingClientRect().top).toBe(162);
  expect(panel.style.getPropertyValue("--ps-preview-height")).toBe("576px");
  available = 300;
  window.dispatchEvent(new Event("resize"));
  flush();
  expect(panel.style.getPropertyValue("--ps-preview-height")).toBe("276px");
  scroll = 0;
  port.dispatchEvent(new Event("scroll"));
  flush();
  expect(panel.style.getPropertyValue("--ps-preview-offset")).toBe("0px");
  view.unmount();
  raf.mockClear();
  window.dispatchEvent(new Event("scroll"));
  expect(raf).not.toHaveBeenCalled();
});
