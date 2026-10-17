import { afterEach, expect, test, vi } from "vitest";

vi.mock("../packages/plugin/settings.js", () => ({
  settings: {
    def: { apiUrl: { default: "http://localhost:3100" } },
    get store() {
      throw new Error("Cannot access settings before plugin is initialized");
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("runtime loads before Vencord initializes plugin settings without requests", async () => {
  const request = vi.fn();
  vi.stubGlobal("VencordNative", { pluginHelpers: { ProfileStudio: { request } } });
  const runtime = await import("../packages/plugin/runtime.js");
  expect(runtime.client.base).toBe("http://localhost:3100");
  expect(runtime.active).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
