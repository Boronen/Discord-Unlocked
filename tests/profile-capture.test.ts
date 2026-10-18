// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createProfileCapture } from "../packages/plugin/profile-export.js";
const artwork = vi.hoisted(() => ({
  raster: vi.fn(async () => "data:image/webp;base64,fixture"),
  close: vi.fn(),
}));
vi.mock("../packages/plugin/export-artwork.js", () => ({
  ExportArtwork: class {
    raster = artwork.raster;
    close = artwork.close;
  },
}));
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function source() {
  vi.stubGlobal("SVGImageElement", class {});
  const root = document.createElement("article");
  root.innerHTML =
    '<div class="banner" style="background-image:url(https://cdn.discordapp.com/banner.gif)"></div><div class="scroller"><h2>Own Discord name</h2><p>Music presence</p><button>Edit profile</button><div class="ps-scene"><img src="https://cdn.discordapp.com/leaves.gif"></div></div><div data-ps-export-exclude>Export UI</div>';
  document.body.innerHTML = "<aside>Unrelated private message</aside>";
  document.body.append(root);
  Object.defineProperties(root, { offsetWidth: { value: 320 }, offsetHeight: { value: 900 } });
  const scroller = root.querySelector<HTMLElement>(".scroller")!;
  scroller.style.overflowY = "auto";
  Object.defineProperties(scroller, { clientHeight: { value: 300 }, scrollHeight: { value: 600 } });
  Object.defineProperty(root.querySelector("[data-ps-export-exclude]"), "offsetHeight", { value: 40 });
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
    pseudo ? ({ content: "none" } as CSSStyleDeclaration) : computed(element),
  );
  return root;
}

test("complete card capture retains native content/actions, expands its scroller and excludes surrounding Discord", async () => {
  const root = source();
  const capture = createProfileCapture(root, async () => "", true);
  const { svg } = await capture.snapshot(1250);
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(xml.querySelector("parsererror")).toBeNull();
  expect(xml.querySelector("button")?.textContent).toBe("Edit profile");
  expect(svg).toContain("Own Discord name");
  expect(svg).toContain("Music presence");
  expect(svg).not.toContain("Unrelated private message");
  expect(svg).not.toContain("Export UI");
  expect(xml.querySelector("article")?.getAttribute("style")).toContain("width: 320px");
  expect(xml.querySelector("article")?.getAttribute("style")).toContain("height: 1160px");
  expect(xml.querySelector(".scroller")?.getAttribute("style")).toContain("overflow: visible");
  expect(artwork.raster).toHaveBeenCalledWith(
    "https://cdn.discordapp.com/banner.gif",
    1250,
    expect.any(Number),
  );
  expect(artwork.raster).toHaveBeenCalledWith(
    "https://cdn.discordapp.com/leaves.gif",
    1250,
    expect.any(Number),
  );
  capture.close();
  expect(artwork.close).toHaveBeenCalledOnce();
});

test("CSS animation sample times are deterministic and original playback is restored", async () => {
  const root = source();
  const animation = { currentTime: 50, playState: "running", pause: vi.fn(), play: vi.fn() };
  root.getAnimations = () => [animation as unknown as Animation];
  const capture = createProfileCapture(root, async () => "", true);
  artwork.raster.mockImplementationOnce(async () => {
    expect(animation.currentTime).toBe(1300);
    return "data:image/webp;base64,fixture";
  });
  await capture.snapshot(1250);
  expect(animation.currentTime).toBe(50);
  expect(animation.play).toHaveBeenCalledOnce();
  artwork.raster.mockRejectedValueOnce(new Error("Decode failure"));
  await expect(capture.snapshot(2000)).rejects.toThrow("Decode failure");
  expect(animation.currentTime).toBe(50);
  expect(animation.play).toHaveBeenCalledTimes(2);
  capture.close();
});

test("native decoration tint definitions outside the card are included without external content", async () => {
  const root = source();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML =
    '<defs><filter id="native-tint"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter></defs>';
  document.body.append(svg);
  root.querySelector<HTMLElement>(".banner")!.style.filter = 'url("#native-tint")';
  const capture = createProfileCapture(root, async () => "", true);
  const sample = await capture.snapshot();
  expect(sample.svg).toContain('id="native-tint"');
  expect(
    new DOMParser().parseFromString(sample.svg, "image/svg+xml").querySelector("parsererror"),
  ).toBeNull();
  capture.close();
});
